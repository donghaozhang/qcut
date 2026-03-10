/**
 * Platform adapter singleton provider.
 *
 * Call `initPlatform()` once at app startup with the appropriate adapter.
 * Then use `platform()` anywhere to access the platform API.
 *
 * @module @qcut/platform-core/provider
 */

import type { PlatformAPI } from "./types/platform.js";

let _platform: PlatformAPI | null = null;

/**
 * Initialize the global platform adapter.
 * Must be called once at app startup before any `platform()` calls.
 */
export function initPlatform(adapter: PlatformAPI): void {
	_platform = adapter;
}

/**
 * Get the current platform adapter.
 * Throws if `initPlatform()` has not been called.
 */
export function platform(): PlatformAPI {
	if (!_platform) {
		throw new Error(
			"Platform not initialized. Call initPlatform() at app startup."
		);
	}
	return _platform;
}
