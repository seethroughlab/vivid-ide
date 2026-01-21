// =============================================================================
// Vivid API - Type-safe Tauri command interface
// =============================================================================

import { invoke } from "./tauri";
import type {
  ProjectInfo,
  CompileStatusInfo,
  OperatorInfo,
  ParamInfo,
  PerformanceStats,
  BundleOptions,
  BundleResult,
} from "../types";

// Re-export types for convenience
export type {
  ProjectInfo,
  CompileStatusInfo,
  OperatorInfo,
  ParamInfo,
  PerformanceStats,
  BundleOptions,
  BundleResult,
};

// =============================================================================
// Project & State Queries
// =============================================================================

/**
 * Check if vivid runtime is ready
 */
export async function isVividReady(): Promise<boolean> {
  return invoke<boolean>("is_vivid_ready");
}

/**
 * Get current project info
 */
export async function getProjectInfo(): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("get_project_info");
}

/**
 * Get compile status
 */
export async function getCompileStatus(): Promise<CompileStatusInfo> {
  return invoke<CompileStatusInfo>("get_compile_status");
}

/**
 * Get performance stats (FPS, frame time, memory)
 */
export async function getPerformanceStats(): Promise<PerformanceStats> {
  return invoke<PerformanceStats>("get_performance_stats");
}

/**
 * Get all operators in the current chain
 */
export async function getOperators(): Promise<OperatorInfo[]> {
  return invoke<OperatorInfo[]>("get_operators");
}

/**
 * Get parameters for a specific operator
 */
export async function getOperatorParams(opName: string): Promise<ParamInfo[]> {
  return invoke<ParamInfo[]>("get_operator_params", { opName });
}

/**
 * Get the currently selected operator
 */
export async function getSelectedOperator(): Promise<string | null> {
  return invoke<string | null>("get_selected_operator");
}

// =============================================================================
// Project Operations
// =============================================================================

/**
 * Load a project from path
 */
export async function loadProject(path: string): Promise<void> {
  return invoke("load_project", { path });
}

/**
 * Reload the current project (hot-reload)
 */
export async function reloadProject(): Promise<void> {
  return invoke("reload_project");
}

// =============================================================================
// Parameter Control
// =============================================================================

/**
 * Set a parameter value (raw 4-component vector)
 */
export async function setParam(
  opName: string,
  paramName: string,
  value: [number, number, number, number]
): Promise<boolean> {
  return invoke<boolean>("set_param", { opName, paramName, value });
}

/**
 * Set a float parameter
 */
export async function setParamFloat(
  opName: string,
  paramName: string,
  value: number
): Promise<boolean> {
  return setParam(opName, paramName, [value, 0, 0, 0]);
}

/**
 * Set a Vec2 parameter
 */
export async function setParamVec2(
  opName: string,
  paramName: string,
  x: number,
  y: number
): Promise<boolean> {
  return setParam(opName, paramName, [x, y, 0, 0]);
}

/**
 * Set a Vec3 parameter
 */
export async function setParamVec3(
  opName: string,
  paramName: string,
  x: number,
  y: number,
  z: number
): Promise<boolean> {
  return setParam(opName, paramName, [x, y, z, 0]);
}

/**
 * Set a color parameter (RGBA)
 */
export async function setParamColor(
  opName: string,
  paramName: string,
  r: number,
  g: number,
  b: number,
  a: number = 1.0
): Promise<boolean> {
  return setParam(opName, paramName, [r, g, b, a]);
}

// =============================================================================
// Operator Selection
// =============================================================================

/**
 * Select an operator (highlights in visualizer)
 */
export async function selectOperator(name: string): Promise<void> {
  return invoke("select_operator", { name });
}

// =============================================================================
// Visualizer Control
// =============================================================================

/**
 * Toggle the node graph visualizer
 */
export async function toggleVisualizer(): Promise<void> {
  return invoke("toggle_visualizer");
}

// =============================================================================
// Input Forwarding
// =============================================================================

/**
 * Forward mouse position to vivid
 */
export async function inputMouseMove(x: number, y: number): Promise<void> {
  return invoke("input_mouse_move", { x, y });
}

/**
 * Forward mouse button state to vivid
 */
export async function inputMouseButton(button: number, pressed: boolean): Promise<void> {
  return invoke("input_mouse_button", { button, pressed });
}

/**
 * Forward scroll events to vivid
 */
export async function inputScroll(dx: number, dy: number): Promise<void> {
  return invoke("input_scroll", { dx, dy });
}

// =============================================================================
// Bundle Operations
// =============================================================================

/**
 * Bundle a project as a standalone application
 */
export async function bundleProject(options: BundleOptions): Promise<BundleResult> {
  return invoke<BundleResult>("bundle_project", { options });
}

/**
 * Bundle the currently loaded project
 */
export async function bundleCurrentProject(
  outputDir?: string,
  appName?: string
): Promise<BundleResult> {
  const projectInfo = await getProjectInfo();
  if (!projectInfo.loaded || !projectInfo.project_path) {
    throw new Error("No project loaded");
  }
  return bundleProject({
    project_path: projectInfo.project_path,
    output_dir: outputDir,
    app_name: appName,
  });
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Read file contents
 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/**
 * Write file contents
 */
export async function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}

/**
 * Create a new project
 */
export async function createProject(
  path: string,
  name: string,
  template?: string
): Promise<void> {
  return invoke("create_project", { path, name, template });
}
