// =============================================================================
// Panel Layout Module
// =============================================================================

import { store } from "../state/store";
import * as terminal from "./terminal";
import * as editor from "./editor";

// =============================================================================
// Layout Initialization
// =============================================================================

export function initLayout(): void {
  // Restore saved layout
  restoreLayout();

  // Setup panel toggle buttons
  document.getElementById("toggle-terminal")?.addEventListener("click", toggleTerminal);
  document.getElementById("toggle-inspector")?.addEventListener("click", toggleInspector);
  document.getElementById("toggle-editor")?.addEventListener("click", toggleEditor);

  console.log("[Layout] Initialized");
}

// =============================================================================
// Layout Restoration
// =============================================================================

function restoreLayout(): void {
  const layout = store.get().layout;

  const terminalPanel = document.getElementById("terminal-panel");
  const inspectorPanel = document.getElementById("inspector-panel");
  const editorPanel = document.getElementById("editor-panel");
  const terminalToggle = document.getElementById("toggle-terminal");
  const inspectorToggle = document.getElementById("toggle-inspector");
  const editorToggle = document.getElementById("toggle-editor");

  if (layout.terminalCollapsed) {
    terminalPanel?.classList.add("collapsed");
    if (terminalToggle) terminalToggle.textContent = "+";
  }

  if (layout.inspectorCollapsed) {
    inspectorPanel?.classList.add("collapsed");
    if (inspectorToggle) inspectorToggle.textContent = "+";
  }

  if (layout.editorCollapsed) {
    editorPanel?.classList.add("collapsed");
    if (editorToggle) editorToggle.textContent = "+";
  }

  console.log("[Layout] Restored:", layout);
}

// =============================================================================
// Panel Toggle Functions
// =============================================================================

export function toggleTerminal(): void {
  const terminalPanel = document.getElementById("terminal-panel");
  const terminalToggle = document.getElementById("toggle-terminal");

  terminalPanel?.classList.toggle("collapsed");
  const isCollapsed = terminalPanel?.classList.contains("collapsed") ?? false;

  if (terminalToggle) {
    terminalToggle.textContent = isCollapsed ? "+" : "\u2212";
  }

  // Resize terminal when panel is toggled
  setTimeout(() => terminal.fit(), 100);

  store.updateLayout({ terminalCollapsed: isCollapsed });
}

export function toggleInspector(): void {
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorToggle = document.getElementById("toggle-inspector");

  inspectorPanel?.classList.toggle("collapsed");
  const isCollapsed = inspectorPanel?.classList.contains("collapsed") ?? false;

  if (inspectorToggle) {
    inspectorToggle.textContent = isCollapsed ? "+" : "\u2212";
  }

  store.updateLayout({ inspectorCollapsed: isCollapsed });
}

export function toggleEditor(): void {
  const editorPanel = document.getElementById("editor-panel");
  const editorToggle = document.getElementById("toggle-editor");

  editorPanel?.classList.toggle("collapsed");
  const isCollapsed = editorPanel?.classList.contains("collapsed") ?? false;

  if (editorToggle) {
    editorToggle.textContent = isCollapsed ? "+" : "\u2212";
  }

  // Resize editor when panel is toggled
  setTimeout(() => editor.layout(), 100);

  store.updateLayout({ editorCollapsed: isCollapsed });
}
