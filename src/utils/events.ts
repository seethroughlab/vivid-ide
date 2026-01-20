// =============================================================================
// Event Utilities
// =============================================================================

import { store, subscribeToKey } from "../state/store";
import * as vivid from "../api/vivid";
import { jumpToLine, highlightError, clearErrors, dockManager } from "../ui/dock";
import * as menu from "../ui/menu";

// =============================================================================
// Input Forwarding
// =============================================================================

export function setupInputForwarding(): void {
  console.log("[Events] Setting up input forwarding");

  // DEBUG: Check if dockview elements are being detected
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    const isDockviewElement = target.closest(".dv-tabs-container, .dv-tab, .dv-sash");
    if (isDockviewElement) {
      console.log("[Events] Mousedown on dockview element:", isDockviewElement.className);
    }
  }, true); // Use capture phase to log before dockview handles it

  // Helper to check if click should be forwarded to vivid
  // Forward if: dock container (transparent areas), or main content area
  function shouldForwardToVivid(target: HTMLElement): boolean {
    // Clicking on dock container itself (transparent background)
    if (target.closest("#dock-container") === target) return true;

    // Clicking on main-content area directly
    if (target.closest(".main-content") === target) return true;

    // Don't forward if clicking on actual panel content
    if (target.closest(".terminal-panel-content")) return false;
    if (target.closest(".editor-panel-content")) return false;
    if (target.closest(".inspector-panel-content")) return false;
    if (target.closest(".console-panel-content")) return false;

    // Don't forward if clicking on dock UI elements
    if (target.closest(".panel-titlebar")) return false;
    if (target.closest(".dockspan-tab-handle")) return false;
    if (target.closest(".splitbar-horizontal, .splitbar-vertical")) return false;

    // Forward by default for transparent areas
    return true;
  }

  // Mouse move - forward position for hover effects
  document.addEventListener("mousemove", (e) => {
    const target = e.target as HTMLElement;
    if (shouldForwardToVivid(target)) {
      vivid.inputMouseMove(e.clientX, e.clientY).catch(() => {});
    }
  });

  // Mouse buttons - forward for click/drag interactions
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (shouldForwardToVivid(target)) {
      vivid.inputMouseButton(e.button, true).catch(() => {});
    }
  });

  document.addEventListener("mouseup", (e) => {
    // Always forward mouseup to handle drag release
    vivid.inputMouseButton(e.button, false).catch(() => {});
  });

  // Scroll/wheel - forward for zooming and panning
  document.addEventListener("wheel", (e) => {
    const target = e.target as HTMLElement;
    if (shouldForwardToVivid(target)) {
      e.preventDefault();
      vivid.inputScroll(e.deltaX, e.deltaY).catch(() => {});
    }
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

    // Cmd+1 / Ctrl+1 - show/restore terminal panel
    if ((e.metaKey || e.ctrlKey) && e.key === "1") {
      e.preventDefault();
      dockManager.showPanel("terminal");
    }

    // Cmd+2 / Ctrl+2 - show/restore editor panel
    if ((e.metaKey || e.ctrlKey) && e.key === "2") {
      e.preventDefault();
      dockManager.showPanel("editor");
    }

    // Cmd+3 / Ctrl+3 - show/restore output/console panel
    if ((e.metaKey || e.ctrlKey) && e.key === "3") {
      e.preventDefault();
      dockManager.showPanel("console");
    }

    // Cmd+4 / Ctrl+4 - show/restore inspector panel
    if ((e.metaKey || e.ctrlKey) && e.key === "4") {
      e.preventDefault();
      dockManager.showPanel("inspector");
    }

    // Cmd+E / Ctrl+E - focus editor panel
    if ((e.metaKey || e.ctrlKey) && e.key === "e") {
      if (!target.closest("input, textarea, .xterm")) {
        e.preventDefault();
        dockManager.showPanel("editor");
      }
    }

    // Cmd+J / Ctrl+J - toggle console/output panel
    if ((e.metaKey || e.ctrlKey) && e.key === "j") {
      e.preventDefault();
      dockManager.togglePanel("console");
    }

    // Cmd+B / Ctrl+B - toggle terminal panel (sidebar)
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      if (!target.closest("input, textarea, .xterm, .monaco-editor")) {
        e.preventDefault();
        dockManager.togglePanel("terminal");
      }
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

    // Cmd+Shift+R / Ctrl+Shift+R - reset layout to default
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "R") {
      e.preventDefault();
      console.log("[Events] Resetting layout to default...");
      dockManager.resetLayout();
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
      jumpToLine(compileStatus.error_line, compileStatus.error_column || 1);
    }
  });

  // Dismiss button
  errorDismiss?.addEventListener("click", (e) => {
    e.stopPropagation();
    const errorBanner = document.getElementById("error-banner");
    errorBanner?.classList.add("hidden");
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
    clearErrors();
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

    if (status.error_line) {
      highlightError(status.error_line, status.error_column || 1, status.message || "");
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
