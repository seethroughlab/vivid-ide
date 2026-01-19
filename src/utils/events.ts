// =============================================================================
// Event Utilities
// =============================================================================

import { store, subscribeToKey } from "../state/store";
import * as vivid from "../api/vivid";
import * as editor from "../ui/editor";
import * as layout from "../ui/layout";
import * as menu from "../ui/menu";

// =============================================================================
// Input Forwarding
// =============================================================================

let lastLogTime = 0;

export function setupInputForwarding(): void {
  console.log("[Events] Setting up input forwarding");

  // Mouse move - forward position for hover effects
  document.addEventListener("mousemove", (e) => {
    // Don't forward if over a panel
    const target = e.target as HTMLElement;
    if (target.closest(".panel") || target.closest(".titlebar") || target.closest(".statusbar")) {
      return;
    }

    // Log occasionally to avoid spam
    const now = Date.now();
    if (now - lastLogTime > 1000) {
      console.log("[Events] Forwarding mouse move:", e.clientX, e.clientY);
      lastLogTime = now;
    }

    vivid.inputMouseMove(e.clientX, e.clientY).catch(() => {});
  });

  // Mouse buttons - forward for click/drag interactions
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".panel") || target.closest(".titlebar") || target.closest(".statusbar")) {
      return;
    }
    vivid.inputMouseButton(e.button, true).catch(() => {});
  });

  document.addEventListener("mouseup", (e) => {
    // Always forward mouseup to handle drag release
    vivid.inputMouseButton(e.button, false).catch(() => {});
  });

  // Scroll/wheel - forward for zooming and panning
  document.addEventListener("wheel", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".panel") || target.closest(".titlebar") || target.closest(".statusbar")) {
      return;
    }
    // Prevent default scroll behavior when over node graph area
    e.preventDefault();
    vivid.inputScroll(e.deltaX, e.deltaY).catch((err) => {
      console.error("[Events] input_scroll failed:", err);
    });
  }, { passive: false });

  console.log("[Events] Input forwarding enabled");
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

export function setupKeyboardShortcuts(): void {
  console.log("[Events] Setting up keyboard shortcuts");

  document.addEventListener("keydown", async (e) => {
    const target = e.target as HTMLElement;

    // Tab - toggle visualizer
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!target.closest("input, textarea, .xterm, .monaco-editor")) {
        e.preventDefault();
        try {
          await vivid.toggleVisualizer();
        } catch (err) {
          console.error("[Events] toggleVisualizer failed:", err);
        }
      }
    }

    // Cmd+N / Ctrl+N - new project
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      await menu.newProject();
    }

    // Cmd+O / Ctrl+O - open project
    if ((e.metaKey || e.ctrlKey) && e.key === "o") {
      e.preventDefault();
      await menu.openProject();
    }

    // Cmd+E / Ctrl+E - toggle editor overlay
    if ((e.metaKey || e.ctrlKey) && e.key === "e") {
      if (!target.closest("input, textarea, .xterm")) {
        e.preventDefault();
        layout.toggleEditor();
      }
    }

    // Cmd+1 / Ctrl+1 - toggle terminal panel
    if ((e.metaKey || e.ctrlKey) && e.key === "1") {
      e.preventDefault();
      layout.toggleTerminal();
    }

    // Cmd+2 / Ctrl+2 - toggle parameters/inspector panel
    if ((e.metaKey || e.ctrlKey) && e.key === "2") {
      e.preventDefault();
      layout.toggleInspector();
    }

    // Cmd+3 / Ctrl+3 - toggle editor panel
    if ((e.metaKey || e.ctrlKey) && e.key === "3") {
      e.preventDefault();
      layout.toggleEditor();
    }

    // Cmd+R / Ctrl+R - reload project (when not in editor)
    if ((e.metaKey || e.ctrlKey) && e.key === "r") {
      if (!target.closest(".monaco-editor")) {
        e.preventDefault();
        try {
          await vivid.reloadProject();
          await store.refreshAll();
          console.log("[Events] Project reloaded");
        } catch (err) {
          console.error("[Events] Failed to reload:", err);
        }
      }
    }
  });

  console.log("[Events] Keyboard shortcuts enabled");
}

