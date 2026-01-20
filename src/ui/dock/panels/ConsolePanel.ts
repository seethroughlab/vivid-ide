// =============================================================================
// Console Panel Renderer for Dockview
// =============================================================================

import type { IContentRenderer, GroupPanelPartInitParameters } from "dockview-core";
import { listen } from "../../../api/tauri";
import { store } from "../../../state/store";
import type { AppState } from "../../../types";

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

export class ConsolePanelRenderer implements IContentRenderer {
  private _element: HTMLElement;
  private unsubscriber: (() => void) | null = null;

  constructor() {
    this._element = document.createElement("div");
    this._element.className = "console-panel-content";
    this._element.innerHTML = `
      <div id="console-output" class="console-output"></div>
    `;
  }

  get element(): HTMLElement {
    return this._element;
  }

  init(_params: GroupPanelPartInitParameters): void {
    consoleOutput = this._element.querySelector("#console-output");
    if (!consoleOutput) return;

    // Show initial message
    logInfo("Console ready");

    // Listen for stdout/stderr output from vivid
    listen<OutputPayload>("vivid-output", (payload) => {
      const { stream, text } = payload;
      if (stream === "stderr") {
        logWarning(text);
      } else {
        logInfo(text);
      }
    });

    // Subscribe to compile status changes
    let prevCompileSuccess: boolean | null = null;
    this.unsubscriber = store.subscribe((state: AppState) => {
      const status = state.compileStatus;
      if (status.success !== prevCompileSuccess) {
        if (prevCompileSuccess !== null) {
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

    console.log("[ConsolePanel] Initialized");
  }

  dispose(): void {
    if (this.unsubscriber) {
      this.unsubscriber();
      this.unsubscriber = null;
    }
    consoleOutput = null;
  }
}

// =============================================================================
// Logging Functions (exported for use by other modules)
// =============================================================================

export function logInfo(message: string): void {
  addMessage("info", message);
}

export function logSuccess(message: string): void {
  addMessage("success", message);
}

export function logWarning(message: string): void {
  addMessage("warning", message);
}

export function logError(
  message: string,
  location?: { file: string; line: number; column?: number }
): void {
  addMessage("error", message, location);
}

export function clearConsole(): void {
  messages.length = 0;
  renderMessages();
}

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

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function goToLine(file: string, line: number): void {
  // Import editor module and navigate to line
  import("./EditorPanel").then(({ goToLine: editorGoToLine, loadFile }) => {
    const state = store.get();
    if (state.currentFilePath === file || state.currentFilePath?.endsWith(file)) {
      editorGoToLine(line);
    } else {
      loadFile(file).then(() => {
        editorGoToLine(line);
      });
    }
  });
}
