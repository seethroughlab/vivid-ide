// =============================================================================
// Menu Handlers Module
// =============================================================================

import { open } from "@tauri-apps/plugin-dialog";
import { listen, getCurrentWindow } from "../api/tauri";
import { store } from "../state/store";
import * as vivid from "../api/vivid";
import * as editor from "./editor";
import { dockManager } from "./dock";

// =============================================================================
// Menu Initialization
// =============================================================================

export function initMenu(): void {
  // Setup native menu event listeners (macOS menu bar)
  setupMenuListeners();

  console.log("[Menu] Initialized");
}

// =============================================================================
// Native Menu Event Listeners (macOS menu bar)
// =============================================================================

async function setupMenuListeners(): Promise<void> {
  await listen<string>("menu-action", async (action) => {
    console.log("[Menu] Native menu action:", action);

    switch (action) {
      case "new_project":
        await newProject();
        break;
      case "open_project":
        await openProject();
        break;
      case "open_file":
        await editor.openFile();
        break;
      case "save":
        await editor.saveFile();
        break;
      case "reload":
        await reloadProject();
        break;
      // Show panel actions (restore if closed)
      case "show_terminal":
        dockManager.showPanel("terminal");
        break;
      case "show_editor":
        dockManager.showPanel("editor");
        break;
      case "show_console":
        dockManager.showPanel("console");
        break;
      case "show_inspector":
        dockManager.showPanel("inspector");
        break;
      // Toggle panel actions
      case "toggle_terminal":
        dockManager.togglePanel("terminal");
        break;
      case "toggle_console":
        dockManager.togglePanel("console");
        break;
      // Reset layout
      case "reset_layout":
        dockManager.resetLayout();
        break;
    }
  });
}

// =============================================================================
// Project Operations
// =============================================================================

export async function newProject(): Promise<void> {
  try {
    // Ask for project name first
    const projectName = await promptProjectName();
    if (!projectName) return;

    // Ask where to save the project
    const parentDir = await open({
      directory: true,
      multiple: false,
      title: "Choose location for new project",
    });

    if (!parentDir || typeof parentDir !== "string") return;

    const projectPath = `${parentDir}/${projectName}`;
    console.log("[Menu] Creating new project at:", projectPath);

    // Create the project
    await vivid.createProject(projectPath, projectName, "blank");

    // Load the new project
    await vivid.loadProject(projectPath);

    // Refresh state
    await store.refreshAll();

    console.log("[Menu] New project created successfully");
  } catch (e) {
    console.error("[Menu] Failed to create new project:", e);
    alert(`Failed to create project: ${e}`);
  }
}

export async function openProject(): Promise<void> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Vivid Project",
    });

    if (selected && typeof selected === "string") {
      console.log("[Menu] Opening project:", selected);

      // Load the project
      await vivid.loadProject(selected);

      // Clear the current file in editor
      store.setEditorState(null, false);

      // Refresh state (project-loaded event will also trigger this)
      await store.refreshAll();

      // Load chain.cpp in editor
      const state = store.get();
      if (state.chainPath) {
        await editor.loadFile(state.chainPath);
      }

      console.log("[Menu] Project opened successfully");
    }
  } catch (e) {
    console.error("[Menu] Failed to open project:", e);
  }
}

async function reloadProject(): Promise<void> {
  try {
    await vivid.reloadProject();
    await store.refreshAll();
    console.log("[Menu] Project reloaded");
  } catch (e) {
    console.error("[Menu] Failed to reload project:", e);
  }
}

// =============================================================================
// Utilities
// =============================================================================

async function promptProjectName(): Promise<string | null> {
  // For now, use a simple browser prompt
  const name = window.prompt("Enter project name:", "my-project");
  if (!name || name.trim() === "") return null;

  // Sanitize the name
  const sanitized = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

  return sanitized || null;
}

// =============================================================================
// Window Dragging
// =============================================================================

export function setupWindowDragging(): void {
  const titlebar = document.querySelector(".titlebar");
  if (!titlebar) return;

  titlebar.addEventListener("mousedown", async (e) => {
    if ((e as MouseEvent).button === 0) {
      const target = e.target as HTMLElement;
      if (!target.closest("button") && !target.closest("input") && !target.closest(".menu-item")) {
        try {
          await getCurrentWindow().startDragging();
        } catch (err) {
          console.error("[Menu] Failed to start dragging:", err);
        }
      }
    }
  });
}

// =============================================================================
// Project Title
// =============================================================================

export function updateProjectTitle(): void {
  const titleEl = document.getElementById("title");
  const state = store.get();

  if (titleEl) {
    if (state.projectPath) {
      const projectName = state.projectPath.split("/").pop() || state.projectPath;
      titleEl.innerHTML = `Vivid \u2014 <span class="project-name">${projectName}</span>`;
    } else {
      titleEl.textContent = "Vivid";
    }
  }
}
