# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note**: This project is currently in **alpha**. APIs may change between releases.
> The first stable release will be `v0.1.0`.

## [Unreleased]

## [0.1.0-alpha.3] - 2026-01-20

*dock-spawn-ts layout system, performance panel, menu fixes*

### Added

- **Performance panel** - Real-time performance monitoring with:
  - FPS display with color-coded status (green/yellow/red)
  - Frame time measurement
  - Process memory usage tracking
  - Texture memory estimation
  - Operator count display
  - Historical graphs for FPS and memory (120 data points)
  - Accessible via View > Performance (Cmd+5)

- **dock-spawn-ts layout system** - Replaced custom panel system with dock-spawn-ts:
  - Drag-and-drop panel rearrangement
  - Tabbed panel groups
  - Resizable splitters
  - Layout persistence to localStorage
  - Auto-restore layout on startup

### Fixed

- **View menu panel restoration** - Fixed View menu items not working after panels were closed:
  - Panels now properly re-dock when opened via menu
  - Added `isPanelInDockTree()` check to detect closed panels
  - `showPanel()` creates new PanelContainer if panel was closed
  - `togglePanel()` now properly closes/opens panels

- **Menu accelerators** - Renumbered View menu shortcuts after removing Preview panel:
  - Terminal: Cmd+1
  - Editor: Cmd+2
  - Output: Cmd+3
  - Parameters: Cmd+4
  - Performance: Cmd+5

### Changed

- Migrated from custom panel management to dock-spawn-ts library
- Panel styling unified with consistent dark backgrounds (`rgba(20, 20, 25, 0.9)`)
- Removed unused Preview panel and menu item

## [0.1.0-alpha.2] - 2026-01-19

### Fixed

- **Video loop crash** - Fixed crash when video loops by preserving AVAsset during seek operations and adding RenderLock to prevent GPU state conflicts
- **Choppy rendering** - Added 240Hz timer thread to continuously wake the event loop, supporting high refresh rate displays
- **Console output** - Restored stdout/stderr capture that forwards vivid output to the IDE console panel
- **Video initialization** - Optimized AVPlayer timeout (300ms) for faster fallback to AVAssetReader decoder in Tauri environment

### Changed

- Render loop now wakes at 240Hz instead of relying solely on system events, ensuring smooth animation regardless of user input
- AVFDecoder now uses `cleanupReader()` helper to safely reset video reader without destroying the asset

## [0.1.0-alpha.1] - 2026-01-19

*Initial release - Tauri-based IDE for Vivid creative coding*

### Added

#### Core IDE Features
- **Three-panel layout** - Terminal (Claude Code), Editor (Monaco), Preview (transparent for wgpu rendering)
- **Monaco editor** - Full-featured code editor with C++ syntax highlighting, auto-save, and keyboard shortcuts
- **Integrated terminal** - xterm.js terminal with Claude Code integration via PTY
- **Parameter inspector** - Real-time slider control for operator parameters with value display
- **Operator list** - Visual list of chain operators with selection highlighting
- **Panel management** - Collapsible panels with persistent layout state

#### Vivid Integration
- **Embedded vivid runtime** - Native vivid context with WebGPU rendering through transparent window
- **Hot-reload support** - Chain.cpp changes automatically recompile and update
- **Live parameter editing** - Slider changes applied to running chain in real-time
- **Compile error display** - Error banner with file location and message

#### MCP Configuration
- **Auto-detection** - Checks `~/.claude.json` for vivid MCP server configuration on startup
- **Setup banner** - Prompts users to configure Claude Code integration if not set up
- **One-click setup** - Automatically configures MCP server entry in Claude config
- **Dismissible** - Banner can be dismissed with preference saved to localStorage

#### macOS App Support
- **App bundling** - Full macOS .app bundle with proper Info.plist configuration
- **DMG creation** - Build script generates distributable DMG installer
- **Custom icon** - Vivid "V" logo with glowing nodes and depth effects
- **Native menu** - macOS menu bar integration with File operations

#### Architecture
- **Tauri 2.0** - Modern Rust + TypeScript architecture with security capabilities
- **FFI layer** - Clean separation: vivid-sys (unsafe FFI) → vivid (safe wrapper) → src-tauri (app)
- **Modular frontend** - TypeScript modules: api/, state/, ui/, utils/
- **Event-driven updates** - Tauri events replace polling for state synchronization
- **Managed state** - Tauri state management pattern instead of global mutexes

### Technical Details

- Built with Tauri 2.0, Vite, TypeScript
- Monaco Editor for code editing
- xterm.js for terminal emulation
- Rust backend with vivid FFI bindings
- WebGPU rendering through transparent window layer
- Cross-platform targeting (macOS primary, Windows/Linux planned)

### Repository Structure

```
src/                  Frontend TypeScript
  api/                Tauri command wrappers
  state/              Centralized state management
  ui/                 UI modules (editor, terminal, inspector, etc.)
  utils/              Event handling utilities
src-tauri/            Rust backend
  src/                Tauri app + commands
  crates/             Workspace crates
    vivid-sys/        Unsafe FFI bindings
    vivid/            Safe Rust wrapper
```

[Unreleased]: https://github.com/seethroughlab/vivid-ide/compare/v0.1.0-alpha.3...HEAD
[0.1.0-alpha.3]: https://github.com/seethroughlab/vivid-ide/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/seethroughlab/vivid-ide/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/seethroughlab/vivid-ide/releases/tag/v0.1.0-alpha.1
