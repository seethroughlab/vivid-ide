// =============================================================================
// Vivid IDE - Main Entry Point
// =============================================================================

import { store } from "./state/store";
import { initTerminal } from "./ui/terminal";
import { initEditor, loadFile } from "./ui/editor";
import { initInspector } from "./ui/inspector";
import { initLayout } from "./ui/layout";
import { initMenu, setupWindowDragging, updateProjectTitle } from "./ui/menu";
import { initMcpSetup } from "./ui/mcp-setup";
import { initConsole } from "./ui/console";
import {
  setupInputForwarding,
  setupKeyboardShortcuts,
  setupErrorBanner,
  setupStatusUpdates,
} from "./utils/events";

// =============================================================================
// Application Initialization
// =============================================================================

async function init(): Promise<void> {
  console.log("[Vivid IDE] Initializing...");

  // Initialize UI modules (order matters for some)
  initLayout();
  initMenu();
  setupWindowDragging();

  // Initialize terminal and editor in parallel
  await Promise.all([
    initTerminal(),
    Promise.resolve(initEditor()),
  ]);

  // Initialize inspector (depends on store)
  initInspector();

  // Initialize console panel
  initConsole();

  // Setup event handlers
  setupInputForwarding();
  setupKeyboardShortcuts();
  setupErrorBanner();
  setupStatusUpdates();

  // Initialize state store and start event listeners
  await store.initialize();

  // Update UI with initial state
  updateProjectTitle();

  // Auto-load chain.cpp if project is loaded
  const state = store.get();
  if (state.chainPath && !state.currentFilePath) {
    await loadFile(state.chainPath);
  }

  // Check MCP configuration and show setup banner if needed
  await initMcpSetup();

  console.log("[Vivid IDE] Initialization complete");
}

// Start the application
init().catch(console.error);
