// =============================================================================
// Type-safe Tauri API wrapper
// =============================================================================

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Re-export for convenience
export { getCurrentWindow };

/**
 * Type-safe invoke wrapper
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

/**
 * Type-safe event listener
 */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  return tauriListen<T>(event, (event) => handler(event.payload));
}

/**
 * Listen to an event once and automatically unsubscribe
 */
export async function listenOnce<T>(
  event: string,
  handler: (payload: T) => void
): Promise<void> {
  const unlisten = await tauriListen<T>(event, (event) => {
    handler(event.payload);
    unlisten();
  });
}
