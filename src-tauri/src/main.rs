// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_ops;
mod output_capture;
mod pty;

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent, Emitter};
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
use serde::{Deserialize, Serialize};

// =============================================================================
// Application State (Tauri Managed)
// =============================================================================

/// Wrapper around vivid::Context for thread-safe access
struct VividContext {
    ctx: vivid::Context,
}

// Safety: vivid::Context contains raw pointers but is single-threaded.
// We only access it from the main thread via Mutex.
unsafe impl Send for VividContext {}
unsafe impl Sync for VividContext {}

/// Application state managed by Tauri
pub struct AppState {
    /// The vivid context, wrapped in Mutex for interior mutability
    vivid: Mutex<Option<VividContext>>,
    /// App handle for emitting events
    app_handle: Mutex<Option<AppHandle>>,
    /// Whether initialization has been attempted
    init_attempted: AtomicBool,
    /// Start time for performance tracking
    start_time: Mutex<Option<Instant>>,
    /// Flag to signal render thread to stop
    render_running: AtomicBool,
    /// Frame counter for render timing - incremented by timer thread, decremented after render
    render_pending: AtomicU64,
    /// Performance stats tracking
    perf_stats: Mutex<PerformanceStats>,
    /// Last frame time for FPS calculation
    last_frame_time: Mutex<Option<Instant>>,
    /// Frame count since last FPS update
    fps_frame_count: AtomicU64,
    /// Time of last FPS update
    last_fps_time: Mutex<Option<Instant>>,
    /// FPS history for graphing
    fps_history: Mutex<VecDeque<f32>>,
    /// Frame time history for graphing
    frame_time_history: Mutex<VecDeque<f32>>,
    /// Memory history for graphing (in MB)
    memory_history: Mutex<VecDeque<f64>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vivid: Mutex::new(None),
            app_handle: Mutex::new(None),
            init_attempted: AtomicBool::new(false),
            start_time: Mutex::new(None),
            render_running: AtomicBool::new(false),
            render_pending: AtomicU64::new(0),
            perf_stats: Mutex::new(PerformanceStats::default()),
            last_frame_time: Mutex::new(None),
            fps_frame_count: AtomicU64::new(0),
            last_fps_time: Mutex::new(None),
            fps_history: Mutex::new(VecDeque::with_capacity(120)),
            frame_time_history: Mutex::new(VecDeque::with_capacity(120)),
            memory_history: Mutex::new(VecDeque::with_capacity(120)),
        }
    }
}

