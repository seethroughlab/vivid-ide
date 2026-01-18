# Vivid IDE Architecture Refactor Plan

## Overview

This document outlines a comprehensive refactoring plan to improve the vivid-ide codebase architecture. The project has solid foundations but needs attention in state management (backend) and code organization (frontend) to scale well.

**Current Grade:** B (Good foundations, concerning patterns)
**Target Grade:** A (Production-ready, maintainable, testable)

---

## Phase 1: Backend State Management

**Priority:** Critical
**Estimated Changes:** ~200 lines modified

### Problem

The current implementation uses global mutable state that's difficult to test and maintain:

```rust
// Current pattern (problematic)
static VIVID_STATE: OnceLock<Mutex<VividState>> = OnceLock::new();
unsafe impl Send for VividState {}
unsafe impl Sync for VividState {}
```

Issues:
- 15+ separate `.lock()` calls scattered throughout main.rs
- Mutex can be poisoned if code panics
- Frame-count based initialization (`if frame == 30`) is fragile
- `.unwrap()` calls in startup path can panic

### Solution

Replace with Tauri's managed state pattern:

```rust
// New pattern
use std::sync::Mutex;

struct AppState {
    vivid: Mutex<Option<VividState>>,
    initialized: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vivid: Mutex::new(None),
            initialized: AtomicBool::new(false),
        }
    }
}

// In main():
tauri::Builder::default()
    .manage(AppState::default())
    // ...

// In commands:
#[tauri::command]
fn get_project_info(state: tauri::State<'_, AppState>) -> Result<ProjectInfo, String> {
    let guard = state.vivid.lock().map_err(|_| "Lock poisoned")?;
    let vivid = guard.as_ref().ok_or("Vivid not initialized")?;
    // ...
}
```

### Implementation Tasks

- [ ] Create `AppState` struct with Mutex-wrapped Option
- [ ] Add `tauri::State` parameter to all commands
- [ ] Replace `VIVID_STATE.get()` pattern with state parameter
- [ ] Replace frame-count init with async deferred initialization
- [ ] Handle initialization errors gracefully (no `.unwrap()`)
- [ ] Consider using `parking_lot::Mutex` (no poisoning)

### Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/main.rs` | State struct, all command signatures |
| `src-tauri/Cargo.toml` | Add `parking_lot` dependency (optional) |

---

## Phase 2: Backend Event System

**Priority:** High
**Estimated Changes:** ~150 lines added

### Problem

Frontend uses polling to detect state changes:

```typescript
// Current pattern (inefficient)
window.setInterval(async () => {
  await refreshVividState();
}, 2000);
```

Issues:
- 2-second delay for state updates
- Unnecessary IPC traffic
- Battery drain on laptops
- 100ms polling for operator selection adds up

### Solution

Emit Tauri events when state changes:

```rust
// Backend: Emit events
use tauri::Emitter;

#[tauri::command]
fn load_project(
    path: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // ... load project ...

    // Emit event to frontend
    app.emit("vivid:project-loaded", ProjectInfo { ... })
        .map_err(|e| e.to_string())?;

    Ok(())
}

// On compile status change in render loop:
if compile_status_changed {
    app.emit("vivid:compile-status", status).ok();
}
```

```typescript
// Frontend: Subscribe to events
import { listen } from "@tauri-apps/api/event";

await listen<ProjectInfo>("vivid:project-loaded", (event) => {
    updateProjectState(event.payload);
});
```

### Event Types

| Event | Payload | Trigger |
|-------|---------|---------|
| `vivid:initialized` | `{ ready: boolean }` | After vivid context created |
| `vivid:project-loaded` | `ProjectInfo` | After project load/reload |
| `vivid:compile-status` | `CompileStatusInfo` | When compilation completes |
| `vivid:operator-selected` | `{ name: string \| null }` | When selection changes in visualizer |
| `vivid:chain-updated` | `{ operators: OperatorInfo[] }` | When chain structure changes |

### Implementation Tasks

- [ ] Define event payload types (reuse existing structs)
- [ ] Add `app: tauri::AppHandle` parameter to state-changing commands
- [ ] Emit events after successful operations
- [ ] Add compile status change detection in render loop
- [ ] Add selection change detection in render loop

### Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/main.rs` | Event emission in commands and render loop |

---

## Phase 3: Frontend Module Split

**Priority:** High
**Estimated Changes:** ~1200 lines reorganized

### Problem

All UI logic in single 1000+ line file:

```
src/
├── main.ts          # 1000+ lines, everything mixed
├── vivid-api.ts     # OK
├── vivid-connection.ts  # Unused
└── styles.css
```

Issues:
- Impossible to unit test
- Hard to find code
- No separation of concerns
- 8+ global variables

### Solution

Split into logical modules:

