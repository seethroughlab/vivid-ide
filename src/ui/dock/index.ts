// =============================================================================
// DockManager - dock-spawn-ts based Panel Layout Manager
// =============================================================================

import { DockManager as DockSpawnManager, PanelContainer, DockNode } from "dock-spawn-ts/lib/js/index.js";
import "dock-spawn-ts/lib/css/dock-manager.css";
import "./theme.css";

import {
  createTerminalPanel,
  createEditorPanel,
  createInspectorPanel,
  createConsolePanel,
} from "./panels";

// Re-export panel utilities
export {
  loadFile,
  openFile,
  saveFile,
  highlightError,
  clearErrors,
  jumpToLine,
  goToLine,
  layoutEditor,
  getEditor,
  fitTerminal,
  focusTerminal,
  getTerminal,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  clearConsole,
} from "./panels";

// Storage key for layout persistence
const LAYOUT_STORAGE_KEY = "vivid-ide-dock-spawn-layout";

// Panel types
type PanelId = "terminal" | "editor" | "inspector" | "console";

// Panel configuration
const PANEL_CONFIG: Record<PanelId, { title: string; icon?: string }> = {
  terminal: { title: "Claude Code" },
  editor: { title: "Editor" },
  console: { title: "Output" },
  inspector: { title: "Parameters" },
};

// =============================================================================
// DockManager Class
// =============================================================================

export class DockManager {
  private dockManager: DockSpawnManager | null = null;
  private panels: Map<PanelId, PanelContainer> = new Map();
  private panelElements: Map<PanelId, HTMLElement> = new Map();
  private nodes: Map<PanelId, DockNode> = new Map();
  private saveDebounceTimer: number | null = null;

  /**
   * Initialize the dock manager with a container element
   */
  initialize(container: HTMLElement): void {
    console.log("[DockManager] Initializing...");

    // Create the dock manager
    this.dockManager = new DockSpawnManager(container);
    this.dockManager.initialize();

    // Create panel elements
    this.createPanelElements();

    // Try to load saved layout, fall back to default
    this.initializeLayout();

    // Handle window resize
    this.setupResizeHandler(container);

    // Setup layout change listener for auto-save
    this.setupLayoutChangeListener();

    // Initial resize
    this.resize();

    console.log("[DockManager] Initialized");
  }

  /**
   * Initialize layout - try to restore saved layout or create default
   */
  private async initializeLayout(): Promise<void> {
    const savedState = localStorage.getItem(LAYOUT_STORAGE_KEY);

    if (savedState) {
      try {
        // Setup callback for restoring panel elements
        this.dockManager!.getElementCallback = async (state) => {
          // The element property contains the panel ID (from the element's id attribute)
          const panelId = state.element?.replace("panel-", "") as PanelId;
          const element = this.panelElements.get(panelId);
          if (element) {
            return { element, title: PANEL_CONFIG[panelId]?.title || panelId };
          }
          throw new Error(`Unknown panel: ${state.element}`);
        };

        await this.dockManager!.loadState(savedState);
        console.log("[DockManager] Restored saved layout");
        return;
      } catch (e) {
        console.warn("[DockManager] Failed to restore layout, using default:", e);
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
      }
    }

    // Create default layout
    this.createDefaultLayout();
  }

  /**
   * Setup listener to auto-save layout on changes
   */
  private setupLayoutChangeListener(): void {
    if (!this.dockManager) return;

    this.dockManager.addLayoutListener({
      onDock: () => this.debouncedSaveLayout(),
      onUndock: () => this.debouncedSaveLayout(),
      onContainerResized: () => this.debouncedSaveLayout(),
      onTabsReorder: () => this.debouncedSaveLayout(),
      onCreateDialog: () => this.debouncedSaveLayout(),
      onChangeDialogPosition: () => this.debouncedSaveLayout(),
    });
  }

