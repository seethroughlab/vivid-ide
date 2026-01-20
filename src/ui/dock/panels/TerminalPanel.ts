// =============================================================================
// Terminal Panel for dock-spawn-ts
// =============================================================================

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { invoke, listen } from "../../../api/tauri";

// Terminal state
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let sessionId: number | null = null;

/**
 * Create the terminal panel element
 */
export function createTerminalPanel(): HTMLElement {
  const element = document.createElement("div");
  element.className = "terminal-panel-content";

  const terminalContainer = document.createElement("div");
  terminalContainer.id = "terminal";
  element.appendChild(terminalContainer);

  // Initialize terminal when element is attached to DOM
  setTimeout(() => {
    initTerminal(terminalContainer);
  }, 0);

  // Set up resize handling with ResizeObserver
  const resizeObserver = new ResizeObserver(() => {
    handleResize();
  });
  resizeObserver.observe(element);

  return element;
}

async function initTerminal(container: HTMLElement): Promise<void> {
  if (terminal) return; // Already initialized

  terminal = new Terminal({
    fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: "bar",
    theme: {
      background: "transparent",
      foreground: "#e4e4e7",
      cursor: "#6366f1",
      cursorAccent: "#18181b",
      selectionBackground: "#6366f133",
      black: "#18181b",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#e4e4e7",
      brightBlack: "#52525b",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde047",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    },
    allowTransparency: true,
    scrollback: 10000,
  });

  fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  terminal.open(container);

  // Delay initial fit to let DOM settle
  setTimeout(() => {
    fitAddon?.fit();
  }, 100);

  const { rows, cols } = terminal;

  try {
    // Spawn a shell session
    sessionId = await invoke<number>("spawn_shell", { rows, cols });
    console.log(`[TerminalPanel] Shell session started with ID: ${sessionId}`);

    // Listen for PTY output
    await listen<[number, string]>("pty-output", (payload) => {
      const [sid, data] = payload;
      if (sid === sessionId && terminal) {
        terminal.write(data);
      }
    });

    // Listen for PTY exit
    await listen<number>("pty-exit", (payload) => {
      if (payload === sessionId && terminal) {
        terminal.writeln("\r\n\x1b[38;5;245m[Shell session ended]\x1b[0m");
        sessionId = null;
      }
    });

    // Send terminal input to PTY
    terminal.onData(async (data) => {
      if (sessionId !== null) {
        try {
          await invoke("write_pty", { sessionId, data });
        } catch (e) {
          console.error("[TerminalPanel] Failed to write to PTY:", e);
        }
      }
    });

    console.log("[TerminalPanel] Initialized");
  } catch (e) {
    console.error("[TerminalPanel] Failed to spawn shell:", e);
    showError(e);
  }
}

async function handleResize(): Promise<void> {
  if (fitAddon && terminal) {
    fitAddon.fit();
    if (sessionId !== null) {
      try {
        await invoke("resize_pty", {
          sessionId,
          rows: terminal.rows,
          cols: terminal.cols,
        });
      } catch (e) {
        console.error("[TerminalPanel] Failed to resize PTY:", e);
      }
    }
  }
}

function showError(error: unknown): void {
  if (!terminal) return;

  terminal.writeln("\x1b[38;5;196m\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e\x1b[0m");
  terminal.writeln("\x1b[38;5;196m\u2502\x1b[0m   \x1b[1;38;5;196mFailed to start shell\x1b[0m                \x1b[38;5;196m\u2502\x1b[0m");
  terminal.writeln("\x1b[38;5;196m\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f\x1b[0m");
  terminal.writeln("");
  terminal.writeln(`\x1b[38;5;245mError: ${error}\x1b[0m`);
}

// Export utility functions for external access
export function getTerminal(): Terminal | null {
  return terminal;
}

export function fit(): void {
  fitAddon?.fit();
}

export function focus(): void {
  terminal?.focus();
}
