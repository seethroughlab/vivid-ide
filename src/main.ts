// =============================================================================
// Vivid IDE - Main Entry Point
// =============================================================================

import { store } from "./state/store";
import { dockManager, loadFile } from "./ui/dock";
import { initMenu, setupWindowDragging, updateProjectTitle } from "./ui/menu";
import { initMcpSetup } from "./ui/mcp-setup";
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

  // Initialize menu and window dragging
  initMenu();
  setupWindowDragging();

  // Initialize window size (restore saved size or clamp default to screen)
  await store.initWindowSize();

  // Initialize dockview layout
  const container = document.getElementById("dockview-container");
  if (container) {
    dockManager.initialize(container);
  } else {
    console.error("[Vivid IDE] Dockview container not found");
  }

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
