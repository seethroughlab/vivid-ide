// =============================================================================
// Shared TypeScript interfaces for Vivid IDE
// =============================================================================

// --- Vivid State Types ---

export interface ProjectInfo {
  loaded: boolean;
  project_path: string | null;
  chain_path: string | null;
}

export interface CompileStatusInfo {
  success: boolean;
  message: string | null;
  error_line: number | null;
  error_column: number | null;
}

export interface OperatorInfo {
  name: string;
  type_name: string;
  output_kind: string;
  bypassed: boolean;
  input_count: number;
  inputs: string[];
}

export interface ParamInfo {
  name: string;
  param_type: string;
  min_val: number;
  max_val: number;
  value: [number, number, number, number];
  default_val: [number, number, number, number];
  enum_labels: string[];
}

export interface PerformanceStats {
  fps: number;
  frame_time_ms: number;
  fps_history: number[];
  frame_time_history: number[];
  memory_history: number[];
  texture_memory_bytes: number;
  operator_count: number;
}

// --- Event Payload Types ---

export interface VividInitializedPayload {
  success: boolean;
  project_loaded: boolean;
  project_path: string | null;
}

export interface CompileStatusPayload {
  success: boolean;
  message: string | null;
  error_line: number | null;
  error_column: number | null;
}

export interface OperatorSelectedPayload {
  name: string | null;
}

// --- Bundle Types ---

export interface BundleOptions {
  project_path: string;
  output_dir?: string;
  app_name?: string;
  platform?: "mac" | "windows" | "linux" | "ios";
}

export interface BundleResult {
  success: boolean;
  output: string;
  bundle_path: string | null;
}

// --- Layout Types ---

export interface LayoutState {
  terminalCollapsed: boolean;
  inspectorCollapsed: boolean;
  editorCollapsed: boolean;
}

// --- App State Types ---

export interface AppState {
  // Project state
  projectPath: string | null;
  chainPath: string | null;
  projectLoaded: boolean;

  // Vivid state
  vividReady: boolean;
  operators: OperatorInfo[];
  selectedOperator: string | null;
  selectedOperatorParams: ParamInfo[];

  // Compile state
  compileStatus: CompileStatusInfo;

  // Performance state
  performanceStats: PerformanceStats;

  // Editor state
  currentFilePath: string | null;
  isModified: boolean;

  // Layout state
  layout: LayoutState;
}

// --- Type Guards ---

export function isParamFloat(param: ParamInfo): boolean {
  return param.param_type === "Float";
}

export function isParamInt(param: ParamInfo): boolean {
  return param.param_type === "Int";
}

export function isParamBool(param: ParamInfo): boolean {
  return param.param_type === "Bool";
}

export function isParamColor(param: ParamInfo): boolean {
  return param.param_type === "Color";
}

export function isParamEnum(param: ParamInfo): boolean {
  return param.param_type === "Enum";
}

export function isParamVec(param: ParamInfo): boolean {
  return (
    param.param_type === "Vec2" ||
    param.param_type === "Vec3" ||
    param.param_type === "Vec4"
  );
}

export function getVecComponents(param: ParamInfo): number {
  switch (param.param_type) {
    case "Vec2":
      return 2;
    case "Vec3":
      return 3;
    case "Vec4":
      return 4;
    default:
      return 1;
  }
}