impl AppState {
    /// Check if vivid is initialized
    fn is_initialized(&self) -> bool {
        self.vivid.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Execute a function with read-only vivid context access
    fn with_vivid<T, F>(&self, f: F) -> Option<T>
    where
        F: FnOnce(&vivid::Context) -> T,
    {
        let guard = self.vivid.lock().ok()?;
        guard.as_ref().map(|v| f(&v.ctx))
    }

    /// Try to execute a function with vivid context, returns None if lock is busy
    fn try_with_vivid<T, F>(&self, f: F) -> Option<T>
    where
        F: FnOnce(&vivid::Context) -> T,
    {
        let guard = self.vivid.try_lock().ok()?;
        guard.as_ref().map(|v| f(&v.ctx))
    }

    /// Execute a function with mutable vivid context access
    fn with_vivid_mut<T, F>(&self, f: F) -> Option<T>
    where
        F: FnOnce(&mut vivid::Context) -> T,
    {
        let mut guard = self.vivid.lock().ok()?;
        guard.as_mut().map(|v| f(&mut v.ctx))
    }

    /// Emit an event to the frontend
    fn emit<S: Serialize + Clone>(&self, event: &str, payload: S) {
        if let Ok(guard) = self.app_handle.lock() {
            if let Some(handle) = guard.as_ref() {
                let _ = handle.emit(event, payload);
            }
        }
    }

    /// Update performance stats after each frame
    fn update_performance_stats(&self) {
        let now = Instant::now();
        const HISTORY_SIZE: usize = 120;

        // Calculate frame time
        let frame_time_ms = if let Ok(mut last) = self.last_frame_time.lock() {
            let dt = if let Some(prev) = *last {
                (now - prev).as_secs_f32() * 1000.0
            } else {
                16.67 // Default to ~60fps
            };
            *last = Some(now);
            dt
        } else {
            16.67
        };

        // Update frame time history
        if let Ok(mut history) = self.frame_time_history.lock() {
            history.push_back(frame_time_ms);
            while history.len() > HISTORY_SIZE {
                history.pop_front();
            }
        }

        // Update FPS counter
        self.fps_frame_count.fetch_add(1, Ordering::Relaxed);

        // Calculate FPS every second
        if let Ok(mut last_fps) = self.last_fps_time.lock() {
            let should_update = if let Some(prev) = *last_fps {
                (now - prev).as_secs_f32() >= 1.0
            } else {
                *last_fps = Some(now);
                false
            };

            if should_update {
                let frames = self.fps_frame_count.swap(0, Ordering::Relaxed);
                let elapsed = if let Some(prev) = *last_fps {
                    (now - prev).as_secs_f32()
                } else {
                    1.0
                };
                let fps = frames as f32 / elapsed;
                *last_fps = Some(now);

                // Update FPS history
                if let Ok(mut history) = self.fps_history.lock() {
                    history.push_back(fps);
                    while history.len() > HISTORY_SIZE {
                        history.pop_front();
                    }
                }

                // Update memory history (get process memory)
                if let Ok(mut history) = self.memory_history.lock() {
                    let memory_mb = get_process_memory_mb();
                    history.push_back(memory_mb);
                    while history.len() > HISTORY_SIZE {
                        history.pop_front();
                    }
                }

                // Update perf stats struct
                if let Ok(mut stats) = self.perf_stats.lock() {
                    stats.fps = fps;
                    stats.frame_time_ms = frame_time_ms;

                    if let Ok(history) = self.fps_history.lock() {
                        stats.fps_history = history.iter().copied().collect();
                    }
                    if let Ok(history) = self.frame_time_history.lock() {
                        stats.frame_time_history = history.iter().copied().collect();
                    }
                    if let Ok(history) = self.memory_history.lock() {
                        stats.memory_history = history.iter().copied().collect();
                    }

                    // Get operator count and texture memory estimate
                    if let Some((op_count, tex_mem)) = self.try_with_vivid(|ctx| {
                        if let Some(chain) = ctx.chain() {
                            let ops: Vec<_> = chain.operators().collect();
                            let texture_ops = ops.iter().filter(|op| {
                                format!("{:?}", op.output_kind()) == "Texture"
                            }).count();
                            let tex_mem = texture_ops as u64 * ctx.width() as u64 * ctx.height() as u64 * 4;
                            (ops.len(), tex_mem)
                        } else {
                            (0, 0)
                        }
                    }) {
                        stats.operator_count = op_count;
                        stats.texture_memory_bytes = tex_mem;
                    }
                }
            }
        }
    }
}

/// Get process memory usage in MB
fn get_process_memory_mb() -> f64 {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use ps to get RSS (resident set size) in KB
        if let Ok(output) = Command::new("ps")
            .args(["-o", "rss=", "-p", &std::process::id().to_string()])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Ok(kb) = s.trim().parse::<f64>() {
                    return kb / 1024.0; // Convert KB to MB
                }
            }
        }
        0.0
    }
    #[cfg(target_os = "windows")]
    {
        // On Windows, use GetProcessMemoryInfo
        0.0 // TODO: implement for Windows
    }
    #[cfg(target_os = "linux")]
    {
        // Read from /proc/self/statm
        if let Ok(content) = std::fs::read_to_string("/proc/self/statm") {
            if let Some(rss_pages) = content.split_whitespace().nth(1) {
                if let Ok(pages) = rss_pages.parse::<f64>() {
                    return pages * 4.0 / 1024.0; // 4KB pages to MB
                }
            }
        }
        0.0
    }
}

