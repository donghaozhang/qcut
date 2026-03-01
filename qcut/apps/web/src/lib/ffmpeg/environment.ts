/**
 * FFmpeg Environment Detection & Validation
 *
 * Detects runtime environment (Electron, browser, packaged)
 * and checks for required browser features.
 */

/**
 * Detects if the application is running in Electron environment
 */
export const isElectron = () => {
	return (
		(typeof window !== "undefined" &&
			(window as any).process &&
			(window as any).process.type === "renderer") ||
		(typeof navigator !== "undefined" &&
			navigator.userAgent.toLowerCase().indexOf("electron") > -1) ||
		(typeof window !== "undefined" && window.electronAPI)
	);
};

/**
 * Detects if running in a packaged Electron application (vs development)
 */
export const isPackagedElectron = () => {
	return (
		isElectron() &&
		typeof window !== "undefined" &&
		window.location.protocol === "file:" &&
		window.location.pathname.includes("/resources/app/")
	);
};

/**
 * Performs environment diagnostics for FFmpeg compatibility
 * Checks for required browser features like SharedArrayBuffer and Workers
 */
export const checkEnvironment = () => {
	const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
	const hasWorker = typeof Worker !== "undefined";

	if (!hasSharedArrayBuffer) {
		console.warn(
			"[FFmpeg Utils] ⚠️ SharedArrayBuffer not available - performance may be degraded"
		);
		console.warn(
			"[FFmpeg Utils] ⚠️ This may be due to missing COOP/COEP headers or insecure context"
		);
	}

	if (!hasWorker) {
		console.warn(
			"[FFmpeg Utils] ⚠️ Worker API not available - FFmpeg may not function properly"
		);
	}

	return { hasSharedArrayBuffer, hasWorker };
};
