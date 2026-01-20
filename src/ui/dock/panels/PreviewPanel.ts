// =============================================================================
// Preview Panel Renderer for Dockview
// Transparent container for wgpu rendering (which happens behind the WebView)
// =============================================================================

import type { IContentRenderer, GroupPanelPartInitParameters } from "dockview-core";

export class PreviewPanelRenderer implements IContentRenderer {
  private _element: HTMLElement;

  constructor() {
    this._element = document.createElement("div");
    this._element.className = "preview-panel-content";
    this._element.id = "preview-area";

    // Ensure full transparency
    this._element.style.cssText = `
      background: transparent !important;
      width: 100%;
      height: 100%;
      pointer-events: auto;
    `;
  }

  get element(): HTMLElement {
    return this._element;
  }

  init(_params: GroupPanelPartInitParameters): void {
    console.log("[PreviewPanel] Initialized");

    // The preview panel needs to remain fully transparent
    // so that the wgpu rendering (behind the WebView) is visible
  }

  dispose(): void {
    // Nothing to clean up
  }
}
