// =============================================================================
// DockManager - Dockview-based Panel Layout Manager
// =============================================================================

import {
  createDockview,
  type DockviewApi,
  type IContentRenderer,
  type IDockviewPanel,
} from "dockview-core";
import "dockview-core/dist/styles/dockview.css";
import "./theme.css";

import {
  TerminalPanelRenderer,
  EditorPanelRenderer,
  PreviewPanelRenderer,
  InspectorPanelRenderer,
  ConsolePanelRenderer,
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
const LAYOUT_STORAGE_KEY = "vivid-ide-dockview-layout";

// Panel component types
type PanelComponent = "terminal" | "editor" | "preview" | "inspector" | "console";

// Panel configuration for restoring closed panels
const PANEL_CONFIG: Record<PanelComponent, { title: string; defaultPosition: "left" | "right" | "below"; defaultSize?: number }> = {
  terminal: { title: "Claude Code", defaultPosition: "left", defaultSize: 350 },
  editor: { title: "Editor", defaultPosition: "left" },
  preview: { title: "Preview", defaultPosition: "below" },
  console: { title: "Output", defaultPosition: "below", defaultSize: 150 },
  inspector: { title: "Parameters", defaultPosition: "right", defaultSize: 280 },
};

// =============================================================================
// DockManager Class
// =============================================================================

export class DockManager {
  private api: DockviewApi | null = null;

  /**
   * Initialize the dock manager with a container element
   */
  initialize(container: HTMLElement): void {
    console.log("[DockManager] Initializing...");

    this.api = createDockview(container, {
      className: "dockview-theme-dark dockview-theme-vivid",
      disableDnd: false, // Explicitly enable drag and drop
      disableFloatingGroups: false, // Allow floating panels
      createComponent: (options) => this.createPanel(options.name as PanelComponent),
    });

    // Save layout on changes
    this.api.onDidLayoutChange(() => {
      this.saveLayout();
    });

    // DEBUG: Always start fresh to test default layout
    // TODO: Remove this after debugging
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    this.createDefaultLayout();

    console.log("[DockManager] Initialized");
  }

  /**
   * Create a panel renderer based on component type
   */
  private createPanel(name: PanelComponent): IContentRenderer {
    let renderer: IContentRenderer;

    switch (name) {
      case "terminal":
        renderer = new TerminalPanelRenderer();
        break;
      case "editor":
        renderer = new EditorPanelRenderer();
        break;
      case "preview":
        renderer = new PreviewPanelRenderer();
        break;
      case "inspector":
        renderer = new InspectorPanelRenderer();
        break;
      case "console":
        renderer = new ConsolePanelRenderer();
        break;
      default:
        throw new Error(`Unknown panel component: ${name}`);
    }

    return renderer;
  }

  /**
   * Create the default layout
   * Layout: [Terminal | Editor/Preview/Console | Inspector]
   */
  createDefaultLayout(): void {
    if (!this.api) return;

    console.log("[DockManager] Creating default layout...");

    // 1. First add the main editor panel (center, no position = fills available space)
    const editorPanel = this.api.addPanel({
      id: "editor",
      component: "editor",
      title: "Editor",
    });
    console.log("[DockManager] Added editor panel, group:", editorPanel.group?.id);

    // 2. Add terminal to the LEFT (use referenceGroup for split)
    const terminalPanel = this.api.addPanel({
      id: "terminal",
      component: "terminal",
      title: "Claude Code",
      position: {
        referenceGroup: editorPanel.group,
        direction: "left",
      },
      initialWidth: 350,
    });
    console.log("[DockManager] Added terminal panel, group:", terminalPanel.group?.id);

    // 3. Add preview BELOW editor (use referenceGroup for split)
    const previewPanel = this.api.addPanel({
      id: "preview",
      component: "preview",
      title: "Preview",
      position: {
        referenceGroup: editorPanel.group,
        direction: "below",
      },
    });
    console.log("[DockManager] Added preview panel, group:", previewPanel.group?.id);

    // 4. Add console BELOW preview (use referenceGroup for split)
    const consolePanel = this.api.addPanel({
      id: "console",
      component: "console",
      title: "Output",
      position: {
        referenceGroup: previewPanel.group,
        direction: "below",
      },
      initialHeight: 150,
    });
    console.log("[DockManager] Added console panel, group:", consolePanel.group?.id);

    // 5. Add inspector to the RIGHT (use referenceGroup for split)
    const inspectorPanel = this.api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Parameters",
      position: {
        referenceGroup: editorPanel.group,
        direction: "right",
      },
      initialWidth: 280,
    });
    console.log("[DockManager] Added inspector panel, group:", inspectorPanel.group?.id);

    // Debug: log the state of all panels and groups
    const panels = this.api.panels;
    const groups = this.api.groups;
    console.log("[DockManager] Layout created:");
    console.log(`  - ${panels.length} panels`);
    console.log(`  - ${groups.length} groups`);
    groups.forEach(g => {
      console.log(`  - Group ${g.id}: ${g.panels.map(p => p.id).join(", ")}`);
    });
  }

  /**
   * Save the current layout to localStorage
   */
  saveLayout(): void {
    if (!this.api) return;

    try {
      const layout = this.api.toJSON();
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
      console.log("[DockManager] Layout saved");
    } catch (e) {
      console.error("[DockManager] Failed to save layout:", e);
    }
  }

  /**
   * Load layout from localStorage
   * @returns true if layout was loaded successfully
   */
  loadLayout(): boolean {
    if (!this.api) return false;

    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!saved) {
        console.log("[DockManager] No saved layout found");
        return false;
      }

      const layout = JSON.parse(saved);

      // Validate that the layout has the expected structure
      if (!layout || !layout.grid) {
        console.warn("[DockManager] Invalid layout format, using default");
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
        return false;
      }

      this.api.fromJSON(layout);
      console.log("[DockManager] Layout loaded from storage");
      return true;
    } catch (e) {
      console.error("[DockManager] Failed to load layout:", e);
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      return false;
    }
  }

  /**
   * Clear saved layout (useful for debugging)
   */
  clearSavedLayout(): void {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    console.log("[DockManager] Saved layout cleared");
  }

  /**
   * Reset to default layout
   */
  resetLayout(): void {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    if (this.api) {
      // Clear all panels
      this.api.clear();
      this.createDefaultLayout();
    }
  }

  /**
   * Get a panel by ID
   */
  getPanel(id: string): IDockviewPanel | undefined {
    return this.api?.getPanel(id);
  }

  /**
   * Show/activate a panel by ID. If the panel was closed, restore it.
   */
  showPanel(id: PanelComponent): void {
    if (!this.api) return;

    const panel = this.api.getPanel(id);
    if (panel) {
      panel.api.setActive();
    } else {
      // Panel was closed, restore it
      this.restorePanel(id);
    }
  }

  /**
   * Restore a closed panel
   */
  restorePanel(id: PanelComponent): void {
    if (!this.api) return;

    // Check if panel already exists
    if (this.api.getPanel(id)) {
      console.log(`[DockManager] Panel ${id} already exists`);
      this.api.getPanel(id)?.api.setActive();
      return;
    }

    const config = PANEL_CONFIG[id];
    if (!config) {
      console.error(`[DockManager] Unknown panel: ${id}`);
      return;
    }

    console.log(`[DockManager] Restoring panel: ${id}`);

    // Find a reference panel to position relative to
    const existingPanels = this.api.panels;
    const referencePanel = existingPanels.length > 0 ? existingPanels[0].id : undefined;

    const panelOptions: Parameters<typeof this.api.addPanel>[0] = {
      id,
      component: id,
      title: config.title,
    };

    // Set position based on panel type
    if (config.defaultPosition === "left") {
      panelOptions.position = { direction: "left" };
      if (config.defaultSize) panelOptions.initialWidth = config.defaultSize;
    } else if (config.defaultPosition === "right") {
      panelOptions.position = { direction: "right" };
      if (config.defaultSize) panelOptions.initialWidth = config.defaultSize;
    } else if (config.defaultPosition === "below" && referencePanel) {
      panelOptions.position = { referencePanel, direction: "below" };
      if (config.defaultSize) panelOptions.initialHeight = config.defaultSize;
    }

    this.api.addPanel(panelOptions);
  }

  /**
   * Toggle a panel's visibility
   */
  togglePanel(id: PanelComponent): void {
    if (!this.api) return;

    const panel = this.api.getPanel(id);
    if (panel) {
      // Panel exists, close it
      panel.api.close();
      console.log(`[DockManager] Closed panel: ${id}`);
    } else {
      // Panel is closed, restore it
      this.restorePanel(id);
    }
  }

  /**
   * Check if a panel is currently visible
   */
  isPanelVisible(id: string): boolean {
    return this.api?.getPanel(id) !== undefined;
  }

  /**
   * Get list of all available panel IDs
   */
  getAvailablePanels(): PanelComponent[] {
    return Object.keys(PANEL_CONFIG) as PanelComponent[];
  }

  /**
   * Get list of currently open panels
   */
  getOpenPanels(): string[] {
    return this.api?.panels.map(p => p.id) ?? [];
  }

  /**
   * Get list of closed panels
   */
  getClosedPanels(): PanelComponent[] {
    const open = new Set(this.getOpenPanels());
    return this.getAvailablePanels().filter(id => !open.has(id));
  }

  /**
   * Get the dockview API (for advanced operations)
   */
  getApi(): DockviewApi | null {
    return this.api;
  }

  /**
   * Dispose the dock manager
   */
  dispose(): void {
    this.api?.dispose();
    this.api = null;
  }
}

// Export singleton instance
export const dockManager = new DockManager();
