/**
 * React hook for platform capability checks.
 *
 * Usage:
 *   const canUsePty = usePlatformCapability(PlatformCapability.Pty);
 *   if (!canUsePty) return <p>Desktop only</p>;
 *
 * @module hooks/use-platform-capability
 */

import { useMemo } from "react";
import { PlatformCapability, platform } from "@qcut/platform-core";

/**
 * Check if a platform capability is available.
 * Returns a stable boolean that won't change during the session.
 */
export function usePlatformCapability(cap: PlatformCapability): boolean {
	return useMemo(() => {
		try {
			return platform().hasCapability(cap);
		} catch {
			return false;
		}
	}, [cap]);
}

/**
 * Check if running on the desktop (Electron) platform.
 */
export function useIsDesktop(): boolean {
	return useMemo(() => {
		try {
			return platform().isElectron;
		} catch {
			return false;
		}
	}, []);
}

/**
 * Get the current platform identifier.
 */
export function usePlatformId(): "desktop" | "web" | "ios" {
	return useMemo(() => {
		try {
			return platform().platform;
		} catch {
			return "web";
		}
	}, []);
}

export { PlatformCapability };
