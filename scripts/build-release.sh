#!/bin/bash
# =============================================================================
# Vivid IDE - Release Build Script
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VIVID_ROOT="$PROJECT_ROOT/vivid"

echo "============================================="
echo "  Vivid IDE Release Build"
echo "============================================="
echo ""

# Check if vivid submodule is initialized
if [ ! -f "$VIVID_ROOT/CMakeLists.txt" ]; then
    echo "Error: vivid submodule not initialized"
    echo "Run: git submodule update --init --recursive"
    exit 1
fi

# Check if vivid is built
if [ ! -d "$VIVID_ROOT/build/lib" ]; then
    echo "Building vivid runtime..."
    cd "$VIVID_ROOT"
    mkdir -p build && cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j$(sysctl -n hw.ncpu)
    cd "$PROJECT_ROOT"
    echo "Vivid runtime built successfully"
else
    echo "Vivid runtime already built"
fi

# Parse arguments
UNIVERSAL=false
DEBUG=false
SIGN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --universal)
            UNIVERSAL=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --sign)
            SIGN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build command
cd "$PROJECT_ROOT"

BUILD_CMD="npm run tauri build"

if [ "$DEBUG" = true ]; then
    BUILD_CMD="$BUILD_CMD -- --debug"
fi

if [ "$UNIVERSAL" = true ]; then
    echo "Building universal binary (arm64 + x86_64)..."
    BUILD_CMD="$BUILD_CMD -- --target universal-apple-darwin"
else
    echo "Building for current architecture..."
fi

echo ""
echo "Running: $BUILD_CMD"
echo ""

eval $BUILD_CMD

# Find the built app
if [ "$DEBUG" = true ]; then
    BUILD_DIR="$PROJECT_ROOT/src-tauri/target/debug/bundle/macos"
else
    BUILD_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/macos"
fi

if [ "$UNIVERSAL" = true ]; then
    BUILD_DIR="$PROJECT_ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos"
fi

echo ""
echo "============================================="
echo "  Build Complete!"
echo "============================================="
echo ""
echo "App bundle: $BUILD_DIR/Vivid.app"

if [ -f "$BUILD_DIR/Vivid.dmg" ]; then
    echo "DMG installer: $BUILD_DIR/Vivid.dmg"
fi

echo ""

# Optional: Open the build directory
if command -v open &> /dev/null; then
    echo "Opening build directory..."
    open "$BUILD_DIR"
fi