  /**
   * Debounced save to avoid excessive localStorage writes
   */
  private debouncedSaveLayout(): void {
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveLayout();
    }, 500);
  }

  /**
   * Create DOM elements for each panel
   */
  private createPanelElements(): void {
    // Terminal
    const terminalEl = createTerminalPanel();
    terminalEl.id = "panel-terminal";
    terminalEl.setAttribute("data-panel-caption", PANEL_CONFIG.terminal.title);
    this.panelElements.set("terminal", terminalEl);

    // Editor
    const editorEl = createEditorPanel();
    editorEl.id = "panel-editor";
    editorEl.setAttribute("data-panel-caption", PANEL_CONFIG.editor.title);
    this.panelElements.set("editor", editorEl);

    // Console
    const consoleEl = createConsolePanel();
    consoleEl.id = "panel-console";
    consoleEl.setAttribute("data-panel-caption", PANEL_CONFIG.console.title);
    this.panelElements.set("console", consoleEl);

    // Inspector
    const inspectorEl = createInspectorPanel();
    inspectorEl.id = "panel-inspector";
    inspectorEl.setAttribute("data-panel-caption", PANEL_CONFIG.inspector.title);
    this.panelElements.set("inspector", inspectorEl);
  }

  /**
   * Create PanelContainers and dock them
   */
  private createDefaultLayout(): void {
    if (!this.dockManager) return;

    console.log("[DockManager] Creating default layout...");

    // Create panel containers
    for (const [id, element] of this.panelElements) {
      const panel = new PanelContainer(element, this.dockManager, PANEL_CONFIG[id].title);
      this.panels.set(id, panel);
    }

    // Get the document node (central area)
    const documentNode = this.dockManager.context.model.documentManagerNode;

    // Dock panels in the layout:
    // [Terminal | Editor | Inspector]
    //           [Console]

    const terminalPanel = this.panels.get("terminal")!;
    const editorPanel = this.panels.get("editor")!;
    const consolePanel = this.panels.get("console")!;
    const inspectorPanel = this.panels.get("inspector")!;

    // Editor goes in the document area (center)
    const editorNode = this.dockManager.dockFill(documentNode, editorPanel);
    this.nodes.set("editor", editorNode);

    // Terminal on the left (25% width)
    const terminalNode = this.dockManager.dockLeft(documentNode, terminalPanel, 0.25);
    this.nodes.set("terminal", terminalNode);

    // Console below editor (30% of center height)
    const consoleNode = this.dockManager.dockDown(editorNode, consolePanel, 0.3);
    this.nodes.set("console", consoleNode);

    // Inspector on the right (20% width)
    const inspectorNode = this.dockManager.dockRight(documentNode, inspectorPanel, 0.2);
    this.nodes.set("inspector", inspectorNode);

    console.log("[DockManager] Default layout created");
  }

  /**
   * Setup window resize handler
   */
  private setupResizeHandler(container: HTMLElement): void {
    window.addEventListener("resize", () => this.resize());

    // Also use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(container);
  }

  /**
   * Resize the dock manager to fit container
   */
  resize(): void {
    if (!this.dockManager) return;

    const container = this.dockManager.element.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    this.dockManager.resize(rect.width, rect.height);
  }

  /**
   * Save layout to localStorage
   */
  saveLayout(): void {
    if (!this.dockManager) return;

    try {
      const state = this.dockManager.saveState();
      localStorage.setItem(LAYOUT_STORAGE_KEY, state);
      console.log("[DockManager] Layout saved");
    } catch (e) {
      console.error("[DockManager] Failed to save layout:", e);
    }
  }

  /**
   * Load layout from localStorage
   */
  async loadLayout(): Promise<boolean> {
    if (!this.dockManager) return false;

    try {
      const state = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!state) {
        console.log("[DockManager] No saved layout found");
        return false;
      }

      await this.dockManager.loadState(state);
      console.log("[DockManager] Layout loaded");
      return true;
    } catch (e) {
      console.error("[DockManager] Failed to load layout:", e);
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      return false;
    }
  }

  /**
   * Reset to default layout
   */
  resetLayout(): void {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    // Reload the page to reset everything
    window.location.reload();
  }

  /**
   * Show/activate a panel
   */
  showPanel(id: PanelId): void {
    const panel = this.panels.get(id);
    if (panel && this.dockManager) {
      // If panel is hidden/closed, we need to re-dock it
      // For now, just focus it if visible
      this.dockManager.activePanel = panel;
    }
  }

  /**
   * Toggle a panel's visibility
   */
  togglePanel(id: PanelId): void {
    // dock-spawn-ts doesn't have a simple hide/show - panels are closed or docked
    // For now, just show the panel
    this.showPanel(id);
  }

  /**
   * Check if a panel is visible
   */
  isPanelVisible(id: PanelId): boolean {
    const panel = this.panels.get(id);
    return panel !== undefined;
  }

  /**
   * Get list of available panel IDs
   */
  getAvailablePanels(): PanelId[] {
    return Object.keys(PANEL_CONFIG) as PanelId[];
  }

  /**
   * Get the dock-spawn manager instance
   */
  getDockManager(): DockSpawnManager | null {
    return this.dockManager;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.panels.clear();
    this.panelElements.clear();
    this.nodes.clear();
    this.dockManager = null;
  }
}

// Export singleton instance
export const dockManager = new DockManager();
