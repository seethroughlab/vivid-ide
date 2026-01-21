// =============================================================================
// Performance Panel for dock-spawn-ts
// =============================================================================

import { store, subscribeToKey } from "../../../state/store";
import type { PerformanceStats } from "../../../types";

// Canvas contexts for graphs
let fpsCanvas: HTMLCanvasElement | null = null;
let fpsCtx: CanvasRenderingContext2D | null = null;
let memoryCanvas: HTMLCanvasElement | null = null;
let memoryCtx: CanvasRenderingContext2D | null = null;

// Keep track of unsubscribers
const unsubscribers: (() => void)[] = [];

/**
 * Create the performance panel element
 */
export function createPerformancePanel(): HTMLElement {
  const element = document.createElement("div");
  element.className = "performance-panel-content";
  element.innerHTML = `
    <div class="perf-section">
      <div class="perf-section-title">Frame Rate</div>
      <div class="perf-row">
        <span class="perf-label">FPS</span>
        <span id="perf-fps-value" class="perf-value">--</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">Frame Time</span>
        <span id="perf-frametime-value" class="perf-value">-- ms</span>
      </div>
      <div class="perf-graph-label">FPS History</div>
      <div class="perf-graph-container">
        <canvas id="perf-fps-graph"></canvas>
      </div>
    </div>

    <div class="perf-section">
      <div class="perf-section-title">Memory</div>
      <div class="perf-row">
        <span class="perf-label">Process Memory</span>
        <span id="perf-memory-value" class="perf-value">-- MB</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">Texture Memory</span>
        <span id="perf-texmem-value" class="perf-value">--</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">Operators</span>
        <span id="perf-opcount-value" class="perf-value">--</span>
      </div>
      <div class="perf-graph-label">Memory History</div>
      <div class="perf-graph-container">
        <canvas id="perf-memory-graph"></canvas>
      </div>
    </div>
  `;

  // Subscribe to performance stats changes
  unsubscribers.push(
    subscribeToKey("performanceStats", (state) => {
      updatePerformanceDisplay(element, state.performanceStats);
    })
  );

  // Start performance polling
  store.startPerformancePolling();

  // Initial render
  const state = store.get();
  updatePerformanceDisplay(element, state.performanceStats);

  console.log("[PerformancePanel] Initialized");

  return element;
}

/**
 * Cleanup resources
 */
export function cleanupPerformancePanel(): void {
  store.stopPerformancePolling();
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers.length = 0;
  fpsCanvas = null;
  fpsCtx = null;
  memoryCanvas = null;
  memoryCtx = null;
}

// =============================================================================
// Display Updates
// =============================================================================

function updatePerformanceDisplay(container: HTMLElement, stats: PerformanceStats): void {
  // Update FPS value
  const fpsValue = container.querySelector("#perf-fps-value");
  if (fpsValue) {
    fpsValue.textContent = stats.fps.toFixed(0);
    fpsValue.className = "perf-value " + getFpsClass(stats.fps);
  }

  // Update frame time value
  const frameTimeValue = container.querySelector("#perf-frametime-value");
  if (frameTimeValue) {
    frameTimeValue.textContent = stats.frame_time_ms.toFixed(1) + " ms";
  }

  // Update texture memory
  const texMemValue = container.querySelector("#perf-texmem-value");
  if (texMemValue) {
    texMemValue.textContent = formatBytes(stats.texture_memory_bytes);
  }

  // Update operator count
  const opCountValue = container.querySelector("#perf-opcount-value");
  if (opCountValue) {
    opCountValue.textContent = stats.operator_count.toString();
  }

  // Update memory value (latest from history)
  const memValue = container.querySelector("#perf-memory-value");
  if (memValue && stats.memory_history.length > 0) {
    const latestMem = stats.memory_history[stats.memory_history.length - 1];
    memValue.textContent = latestMem.toFixed(1) + " MB";
  }

  // Draw FPS graph
  drawFpsGraph(container, stats.fps_history);

  // Draw memory graph
  drawMemoryGraph(container, stats.memory_history);
}