// =============================================================================
// Error Banner
// =============================================================================

export function setupErrorBanner(): void {
  const errorBanner = document.getElementById("error-banner");
  const errorDismiss = document.getElementById("error-dismiss");

  // Click on banner to jump to error
  errorBanner?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "error-dismiss") return;

    const state = store.get();
    const { compileStatus } = state;
    if (!compileStatus.success && compileStatus.error_line) {
      editor.jumpToLine(compileStatus.error_line, compileStatus.error_column || 1);
    }
  });

  // Dismiss button
  errorDismiss?.addEventListener("click", (e) => {
    e.stopPropagation();
    const errorBanner = document.getElementById("error-banner");
    const editorPanel = document.getElementById("editor-panel");
    errorBanner?.classList.add("hidden");
    editorPanel?.classList.remove("has-error");
  });

  // Subscribe to compile status changes
  subscribeToKey("compileStatus", (state) => {
    handleCompileStatus(state.compileStatus);
  });
}

function handleCompileStatus(status: { success: boolean; message: string | null; error_line: number | null; error_column: number | null }): void {
  const statusEl = document.getElementById("compile-status");
  const errorBanner = document.getElementById("error-banner");
  const errorMessage = document.getElementById("error-message");
  const errorLocation = document.getElementById("error-location");
  const editorPanel = document.getElementById("editor-panel");

  if (status.success) {
    // Compilation succeeded
    if (statusEl) {
      statusEl.textContent = "\u2713 Compiled";
      statusEl.className = "compile-status success";
      setTimeout(() => {
        if (statusEl.textContent === "\u2713 Compiled") {
          statusEl.textContent = "";
          statusEl.className = "compile-status";
        }
      }, 3000);
    }

    errorBanner?.classList.add("hidden");
    editorPanel?.classList.remove("has-error");
    editor.clearErrors();
  } else {
    // Compilation failed
    if (statusEl) {
      statusEl.textContent = "Compile Error";
      statusEl.className = "compile-status error";
    }

    if (errorBanner && errorMessage) {
      const msg = status.message || "Compilation failed";
      const errorMatch = msg.match(/error:\s*(.+?)(?:\n|$)/i);
      const displayMessage = errorMatch ? errorMatch[1] : msg;

      errorMessage.textContent = displayMessage;

      if (errorLocation) {
        if (status.error_line) {
          errorLocation.textContent = `Line ${status.error_line}${status.error_column ? `:${status.error_column}` : ""}`;
          errorLocation.style.display = "inline";
        } else {
          errorLocation.style.display = "none";
        }
      }

      errorBanner.classList.remove("hidden");
    }

    editorPanel?.classList.add("has-error");

    if (status.error_line) {
      editor.highlightError(status.error_line, status.error_column || 1, status.message || "");
    }
  }
}

// =============================================================================
// Status Updates
// =============================================================================

export function setupStatusUpdates(): void {
  // Update resolution display
  updateResolution();
  window.addEventListener("resize", updateResolution);

  // Subscribe to vivid ready state
  subscribeToKey("vividReady", (state) => {
    updateVividStatus(state.vividReady ? "connected" : "disconnected");
  });

  // Subscribe to project path changes
  subscribeToKey("projectPath", () => {
    menu.updateProjectTitle();
  });
}

function updateResolution(): void {
  const resDisplay = document.getElementById("resolution");
  if (resDisplay) {
    resDisplay.textContent = `${window.innerWidth} \u00d7 ${window.innerHeight}`;
  }
}

function updateVividStatus(status: "connected" | "disconnected"): void {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;

  if (status === "connected") {
    statusEl.textContent = "Vivid Active";
    statusEl.className = "status connected";
  } else {
    statusEl.textContent = "Vivid Inactive";
    statusEl.className = "status disconnected";
  }
}
