// =============================================================================
// MCP Setup UI Module
// =============================================================================

import { checkMcpStatus, configureMcp, type McpStatus } from "../utils/mcp-config";

const MCP_DISMISSED_KEY = "vivid-mcp-banner-dismissed";

/**
 * Check MCP status and show setup banner if needed
 */
export async function initMcpSetup(): Promise<void> {
  console.log("[MCP Setup] Checking configuration...");

  // Check if user previously dismissed the banner
  if (localStorage.getItem(MCP_DISMISSED_KEY) === "true") {
    console.log("[MCP Setup] Banner was previously dismissed");
    return;
  }

  try {
    const status = await checkMcpStatus();
    console.log("[MCP Setup] Status:", status);

    if (!status.vividConfigured) {
      showMcpBanner(status);
    }
  } catch (e) {
    console.error("[MCP Setup] Error checking status:", e);
  }
}

/**
 * Show the MCP setup banner
 */
function showMcpBanner(_status: McpStatus): void {
  const banner = document.getElementById("mcp-banner");
  const setupBtn = document.getElementById("mcp-setup-btn");
  const dismissBtn = document.getElementById("mcp-dismiss");

  if (!banner) return;

  banner.classList.remove("hidden");

  // Setup button handler
  setupBtn?.addEventListener("click", async () => {
    setupBtn.textContent = "Setting up...";
    (setupBtn as HTMLButtonElement).disabled = true;

    const success = await configureMcp();

    if (success) {
      banner.classList.add("hidden");
      showSuccessToast();
    } else {
      setupBtn.textContent = "Set Up";
      (setupBtn as HTMLButtonElement).disabled = false;
      showErrorToast();
    }
  });

  // Dismiss button handler
  dismissBtn?.addEventListener("click", () => {
    banner.classList.add("hidden");
    localStorage.setItem(MCP_DISMISSED_KEY, "true");
  });
}

/**
 * Show a success toast notification
 */
function showSuccessToast(): void {
  const toast = document.createElement("div");
  toast.className = "mcp-toast mcp-toast-success";
  toast.innerHTML = `
    <span class="toast-icon">✓</span>
    <span class="toast-message">MCP configured! Restart Claude Code to use Vivid integration.</span>
  `;
  document.body.appendChild(toast);

  // Add toast styles if not present
  addToastStyles();

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/**
 * Show an error toast notification
 */
function showErrorToast(): void {
  const toast = document.createElement("div");
  toast.className = "mcp-toast mcp-toast-error";
  toast.innerHTML = `
    <span class="toast-icon">✗</span>
    <span class="toast-message">Failed to configure MCP. Check console for details.</span>
  `;
  document.body.appendChild(toast);

  // Add toast styles if not present
  addToastStyles();

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Add toast notification styles dynamically
 */
function addToastStyles(): void {
  if (document.getElementById("mcp-toast-styles")) return;

  const style = document.createElement("style");
  style.id = "mcp-toast-styles";
  style.textContent = `
    .mcp-toast {
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 10000;
      pointer-events: none;
    }

    .mcp-toast.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .mcp-toast-success {
      background: rgba(34, 197, 94, 0.9);
      color: white;
      box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
    }

    .mcp-toast-error {
      background: rgba(239, 68, 68, 0.9);
      color: white;
      box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
    }

    .mcp-toast .toast-icon {
      font-size: 16px;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Reset the dismissed state (for testing)
 */
export function resetMcpDismissed(): void {
  localStorage.removeItem(MCP_DISMISSED_KEY);
}