function getFpsClass(fps: number): string {
  if (fps >= 55) return "good";
  if (fps >= 30) return "warn";
  return "bad";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// =============================================================================
// Graph Drawing
// =============================================================================

function drawFpsGraph(container: HTMLElement, data: number[]): void {
  if (!fpsCanvas) {
    fpsCanvas = container.querySelector("#perf-fps-graph") as HTMLCanvasElement;
    if (fpsCanvas) {
      fpsCtx = fpsCanvas.getContext("2d");
    }
  }

  if (!fpsCtx || !fpsCanvas || data.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = fpsCanvas.getBoundingClientRect();

  // Set canvas size for high DPI
  fpsCanvas.width = rect.width * dpr;
  fpsCanvas.height = rect.height * dpr;
  fpsCtx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = 2;

  // Clear
  fpsCtx.clearRect(0, 0, width, height);

  // Calculate range (0 to 120 FPS)
  const minVal = 0;
  const maxVal = 120;
  const range = maxVal - minVal;

  // Draw 60 FPS reference line
  fpsCtx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  fpsCtx.lineWidth = 1;
  fpsCtx.beginPath();
  const y60 = height - padding - ((60 - minVal) / range) * (height - padding * 2);
  fpsCtx.moveTo(padding, y60);
  fpsCtx.lineTo(width - padding, y60);
  fpsCtx.stroke();

  // Draw line
  fpsCtx.beginPath();
  fpsCtx.strokeStyle = "#4EC9B0";
  fpsCtx.lineWidth = 1.5;

  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((data[i] - minVal) / range) * (height - padding * 2);

    if (i === 0) {
      fpsCtx.moveTo(x, y);
    } else {
      fpsCtx.lineTo(x, y);
    }
  }
  fpsCtx.stroke();

  // Draw current value dot
  if (data.length > 0) {
    const lastVal = data[data.length - 1];
    const lastY = height - padding - ((lastVal - minVal) / range) * (height - padding * 2);
    fpsCtx.beginPath();
    fpsCtx.fillStyle = "#4EC9B0";
    fpsCtx.arc(width - padding, lastY, 3, 0, Math.PI * 2);
    fpsCtx.fill();
  }
}

function drawMemoryGraph(container: HTMLElement, data: number[]): void {
  if (!memoryCanvas) {
    memoryCanvas = container.querySelector("#perf-memory-graph") as HTMLCanvasElement;
    if (memoryCanvas) {
      memoryCtx = memoryCanvas.getContext("2d");
    }
  }

  if (!memoryCtx || !memoryCanvas || data.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = memoryCanvas.getBoundingClientRect();

  // Set canvas size for high DPI
  memoryCanvas.width = rect.width * dpr;
  memoryCanvas.height = rect.height * dpr;
  memoryCtx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = 2;

  // Clear
  memoryCtx.clearRect(0, 0, width, height);

  // Calculate range from data
  const minVal = Math.min(...data) * 0.9;
  const maxVal = Math.max(...data) * 1.1;
  const range = maxVal - minVal || 1;

  // Draw fill
  memoryCtx.beginPath();
  memoryCtx.fillStyle = "rgba(220, 220, 170, 0.2)";

  memoryCtx.moveTo(padding, height - padding);
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((data[i] - minVal) / range) * (height - padding * 2);
    memoryCtx.lineTo(x, y);
  }
  memoryCtx.lineTo(width - padding, height - padding);
  memoryCtx.closePath();
  memoryCtx.fill();

  // Draw line
  memoryCtx.beginPath();
  memoryCtx.strokeStyle = "#DCDCAA";
  memoryCtx.lineWidth = 1.5;

  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((data[i] - minVal) / range) * (height - padding * 2);

    if (i === 0) {
      memoryCtx.moveTo(x, y);
    } else {
      memoryCtx.lineTo(x, y);
    }
  }
  memoryCtx.stroke();

  // Draw current value dot
  if (data.length > 0) {
    const lastVal = data[data.length - 1];
    const lastY = height - padding - ((lastVal - minVal) / range) * (height - padding * 2);
    memoryCtx.beginPath();
    memoryCtx.fillStyle = "#DCDCAA";
    memoryCtx.arc(width - padding, lastY, 3, 0, Math.PI * 2);
    memoryCtx.fill();
  }
}
