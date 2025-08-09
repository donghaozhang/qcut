/**
 * Debug configuration for controlling console logging
 */

/**
 * Global debug flag - set to true to enable console logging
 * Can be overridden via localStorage or environment variable
 */
const DEBUG_KEY = "qcut_debug_mode";

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  // Check localStorage first (for runtime toggling)
  if (typeof window !== "undefined") {
    const localDebug = localStorage.getItem(DEBUG_KEY);
    if (localDebug !== null) {
      return localDebug === "true";
    }
  }

  // Check environment variable (for build-time configuration)
  if (import.meta.env.VITE_DEBUG_MODE) {
    return import.meta.env.VITE_DEBUG_MODE === "true";
  }

  // Default to false (no debug output)
  return false;
}

/**
 * Enable debug mode
 */
export function enableDebug(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DEBUG_KEY, "true");
  }
}

/**
 * Disable debug mode
 */
export function disableDebug(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DEBUG_KEY, "false");
  }
}

/**
 * Debug logger that only logs when debug mode is enabled
 */
export function debugLog(...args: any[]): void {
  if (isDebugEnabled()) {
    console.log(...args);
  }
}

/**
 * Debug error logger that only logs when debug mode is enabled
 */
export function debugError(...args: any[]): void {
  if (isDebugEnabled()) {
    console.error(...args);
  }
}

/**
 * Debug warn logger that only logs when debug mode is enabled
 */
export function debugWarn(...args: any[]): void {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
}