```
src/
├── main.ts              # Entry point only (~100 lines)
├── types.ts             # Shared TypeScript interfaces
├── api/
│   ├── tauri.ts         # Type-safe Tauri invoke wrappers
│   └── vivid.ts         # Vivid-specific API (renamed from vivid-api.ts)
├── state/
│   └── store.ts         # Centralized state with event subscriptions
├── ui/
│   ├── editor.ts        # Monaco editor setup and handlers
│   ├── terminal.ts      # xterm setup and PTY handling
│   ├── inspector.ts     # Parameter panel rendering
│   ├── layout.ts        # Panel toggle/resize logic
│   └── menu.ts          # File menu handlers
└── utils/
    ├── events.ts        # Tauri event listener setup
    └── dom.ts           # DOM helper utilities
```

### Module Responsibilities

**main.ts** - Entry point only:
```typescript
import { initState } from "./state/store";
import { initEditor } from "./ui/editor";
import { initTerminal } from "./ui/terminal";
import { initLayout } from "./ui/layout";
import { initMenu } from "./ui/menu";
import { initEvents } from "./utils/events";

async function init() {
    await initState();
    await initEvents();
    initLayout();
    initEditor();
    await initTerminal();
    initMenu();
}

document.addEventListener("DOMContentLoaded", init);
```

**state/store.ts** - Centralized state:
```typescript
interface AppState {
    project: ProjectInfo | null;
    compileStatus: CompileStatusInfo | null;
    operators: OperatorInfo[];
    selectedOperator: string | null;
    currentFile: string | null;
    isModified: boolean;
}

let state: AppState = { /* defaults */ };
const listeners: Set<() => void> = new Set();

export function getState(): Readonly<AppState> { return state; }
export function setState(partial: Partial<AppState>) {
    state = { ...state, ...partial };
    listeners.forEach(fn => fn());
}
export function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
```

### Implementation Tasks

- [ ] Create directory structure: `src/api/`, `src/state/`, `src/ui/`, `src/utils/`
- [ ] Create `types.ts` with shared interfaces
- [ ] Create `state/store.ts` with reactive state pattern
- [ ] Extract editor code to `ui/editor.ts`
- [ ] Extract terminal code to `ui/terminal.ts`
- [ ] Extract inspector code to `ui/inspector.ts`
- [ ] Extract layout code to `ui/layout.ts`
- [ ] Extract menu code to `ui/menu.ts`
- [ ] Create `utils/events.ts` for Tauri event subscriptions
- [ ] Move vivid-api.ts to `api/vivid.ts`
- [ ] Delete unused `vivid-connection.ts`
- [ ] Reduce main.ts to orchestration only

### Files to Create/Modify

| Action | File |
|--------|------|
| Modify | `src/main.ts` → reduce to ~100 lines |
| Create | `src/types.ts` |
| Create | `src/api/tauri.ts` |
| Move | `src/vivid-api.ts` → `src/api/vivid.ts` |
| Create | `src/state/store.ts` |
| Create | `src/ui/editor.ts` |
| Create | `src/ui/terminal.ts` |
| Create | `src/ui/inspector.ts` |
| Create | `src/ui/layout.ts` |
| Create | `src/ui/menu.ts` |
| Create | `src/utils/events.ts` |
| Delete | `src/vivid-connection.ts` |

---

## Phase 4: Event-Driven State Updates

**Priority:** High
**Estimated Changes:** ~100 lines

### Problem

Frontend polls backend every 2 seconds + 100ms for selection.

### Solution

Subscribe to events and update state reactively:

**utils/events.ts:**
```typescript
import { listen } from "@tauri-apps/api/event";
import { setState } from "../state/store";
import type { ProjectInfo, CompileStatusInfo, OperatorInfo } from "../types";

export async function initEvents() {
    await listen<{ ready: boolean }>("vivid:initialized", (e) => {
        console.log("[Events] Vivid initialized:", e.payload);
    });

    await listen<ProjectInfo>("vivid:project-loaded", (e) => {
        setState({ project: e.payload });
    });

    await listen<CompileStatusInfo>("vivid:compile-status", (e) => {
        setState({ compileStatus: e.payload });
    });

    await listen<{ name: string | null }>("vivid:operator-selected", (e) => {
        setState({ selectedOperator: e.payload.name });
    });

    await listen<{ operators: OperatorInfo[] }>("vivid:chain-updated", (e) => {
        setState({ operators: e.payload.operators });
    });
}
```

### Implementation Tasks

- [ ] Set up event listeners in `utils/events.ts`
- [ ] Remove `setInterval` polling loops from main.ts
- [ ] Add debouncing for parameter updates (input → backend)
- [ ] Store unsubscribe functions for cleanup

---

## Phase 5: Error Handling Standardization

**Priority:** Medium
**Estimated Changes:** ~100 lines

### Problem

Inconsistent error handling:

```rust
// Some return bool (lossy)
fn set_param(...) -> bool

// Some return Result (good)
fn reload_project() -> Result<(), String>
```

