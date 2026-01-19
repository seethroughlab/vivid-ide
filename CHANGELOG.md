# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note**: This project is currently in **alpha**. APIs may change between releases.
> The first stable release will be `v0.1.0`.

## [Unreleased]

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

[Unreleased]: https://github.com/seethroughlab/vivid-ide/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/seethroughlab/vivid-ide/releases/tag/v0.1.0-alpha.1
