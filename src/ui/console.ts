// =============================================================================
// Console Panel UI Module
// =============================================================================

import { listen } from "../api/tauri";
import { store } from "../state/store";
import type { AppState } from "../types";

interface OutputPayload {
  stream: "stdout" | "stderr";
  text: string;
}

type MessageType = "info" | "success" | "error" | "warning";

interface ConsoleMessage {
  timestamp: Date;
  type: MessageType;
  message: string;
  location?: { file: string; line: number; column?: number };
}

const messages: ConsoleMessage[] = [];
let consoleOutput: HTMLElement | null = null;
let isCollapsed = false;

/**
 * Initialize the console panel
 */
export function initConsole(): void {
  consoleOutput = document.getElementById("console-output");
  const toggleBtn = document.getElementById("toggle-console");
  const clearBtn = document.getElementById("clear-console");
  const panel = document.getElementById("console-panel");

  if (!consoleOutput || !panel) return;

  // Load collapsed state from localStorage
  isCollapsed = localStorage.getItem("vivid-console-collapsed") === "true";
  if (isCollapsed) {
    panel.classList.add("collapsed");
    if (toggleBtn) toggleBtn.textContent = "+";
  }

  // Toggle button handler
  toggleBtn?.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    panel.classList.toggle("collapsed", isCollapsed);
    toggleBtn.textContent = isCollapsed ? "+" : "−";
    localStorage.setItem("vivid-console-collapsed", String(isCollapsed));
  });

  // Clear button handler
  clearBtn?.addEventListener("click", () => {
    clearConsole();
  });

  // Show initial message
  logInfo("Console ready");

  // Listen for stdout/stderr output from vivid
  listen<OutputPayload>("vivid-output", (payload) => {
    const { stream, text } = payload;
    if (stream === "stderr") {
      // Stderr messages are warnings/errors
      logWarning(text);
    } else {
      // Stdout is regular info
      logInfo(text);
    }
  });

  // Subscribe to compile status changes
  let prevCompileSuccess: boolean | null = null;
  store.subscribe((state: AppState) => {
    const status = state.compileStatus;
    if (status.success !== prevCompileSuccess) {
      if (prevCompileSuccess !== null) {
        // Only log if this is a change, not initial state
        if (status.success) {
          logSuccess("Compilation successful");
        } else if (status.message) {
          logError(status.message, {
            file: state.chainPath || "chain.cpp",
            line: status.error_line || 0,
            column: status.error_column || undefined,
          });
        }
      }
      prevCompileSuccess = status.success;
    }
  });
}

/**
 * Log an info message
 */
export function logInfo(message: string): void {
  addMessage("info", message);
}

/**
 * Log a success message
 */
export function logSuccess(message: string): void {
  addMessage("success", message);
}

/**
 * Log a warning message
 */
export function logWarning(message: string): void {
  addMessage("warning", message);
}

/**
 * Log an error message
 */
export function logError(
  message: string,
  location?: { file: string; line: number; column?: number }
): void {
  addMessage("error", message, location);
}

/**
 * Clear all console messages
 */
export function clearConsole(): void {
  messages.length = 0;
  renderMessages();
}

/**
 * Add a message to the console
 */
function addMessage(
  type: MessageType,
  message: string,
  location?: { file: string; line: number; column?: number }
): void {
  messages.push({
    timestamp: new Date(),
    type,
    message,
    location,
  });

  // Limit message history
  if (messages.length > 500) {
    messages.shift();
  }

  renderMessages();
}

/**
 * Render all messages to the console output
 */
function renderMessages(): void {
  if (!consoleOutput) return;

  if (messages.length === 0) {
    consoleOutput.innerHTML = '<div class="console-empty">No output</div>';
    return;
  }

  consoleOutput.innerHTML = messages
    .map((msg) => {
      const time = formatTime(msg.timestamp);
      const locationHtml = msg.location
        ? ` <span class="console-location" data-file="${msg.location.file}" data-line="${msg.location.line}">${msg.location.file}:${msg.location.line}${msg.location.column ? `:${msg.location.column}` : ""}</span>`
        : "";

      return `<div class="console-line ${msg.type}">
        <span class="console-timestamp">${time}</span>
        <span class="console-message">${escapeHtml(msg.message)}${locationHtml}</span>
      </div>`;
    })
    .join("");

  // Scroll to bottom
  consoleOutput.scrollTop = consoleOutput.scrollHeight;

  // Add click handlers for location links
  consoleOutput.querySelectorAll(".console-location").forEach((el) => {
    el.addEventListener("click", () => {
      const file = el.getAttribute("data-file");
      const line = parseInt(el.getAttribute("data-line") || "0", 10);
      if (file && line > 0) {
        goToLine(file, line);
      }
    });
  });
}

/**
 * Format timestamp as HH:MM:SS
 */
function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Navigate to a specific line in the editor
 */
function goToLine(file: string, line: number): void {
  // Import editor module and navigate to line
  import("./editor").then(({ goToLine: editorGoToLine, loadFile }) => {
    const state = store.get();
    // If the file is already open, just go to line
    if (state.currentFilePath === file || state.currentFilePath?.endsWith(file)) {
      editorGoToLine(line);
    } else {
      // Load the file first, then go to line
      loadFile(file).then(() => {
        editorGoToLine(line);
      });
    }
  });
}