```typescript
// Some silently ignore errors
invoke("input_mouse_move", ...).catch(() => {})
```

### Solution

**Backend:** All commands return `Result<T, String>`:

```rust
#[tauri::command]
fn set_param(
    op_name: String,
    param_name: String,
    value: [f32; 4],
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.vivid.lock().map_err(|_| "Lock poisoned")?;
    let vivid = guard.as_ref().ok_or("Vivid not initialized")?;
    let chain = vivid.ctx.chain().ok_or("No chain loaded")?;
    let mut op = chain.operator_by_name(&op_name)
        .ok_or_else(|| format!("Operator '{}' not found", op_name))?;

    if op.set_param(&param_name, &value) {
        Ok(())
    } else {
        Err(format!("Failed to set param '{}' on '{}'", param_name, op_name))
    }
}
```

**Frontend:** Handle errors visibly:

```typescript
// utils/errors.ts
export function showError(message: string) {
    // Display in error banner or toast
    const banner = document.getElementById("error-banner");
    if (banner) {
        banner.textContent = message;
        banner.classList.add("visible");
        setTimeout(() => banner.classList.remove("visible"), 5000);
    }
    console.error("[Vivid]", message);
}

// Usage
try {
    await setParam(op, param, value);
} catch (e) {
    showError(`Failed to set ${param}: ${e}`);
}
```

### Implementation Tasks

- [ ] Change all `-> bool` commands to `-> Result<(), String>`
- [ ] Add proper error messages to all failure paths
- [ ] Create `utils/errors.ts` with `showError()` function
- [ ] Replace `.catch(() => {})` with proper error handling
- [ ] Add error banner/toast UI component

---

## Phase 6: Platform Support

**Priority:** Medium (for cross-platform release)
**Estimated Changes:** ~100 lines

### Problem

Only macOS window handle extraction is implemented:

```rust
#[cfg(not(target_os = "macos"))]
fn get_ns_window(...) -> Option<*mut c_void> {
    // TODO: Implement for Windows/Linux
    None
}
```

### Solution

Implement for Windows and Linux:

```rust
#[cfg(target_os = "windows")]
fn get_window_handle(window: &tauri::WebviewWindow) -> Option<*mut c_void> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let tao_window = window.as_ref().window();
    if let Ok(handle) = tao_window.window_handle() {
        match handle.as_raw() {
            RawWindowHandle::Win32(win32_handle) => {
                Some(win32_handle.hwnd.get() as *mut c_void)
            }
            _ => None,
        }
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
fn get_window_handle(window: &tauri::WebviewWindow) -> Option<*mut c_void> {
    // X11 or Wayland - may need feature flags
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let tao_window = window.as_ref().window();
    if let Ok(handle) = tao_window.window_handle() {
        match handle.as_raw() {
            RawWindowHandle::Xlib(xlib_handle) => {
                Some(xlib_handle.window as *mut c_void)
            }
            RawWindowHandle::Xcb(xcb_handle) => {
                Some(xcb_handle.window.get() as *mut c_void)
            }
            _ => None,
        }
    } else {
        None
    }
}
```

**Build.rs for Windows/Linux:**

```rust
#[cfg(target_os = "windows")]
{
    // Windows uses PATH or embedded manifests
    // Library should be in same directory as exe
}

#[cfg(target_os = "linux")]
{
    // Set RPATH for Linux
    let lib_path = Path::new(&manifest_dir).join("../vivid/build/lib");
    if lib_path.exists() {
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/../lib");
    }
}
```

### Implementation Tasks

- [ ] Implement `get_window_handle()` for Windows
- [ ] Implement `get_window_handle()` for Linux (X11/Wayland)
- [ ] Add Linux rpath to build.rs
- [ ] Test on Windows VM
- [ ] Test on Linux VM

---

## Verification Checklist

After each phase, verify:

- [ ] `npm run tauri dev` builds and runs without errors
- [ ] Opening a project loads chain.cpp in editor
- [ ] Chain compiles and renders output
- [ ] Parameter changes apply in real-time
- [ ] Terminal works (shell spawns, input works)
- [ ] Layout persists across restarts
- [ ] Error banner shows compilation errors
- [ ] No console errors in DevTools

---

## Migration Strategy

1. **Phase 1-2 (Backend):** Can be done independently, minimal frontend impact
2. **Phase 3-4 (Frontend):** Should be done together to avoid broken state
3. **Phase 5 (Errors):** Can be done incrementally
4. **Phase 6 (Platforms):** Only needed for non-macOS releases

Recommended order: 1 → 2 → 3+4 → 5 → 6

---

## Risk Mitigation

- **Breaking changes:** Each phase is isolated; can revert if issues found
- **Testing:** Run `npm run tauri dev` after each major change
- **Backup:** Create git branch before starting: `git checkout -b refactor`
