/**
 * Platform environment detection and adapter initialization.
 *
 * Must be called before any platform API usage.
 * Detects whether running in Electron or browser and loads
 * the appropriate adapter.
 *
 * @module platform-init
 */

import { initPlatform } from "@qcut/platform-core";

/** Detect if we're running inside Electron. */
function detectElectron(): boolean {
	return (
		typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron
	);
}

/**
 * Initialize the platform adapter based on runtime environment.
 * Call once at app startup before rendering.
 */
export async function setupPlatform(): Promise<void> {
	if (detectElectron()) {
		const { createDesktopAdapter } = await import("@qcut/platform-desktop");
		initPlatform(createDesktopAdapter());
	} else {
		const { createWebAdapter } = await import("@qcut/platform-web");
		initPlatform(createWebAdapter());
	}
}