// =============================================================================
// Serializable types for webview communication
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub loaded: bool,
    pub project_path: Option<String>,
    pub chain_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileStatusInfo {
    pub success: bool,
    pub message: Option<String>,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperatorInfo {
    pub name: String,
    pub type_name: String,
    pub output_kind: String,
    pub bypassed: bool,
    pub input_count: usize,
    pub inputs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamInfo {
    pub name: String,
    pub param_type: String,
    pub min_val: f32,
    pub max_val: f32,
    pub value: [f32; 4],
    pub default_val: [f32; 4],
    pub enum_labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PerformanceStats {
    pub fps: f32,
    pub frame_time_ms: f32,
    pub fps_history: Vec<f32>,
    pub frame_time_history: Vec<f32>,
    pub memory_history: Vec<f64>,
    pub texture_memory_bytes: u64,
    pub operator_count: usize,
}

// =============================================================================
// Event payload types
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct VividInitializedPayload {
    pub success: bool,
    pub project_loaded: bool,
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileStatusPayload {
    pub success: bool,
    pub message: Option<String>,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OperatorSelectedPayload {
    pub name: Option<String>,
}

// =============================================================================
// Tauri commands for vivid state
// =============================================================================

#[tauri::command]
fn get_project_info(state: tauri::State<'_, Arc<AppState>>) -> ProjectInfo {
    log::info!("[Tauri] get_project_info called");
    state.with_vivid(|ctx| {
        let project_path = ctx.project_path();
        let chain_path = project_path.as_ref().map(|p| format!("{}/chain.cpp", p));
        let info = ProjectInfo {
            loaded: ctx.has_project(),
            project_path: project_path.clone(),
            chain_path,
        };
        log::info!("[Tauri] get_project_info returning: loaded={}, path={:?}", info.loaded, project_path);
        info
    }).unwrap_or_else(|| {
        log::info!("[Tauri] get_project_info: vivid not initialized");
        ProjectInfo {
            loaded: false,
            project_path: None,
            chain_path: None,
        }
    })
}

#[tauri::command]
fn get_compile_status(state: tauri::State<'_, Arc<AppState>>) -> CompileStatusInfo {
    state.with_vivid(|ctx| {
        let status = ctx.compile_status();
        CompileStatusInfo {
            success: status.success,
            message: status.message,
            error_line: status.error_line,
            error_column: status.error_column,
        }
    }).unwrap_or_else(|| CompileStatusInfo {
        success: true,
        message: None,
        error_line: None,
        error_column: None,
    })
}

#[tauri::command]
fn get_performance_stats(state: tauri::State<'_, Arc<AppState>>) -> PerformanceStats {
    state.perf_stats.lock()
        .map(|s| s.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn get_operators(state: tauri::State<'_, Arc<AppState>>) -> Vec<OperatorInfo> {
    log::info!("[Tauri] get_operators called");
    let operators = state.with_vivid(|ctx| {
        let mut ops = Vec::new();
        if let Some(chain) = ctx.chain() {
            for op in chain.operators() {
                let mut inputs = Vec::new();
                for i in 0..op.input_count() {
                    inputs.push(op.input_name(i));
                }
                ops.push(OperatorInfo {
                    name: op.name(),
                    type_name: op.type_name(),
                    output_kind: format!("{:?}", op.output_kind()),
                    bypassed: op.is_bypassed(),
                    input_count: op.input_count(),
                    inputs,
                });
            }
        }
        ops
    }).unwrap_or_default();

    log::info!("[Tauri] get_operators returning {} operators", operators.len());
    operators
}

#[tauri::command]
fn get_operator_params(state: tauri::State<'_, Arc<AppState>>, op_name: String) -> Vec<ParamInfo> {
    state.with_vivid(|ctx| {
        let mut params = Vec::new();
        if let Some(chain) = ctx.chain() {
            if let Some(op) = chain.operator_by_name(&op_name) {
                for decl in op.params() {
                    let value = op.get_param(&decl.name).unwrap_or([0.0; 4]);
                    params.push(ParamInfo {
                        name: decl.name,
                        param_type: format!("{:?}", decl.param_type),
                        min_val: decl.min_val,
                        max_val: decl.max_val,
                        value,
                        default_val: decl.default_val,
                        enum_labels: decl.enum_labels,
                    });
                }
            }
        }
        params
    }).unwrap_or_default()
}

#[tauri::command]
fn set_param(
    state: tauri::State<'_, Arc<AppState>>,
    op_name: String,
    param_name: String,
    value: [f32; 4],
) -> Result<bool, String> {
    state.with_vivid(|ctx| {
        if let Some(chain) = ctx.chain() {
            if let Some(mut op) = chain.operator_by_name(&op_name) {
                return op.set_param(&param_name, &value);
            }
        }
        false
    }).ok_or_else(|| "Vivid not initialized".to_string())
}

#[tauri::command]
fn reload_project(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    state.with_vivid_mut(|ctx| {
        ctx.reload().map_err(|e| e.to_string())
    }).unwrap_or_else(|| Err("Vivid not initialized".into()))?;

    // Emit compile status after reload
    let status = state.with_vivid(|ctx| {
        let s = ctx.compile_status();
        CompileStatusPayload {
            success: s.success,
            message: s.message,
            error_line: s.error_line,
            error_column: s.error_column,
        }
    });
    if let Some(status) = status {
        state.emit("vivid-compile-status", status);
    }

    Ok(())
}

// Input event commands - forward from webview to vivid
#[tauri::command]
fn input_mouse_move(state: tauri::State<'_, Arc<AppState>>, x: f32, y: f32) {
    state.with_vivid_mut(|ctx| {
        ctx.set_mouse_position(x, y);
    });
}

#[tauri::command]
fn input_mouse_button(state: tauri::State<'_, Arc<AppState>>, button: u32, pressed: bool) {
    state.with_vivid_mut(|ctx| {
        ctx.set_mouse_button(button, pressed);
    });
}

#[tauri::command]
fn input_scroll(state: tauri::State<'_, Arc<AppState>>, dx: f32, dy: f32) {
    state.with_vivid_mut(|ctx| {
        ctx.add_scroll(dx, dy);
    });
}

#[tauri::command]
fn load_project(state: tauri::State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    state.with_vivid_mut(|ctx| {
        ctx.load_project(&path).map_err(|e| e.to_string())
    }).unwrap_or_else(|| Err("Vivid not initialized".into()))?;

    // Emit project loaded event
    let info = state.with_vivid(|ctx| {
        VividInitializedPayload {
            success: true,
            project_loaded: ctx.has_project(),
            project_path: ctx.project_path(),
        }
    });
    if let Some(info) = info {
        state.emit("vivid-project-loaded", info);
    }

    Ok(())
}

#[tauri::command]
fn toggle_visualizer(state: tauri::State<'_, Arc<AppState>>) {
    log::info!("[Tauri] toggle_visualizer called");
    state.with_vivid_mut(|ctx| {
        let visible = ctx.is_visualizer_visible();
        log::info!("[Tauri] toggle_visualizer: was {}, setting to {}", visible, !visible);
        ctx.set_visualizer_visible(!visible);
    });
}

#[tauri::command]
fn get_selected_operator(state: tauri::State<'_, Arc<AppState>>) -> Option<String> {
    state.with_vivid(|ctx| ctx.selected_operator()).flatten()
}

#[tauri::command]
fn select_operator(state: tauri::State<'_, Arc<AppState>>, name: String) {
    state.with_vivid_mut(|ctx| {
        ctx.select_operator(&name);
    });
    // Emit selection event
    state.emit("vivid-operator-selected", OperatorSelectedPayload { name: Some(name) });
}

#[tauri::command]
fn is_vivid_ready(state: tauri::State<'_, Arc<AppState>>) -> bool {
    state.is_initialized()
}

// =============================================================================
// Bundle command
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleOptions {
    pub project_path: String,
    pub output_dir: Option<String>,
    pub app_name: Option<String>,
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleResult {
    pub success: bool,
    pub output: String,
    pub bundle_path: Option<String>,
}

#[tauri::command]
async fn bundle_project(options: BundleOptions) -> Result<BundleResult, String> {
    use std::process::Command;

    // Find the vivid CLI binary
    let vivid_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Failed to get parent directory")?
        .join("vivid");

    let vivid_bin = vivid_root.join("build/bin/vivid");

    if !vivid_bin.exists() {
        return Err(format!(
            "Vivid CLI not found at {:?}. Please build vivid first.",
            vivid_bin
        ));
    }

    // Build command arguments
    let mut cmd = Command::new(&vivid_bin);
    cmd.arg("bundle");
    cmd.arg(&options.project_path);

    if let Some(ref output_dir) = options.output_dir {
        cmd.arg("-o").arg(output_dir);
    }
    if let Some(ref app_name) = options.app_name {
        cmd.arg("-n").arg(app_name);
    }
    if let Some(ref platform) = options.platform {
        cmd.arg("-p").arg(platform);
    }

    log::info!("[Tauri] Running bundle command: {:?}", cmd);

    // Execute and capture output
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute vivid bundle: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined_output = if stderr.is_empty() {
        stdout.clone()
    } else {
        format!("{}\n{}", stdout, stderr)
    };

    // Try to extract bundle path from output
    let bundle_path = stdout
        .lines()
        .find(|line| line.contains("Bundle created:"))
        .and_then(|line| line.split("Bundle created:").nth(1))
        .map(|s| s.trim().to_string());

    Ok(BundleResult {
        success: output.status.success(),
        output: combined_output,
        bundle_path,
    })
}

// =============================================================================
// Window handle extraction
// =============================================================================

#[cfg(target_os = "macos")]
fn get_window_handle(window: &tauri::WebviewWindow) -> Option<*mut std::ffi::c_void> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let tao_window = window.as_ref().window();
    if let Ok(handle) = tao_window.window_handle() {
        match handle.as_raw() {
            RawWindowHandle::AppKit(appkit_handle) => {
                let ns_view = appkit_handle.ns_view.as_ptr();
                unsafe {
                    use objc2::msg_send;
                    use objc2::runtime::AnyObject;
                    let view: *mut AnyObject = ns_view as *mut _;
                    let window: *mut AnyObject = msg_send![view, window];
                    if window.is_null() {
                        None
                    } else {
                        Some(window as *mut std::ffi::c_void)
                    }
                }
            }
            _ => None,
        }
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn get_window_handle(window: &tauri::WebviewWindow) -> Option<*mut std::ffi::c_void> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let tao_window = window.as_ref().window();
    if let Ok(handle) = tao_window.window_handle() {
        match handle.as_raw() {
            RawWindowHandle::Win32(win32_handle) => {
                Some(win32_handle.hwnd.get() as *mut std::ffi::c_void)
            }
            _ => None,
        }
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
fn get_window_handle(window: &tauri::WebviewWindow) -> Option<*mut std::ffi::c_void> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let tao_window = window.as_ref().window();
    if let Ok(handle) = tao_window.window_handle() {
        match handle.as_raw() {
            RawWindowHandle::Xlib(xlib_handle) => {
                Some(xlib_handle.window as *mut std::ffi::c_void)
            }
            RawWindowHandle::Xcb(xcb_handle) => {
                Some(xcb_handle.window.get() as *mut std::ffi::c_void)
            }
            RawWindowHandle::Wayland(wayland_handle) => {
                Some(wayland_handle.surface.as_ptr())
            }
            _ => None,
        }
    } else {
        None
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn get_window_handle(_window: &tauri::WebviewWindow) -> Option<*mut std::ffi::c_void> {
    None
}

// =============================================================================
// Vivid initialization
// =============================================================================

/// Initialize vivid with the given window
fn initialize_vivid(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
) -> Result<(), String> {
    // Only attempt initialization once
    if state.init_attempted.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    log::info!("Initializing vivid context...");

    let window_handle = get_window_handle(window)
        .ok_or_else(|| "Failed to get window handle".to_string())?;

    // Configure asset paths BEFORE creating context
    let vivid_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?
        .join("vivid");

    if let Err(e) = vivid::configure_asset_paths(&vivid_root) {
        log::warn!("Failed to configure asset paths: {:?}", e);
    } else {
        log::info!("Configured asset paths for: {:?}", vivid_root);
    }

    // Get window size
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let config = vivid::ContextConfig::new(
        size.width.max(1),
        size.height.max(1),
    );

    // Create vivid context with window
    let mut ctx = unsafe { vivid::Context::with_window(window_handle, config) }
        .map_err(|e| format!("Failed to create vivid context: {:?}", e))?;

    // Set vivid root for hot-reload
    if let Err(e) = ctx.set_root_dir(&vivid_root) {
        log::warn!("Failed to set vivid root dir: {:?}", e);
    }

    // Disable visualizer UI by default (IDE has its own UI)
    ctx.set_visualizer_visible(false);

    // Auto-load a test project for development
    let test_project = vivid_root.join("projects/getting-started/02-operator-pipeline");
    let project_loaded = if test_project.exists() {
        match ctx.load_project(&test_project) {
            Ok(_) => {
                log::info!("Loaded test project: {:?}", test_project);
                true
            }
            Err(e) => {
                log::warn!("Failed to load test project: {:?}", e);
                false
            }
        }
    } else {
        false
    };

    // Store the context
    {
        let mut guard = state.vivid.lock().map_err(|_| "Mutex poisoned")?;
        *guard = Some(VividContext { ctx });
    }

    log::info!("Vivid initialized successfully!");

    // Emit initialization event
    state.emit("vivid-initialized", VividInitializedPayload {
        success: true,
        project_loaded,
        project_path: if project_loaded {
            Some(test_project.to_string_lossy().to_string())
        } else {
            None
        },
    });

    Ok(())
}

// =============================================================================
// Application menu
// =============================================================================

fn create_app_menu(app: &tauri::App) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    // App menu (macOS only, but we define it anyway)
    let app_menu = SubmenuBuilder::new(app, "Vivid")
        .item(&PredefinedMenuItem::about(app, Some("About Vivid"), None)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Hide Vivid"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Hide Others"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Show All"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quit Vivid"))?)
        .build()?;

    // File menu
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new_project", "New Project...")
            .accelerator("CmdOrCtrl+N")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("open_project", "Open Project...")
            .accelerator("CmdOrCtrl+O")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open_file", "Open File...")
            .accelerator("CmdOrCtrl+Shift+O")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("save", "Save")
            .accelerator("CmdOrCtrl+S")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("reload", "Reload Project")
            .accelerator("CmdOrCtrl+R")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("export_app", "Export App...")
            .accelerator("CmdOrCtrl+Shift+E")
            .build(app)?)
        .build()?;

    // Edit menu
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    // View menu
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("show_terminal", "Terminal")
            .accelerator("CmdOrCtrl+1")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("show_editor", "Editor")
            .accelerator("CmdOrCtrl+2")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("show_console", "Output")
            .accelerator("CmdOrCtrl+3")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("show_inspector", "Parameters")
            .accelerator("CmdOrCtrl+4")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("show_performance", "Performance")
            .accelerator("CmdOrCtrl+5")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle_terminal", "Toggle Terminal")
            .accelerator("CmdOrCtrl+B")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("toggle_console", "Toggle Output")
            .accelerator("CmdOrCtrl+J")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("reset_layout", "Reset Layout")
            .accelerator("CmdOrCtrl+Shift+R")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle_visualizer", "Toggle Node Graph")
            .accelerator("Tab")
            .build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    // Window menu
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close"))?)
        .build()?;

    // Help menu
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("docs", "Vivid Documentation")
            .build(app)?)
        .build()?;

    // Build the full menu
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}

// =============================================================================
// Main entry point
// =============================================================================

fn main() {
    env_logger::init();

    // Create shared application state
    let app_state = Arc::new(AppState::default());

    // Create PTY manager
    let pty_manager = Arc::new(pty::PtyManager::new());

    // Frame counter for deferred initialization
    let frame_count = Arc::new(std::sync::atomic::AtomicU64::new(0));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state.clone())
        .manage(pty_manager)
        .setup({
            let state = app_state.clone();
            move |app| {
                log::info!("Vivid Tauri app setup starting...");

                // Store app handle for event emission
                if let Ok(mut guard) = state.app_handle.lock() {
                    *guard = Some(app.handle().clone());
                }

                // Capture stdout/stderr and forward to frontend
                output_capture::start_capture(app.handle().clone());

                // Store start time
                if let Ok(mut guard) = state.start_time.lock() {
                    *guard = Some(Instant::now());
                }

                // Build the application menu
                let menu = create_app_menu(app)?;
                app.set_menu(menu)?;

                // Start timer thread for continuous rendering
                // This wakes the main event loop frequently - actual frame rate is
                // determined by vsync/GPU, not this timer. We wake at ~240Hz to support
                // high refresh rate displays (120Hz, 144Hz, etc.)
                let timer_state = state.clone();
                let timer_handle = app.handle().clone();
                std::thread::spawn(move || {
                    timer_state.render_running.store(true, Ordering::SeqCst);
                    let wake_interval = std::time::Duration::from_micros(4166); // ~240Hz wake rate

                    while timer_state.render_running.load(Ordering::SeqCst) {
                        // Emit a render-tick event to wake the main event loop
                        // This is safe because we're just emitting an event, not rendering
                        if let Some(window) = timer_handle.get_webview_window("main") {
                            let _ = window.emit("render-tick", ());
                        }
                        std::thread::sleep(wake_interval);
                    }
                    log::info!("Render timer thread stopped");
                });

                log::info!("Vivid Tauri app setup complete");
                Ok(())
            }
        })
        .on_menu_event({
            let state = app_state.clone();
            move |app, event| {
                log::info!("Menu event: {:?}", event.id());
                let window = app.get_webview_window("main");

                match event.id().0.as_str() {
                    "new_project" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "new_project");
                        }
                    }
                    "open_project" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "open_project");
                        }
                    }
                    "open_file" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "open_file");
                        }
                    }
                    "save" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "save");
                        }
                    }
                    "reload" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "reload");
                        }
                    }
                    "export_app" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "export_app");
                        }
                    }
                    "show_terminal" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "show_terminal");
                        }
                    }
                    "show_editor" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "show_editor");
                        }
                    }
                    "show_console" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "show_console");
                        }
                    }
                    "show_inspector" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "show_inspector");
                        }
                    }
                    "show_performance" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "show_performance");
                        }
                    }
                    "toggle_terminal" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "toggle_terminal");
                        }
                    }
                    "toggle_console" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "toggle_console");
                        }
                    }
                    "reset_layout" => {
                        if let Some(win) = window {
                            let _ = win.emit("menu-action", "reset_layout");
                        }
                    }
                    "toggle_visualizer" => {
                        state.with_vivid_mut(|ctx| {
                            let visible = ctx.is_visualizer_visible();
                            ctx.set_visualizer_visible(!visible);
                        });
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands
            pty::spawn_shell,
            pty::write_pty,
            pty::resize_pty,
            pty::close_pty,
            // File operations
            file_ops::read_file,
            file_ops::write_file,
            file_ops::get_file_name,
            file_ops::create_project,
            file_ops::get_home_dir,
            file_ops::get_vivid_executable_path,
            // Vivid state queries
            get_project_info,
            get_compile_status,
            get_performance_stats,
            get_operators,
            get_operator_params,
            set_param,
            reload_project,
            // Input forwarding
            input_mouse_move,
            input_mouse_button,
            input_scroll,
            load_project,
            toggle_visualizer,
            get_selected_operator,
            select_operator,
            is_vivid_ready,
            bundle_project,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run({
            let state = app_state.clone();
            let frame_counter = frame_count.clone();
            move |app_handle, event| {
                match event {
                    RunEvent::Ready => {
                        log::info!("RunEvent::Ready");
                    }
                    RunEvent::MainEventsCleared => {
                        let frame = frame_counter.fetch_add(1, Ordering::SeqCst);

                        // Wait ~30 frames (about 500ms at 60fps) before trying to init vivid
                        // This ensures the window/Metal layer is ready
                        if frame == 30 && !state.init_attempted.load(Ordering::SeqCst) {
                            log::info!("Attempting vivid initialization on frame {}", frame);
                            if let Some(window) = app_handle.get_webview_window("main") {
                                if let Err(e) = initialize_vivid(&state, &window) {
                                    log::error!("Failed to initialize vivid: {}", e);
                                    state.emit("vivid-initialized", VividInitializedPayload {
                                        success: false,
                                        project_loaded: false,
                                        project_path: None,
                                    });
                                }
                            }
                        }

                        // Render frame on main thread
                        // Use try_lock to avoid blocking during project loading
                        if let Ok(guard) = state.vivid.try_lock() {
                            if let Some(ref vivid_ctx) = *guard {
                                if let Err(e) = vivid_ctx.ctx.render_frame() {
                                    log::error!("Render error: {:?}", e);
                                }
                            }
                        }

                        // Update performance stats
                        state.update_performance_stats();
                    }
                    RunEvent::WindowEvent {
                        label: _,
                        event: WindowEvent::Resized(size),
                        ..
                    } => {
                        if size.width > 0 && size.height > 0 {
                            state.with_vivid_mut(|ctx| {
                                if let Err(e) = ctx.resize_surface(size.width, size.height) {
                                    log::error!("Resize error: {:?}", e);
                                }
                            });
                        }
                    }
                    RunEvent::ExitRequested { .. } => {
                        // Stop the render thread
                        state.render_running.store(false, Ordering::SeqCst);
                    }
                    _ => {}
                }
            }
        });
}
