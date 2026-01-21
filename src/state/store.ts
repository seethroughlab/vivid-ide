// =============================================================================
// Centralized State Management
// =============================================================================

import type {
  AppState,
  LayoutState,
  VividInitializedPayload,
  CompileStatusPayload,
  OperatorSelectedPayload,
} from "../types";
import { listen } from "../api/tauri";
import * as vivid from "../api/vivid";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

// Storage key for persistent layout
const LAYOUT_STORAGE_KEY = "vivid-ide-layout";
const WINDOW_SIZE_STORAGE_KEY = "vivid-ide-window-size";

interface WindowSize {
  width: number;
  height: number;
}

// =============================================================================
// State Store
// =============================================================================

type StateListener = (state: AppState) => void;
type StateKey = keyof AppState;

class Store {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();
  private keyListeners: Map<StateKey, Set<StateListener>> = new Map();
  private unlistenFns: UnlistenFn[] = [];

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): AppState {
    return {
      // Project state
      projectPath: null,
      chainPath: null,
      projectLoaded: false,

      // Vivid state
      vividReady: false,
      operators: [],
      selectedOperator: null,
      selectedOperatorParams: [],

      // Compile state
      compileStatus: {
        success: true,
        message: null,
        error_line: null,
        error_column: null,
      },

      // Performance state
      performanceStats: {
        fps: 0,
        frame_time_ms: 0,
        fps_history: [],
        frame_time_history: [],
        memory_history: [],
        texture_memory_bytes: 0,
        operator_count: 0,
      },

      // Editor state
      currentFilePath: null,
      isModified: false,

      // Layout state
      layout: this.loadLayout(),
    };
  }

  // --- State Access ---

  get(): AppState {
    return this.state;
  }

  getKey<K extends StateKey>(key: K): AppState[K] {
    return this.state[key];
  }

  // --- State Updates ---

  set(partial: Partial<AppState>): void {
    const changedKeys = new Set<StateKey>();

    for (const key of Object.keys(partial) as StateKey[]) {
      if (this.state[key] !== partial[key]) {
        changedKeys.add(key);
      }
    }

    this.state = { ...this.state, ...partial };

    // Notify listeners
    this.notifyListeners(changedKeys);
  }

  private notifyListeners(changedKeys: Set<StateKey>): void {
    // Notify global listeners
    for (const listener of this.listeners) {
      listener(this.state);
    }

    // Notify key-specific listeners
    for (const key of changedKeys) {
      const keyListeners = this.keyListeners.get(key);
      if (keyListeners) {
        for (const listener of keyListeners) {
          listener(this.state);
        }
      }
    }
  }

  // --- Subscriptions ---

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeToKey(key: StateKey, listener: StateListener): () => void {
    if (!this.keyListeners.has(key)) {
      this.keyListeners.set(key, new Set());
    }
    this.keyListeners.get(key)!.add(listener);
    return () => this.keyListeners.get(key)?.delete(listener);
  }

  // --- Layout Persistence ---

  private loadLayout(): LayoutState {
    try {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("[Store] Failed to load layout:", e);
    }
    return {
      terminalCollapsed: false,
      inspectorCollapsed: false,
      editorCollapsed: false,
    };
  }

  saveLayout(): void {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(this.state.layout));
    } catch (e) {
      console.error("[Store] Failed to save layout:", e);
    }
  }

  updateLayout(partial: Partial<LayoutState>): void {
    this.set({
      layout: { ...this.state.layout, ...partial },
    });
    this.saveLayout();
  }

  // --- Window Size Persistence ---

  private resizeDebounceTimer: number | null = null;

  private loadWindowSize(): WindowSize | null {
    try {
      const stored = localStorage.getItem(WINDOW_SIZE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.width === "number" && typeof parsed.height === "number") {
          return parsed;
        }
      }
    } catch (e) {
      console.error("[Store] Failed to load window size:", e);
    }
    return null;
  }

  private saveWindowSize(width: number, height: number): void {
    try {
      localStorage.setItem(
        WINDOW_SIZE_STORAGE_KEY,
        JSON.stringify({ width, height })
      );
    } catch (e) {
      console.error("[Store] Failed to save window size:", e);
    }
  }

  async initWindowSize(): Promise<void> {
    const saved = this.loadWindowSize();
    if (saved) {
      // Clamp to available screen dimensions
      const finalWidth = Math.min(saved.width, window.screen.availWidth);
      const finalHeight = Math.min(saved.height, window.screen.availHeight);

      try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(finalWidth, finalHeight));
        console.log(`[Store] Restored window size: ${finalWidth}x${finalHeight}`);
      } catch (e) {
        console.error("[Store] Failed to restore window size:", e);
      }
    }

    // Setup resize listener
    this.setupWindowResizeListener();
  }

  private setupWindowResizeListener(): void {
    getCurrentWindow()
      .onResized(({ payload: size }) => {
        // Debounce saving to avoid excessive writes during resize
        if (this.resizeDebounceTimer !== null) {
          clearTimeout(this.resizeDebounceTimer);
        }
        this.resizeDebounceTimer = window.setTimeout(() => {
          this.saveWindowSize(size.width, size.height);
          console.log(`[Store] Saved window size: ${size.width}x${size.height}`);
        }, 500);
      })
      .catch((e) => {
        console.error("[Store] Failed to setup resize listener:", e);
      });
  }

  // --- Event Subscriptions ---

  async setupEventListeners(): Promise<void> {
    console.log("[Store] Setting up Tauri event listeners...");

    // Vivid initialized event
    const unlistenInit = await listen<VividInitializedPayload>(
      "vivid-initialized",
      (payload) => {
        console.log("[Store] vivid-initialized event:", payload);
        this.set({
          vividReady: payload.success,
          projectLoaded: payload.project_loaded,
          projectPath: payload.project_path,
          chainPath: payload.project_path ? `${payload.project_path}/chain.cpp` : null,
        });
      }
    );
    this.unlistenFns.push(unlistenInit);

    // Project loaded event
    const unlistenProject = await listen<VividInitializedPayload>(
      "vivid-project-loaded",
      (payload) => {
        console.log("[Store] vivid-project-loaded event:", payload);
        this.set({
          projectLoaded: payload.project_loaded,
          projectPath: payload.project_path,
          chainPath: payload.project_path ? `${payload.project_path}/chain.cpp` : null,
        });
        // Refresh operators when project loads
        this.refreshOperators();
      }
    );
    this.unlistenFns.push(unlistenProject);

    // Compile status event
    const unlistenCompile = await listen<CompileStatusPayload>(
      "vivid-compile-status",
      (payload) => {
        console.log("[Store] vivid-compile-status event:", payload);
        this.set({
          compileStatus: {
            success: payload.success,
            message: payload.message,
            error_line: payload.error_line,
            error_column: payload.error_column,
          },
        });
        // Refresh operators on recompile
        if (payload.success) {
          this.refreshOperators();
        }
      }
    );
    this.unlistenFns.push(unlistenCompile);

    // Operator selection event
    const unlistenSelection = await listen<OperatorSelectedPayload>(
      "vivid-operator-selected",
      (payload) => {
        console.log("[Store] vivid-operator-selected event:", payload);
        this.handleOperatorSelected(payload.name);
      }
    );
    this.unlistenFns.push(unlistenSelection);

    console.log("[Store] Event listeners ready");
  }

  cleanup(): void {
    for (const unlisten of this.unlistenFns) {
      unlisten();
    }
    this.unlistenFns = [];
  }

  // --- Actions ---

  async initialize(): Promise<void> {
    console.log("[Store] Initializing...");

    // Setup event listeners first
    await this.setupEventListeners();

    // Wait for vivid to be ready (with timeout)
    const startTime = Date.now();
    const timeout = 3000; // 3 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const ready = await vivid.isVividReady();
        if (ready) {
          console.log("[Store] Vivid is ready");
          this.set({ vividReady: true });
          break;
        }
      } catch (e) {
        // Ignore errors during polling
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Load initial state if vivid is ready
    if (this.state.vividReady) {
      await this.refreshAll();
    }

    // Start background polling for compile status and selection sync
    // (Fallback for when events don't fire)
    this.startPolling();
  }

  private pollingInterval: number | null = null;

  private startPolling(): void {
    // Poll every 2 seconds for state that might not have events
    this.pollingInterval = window.setInterval(async () => {
      if (!this.state.vividReady) {
        // Check if vivid became ready
        try {
          const ready = await vivid.isVividReady();
          if (ready) {
            this.set({ vividReady: true });
            await this.refreshAll();
          }
        } catch {
          // Ignore
        }
        return;
      }

      // Sync compile status
      try {
        const status = await vivid.getCompileStatus();
        if (
          status.success !== this.state.compileStatus.success ||
          status.message !== this.state.compileStatus.message
        ) {
          this.set({ compileStatus: status });
        }
      } catch {
        // Ignore
      }

      // Sync selected operator from visualizer
      try {
        const selected = await vivid.getSelectedOperator();
        if (selected !== this.state.selectedOperator) {
          this.handleOperatorSelected(selected);
        }
      } catch {
        // Ignore
      }
    }, 2000);
  }

  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.perfPollingInterval !== null) {
      clearInterval(this.perfPollingInterval);
      this.perfPollingInterval = null;
    }
  }

  private perfPollingInterval: number | null = null;

  startPerformancePolling(): void {
    // Poll performance stats every 500ms for smooth graphs
    this.perfPollingInterval = window.setInterval(async () => {
      if (this.state.vividReady) {
        await this.refreshPerformanceStats();
      }
    }, 500);
  }

  stopPerformancePolling(): void {
    if (this.perfPollingInterval !== null) {
      clearInterval(this.perfPollingInterval);
      this.perfPollingInterval = null;
    }
  }

  async refreshAll(): Promise<void> {
    console.log("[Store] Refreshing all state...");

    try {
      // Get project info
      const projectInfo = await vivid.getProjectInfo();
      this.set({
        projectLoaded: projectInfo.loaded,
        projectPath: projectInfo.project_path,
        chainPath: projectInfo.chain_path,
      });

      // Get operators
      await this.refreshOperators();

      // Get compile status
      const compileStatus = await vivid.getCompileStatus();
      this.set({ compileStatus });

      // Sync selected operator
      const selected = await vivid.getSelectedOperator();
      if (selected) {
        await this.handleOperatorSelected(selected);
      }
    } catch (e) {
      console.error("[Store] Failed to refresh state:", e);
    }
  }

  async refreshOperators(): Promise<void> {
    try {
      const operators = await vivid.getOperators();
      this.set({ operators });
      console.log("[Store] Refreshed operators:", operators.length);
    } catch (e) {
      console.error("[Store] Failed to refresh operators:", e);
    }
  }

  async refreshPerformanceStats(): Promise<void> {
    try {
      const stats = await vivid.getPerformanceStats();
      this.set({ performanceStats: stats });
    } catch (e) {
      // Silently ignore - performance stats may not be available yet
    }
  }

  async handleOperatorSelected(name: string | null): Promise<void> {
    if (name === this.state.selectedOperator) {
      return;
    }

    this.set({ selectedOperator: name });

    if (name) {
      try {
        const params = await vivid.getOperatorParams(name);
        this.set({ selectedOperatorParams: params });
      } catch (e) {
        console.error("[Store] Failed to get operator params:", e);
        this.set({ selectedOperatorParams: [] });
      }
    } else {
      this.set({ selectedOperatorParams: [] });
    }
  }

  async selectOperator(name: string): Promise<void> {
    await this.handleOperatorSelected(name);

    // Tell vivid to select the operator
    try {
      await vivid.selectOperator(name);
    } catch (e) {
      console.error("[Store] Failed to select operator in vivid:", e);
    }
  }

  setEditorState(filePath: string | null, isModified: boolean): void {
    this.set({
      currentFilePath: filePath,
      isModified,
    });
  }

  setModified(isModified: boolean): void {
    this.set({ isModified });
  }
}

// Export singleton instance
export const store = new Store();

// Export convenience functions
export const getState = () => store.get();
export const subscribe = (listener: StateListener) => store.subscribe(listener);
export const subscribeToKey = (key: StateKey, listener: StateListener) =>
  store.subscribeToKey(key, listener);
