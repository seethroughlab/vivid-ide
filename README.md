# Vivid IDE

Visual creative coding IDE with integrated runtime, node-based chain visualizer,
and built-in terminal for Claude Code.

## Installation

### Option 1: Download IDE (Recommended)

Download the latest release for your platform from the [Releases page](https://github.com/seethroughlab/vivid-ide/releases).

- **macOS (Apple Silicon)**: `Vivid-IDE-vX.X.X-macos-arm64.dmg`
- **macOS (Intel)**: `Vivid-IDE-vX.X.X-macos-x64.dmg`
- **Windows**: `Vivid-IDE-vX.X.X-windows-x64.msi`
- **Linux**: `Vivid-IDE-vX.X.X-linux-x64.AppImage`

### Option 2: Build from Source

```bash
# Clone with submodule
git clone --recursive https://github.com/seethroughlab/vivid-ide.git
cd vivid-ide

# Build the vivid runtime first
cd vivid && cmake -B build && cmake --build build && cd ..

# Install dependencies and build IDE
npm install
npm run tauri build
```

### Option 3: Development Mode

```bash
# Clone with submodule
git clone --recursive https://github.com/seethroughlab/vivid-ide.git
cd vivid-ide

# Build vivid runtime
cd vivid && cmake -B build && cmake --build build && cd ..

# Run in development mode
npm install
npm run tauri dev
```

## Features

- **Visual Chain Editor**: Node-based graph for building operator chains
- **Live Preview**: Real-time rendering with hot-reload on save
- **Monaco Editor**: Full-featured code editor with C++/WGSL syntax highlighting
- **Integrated Terminal**: Built-in terminal for Claude Code integration
- **Parameter Inspector**: Live parameter controls with sliders, color pickers, etc.
- **Keyboard Shortcuts**: Cmd+1/2/3 for panels, Cmd+S to save, etc.

## Requirements

- macOS 10.15+ / Windows 10+ / Linux
- GPU with WebGPU support (Metal on macOS, Vulkan/DX12 on Windows/Linux)

## License

MIT License - See [LICENSE](LICENSE) for details.
