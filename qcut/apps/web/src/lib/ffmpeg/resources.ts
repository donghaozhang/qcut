/**
 * FFmpeg WASM Resource URL Resolution
 *
 * Resolves FFmpeg WebAssembly resource URLs with multiple fallback strategies
 * for different environments (Electron app://, HTTP dev, relative paths).
 */

/**
 * Resolves FFmpeg WebAssembly resource URLs with fallback strategies
 * Tries app:// protocol first, then falls back to HTTP and relative paths
 */
export const getFFmpegResourceUrl = async (
	filename: string
): Promise<string> => {
	// Try app:// protocol first
	try {
		const appUrl = `app://ffmpeg/${filename}`;
		const response = await fetch(appUrl);
		if (response.ok) {
			console.log(`[FFmpeg Utils] ✅ App protocol succeeded for ${filename}`);
			return appUrl;
		}
	} catch (error) {
		console.warn(
			`[FFmpeg Utils] ⚠️ App protocol failed for ${filename}:`,
			error
		);
	}

	// Fallback to app relative (packaged) or HTTP dev server
	try {
		const isFileProtocol =
			typeof window !== "undefined" && window.location.protocol === "file:";
		const rawBase = import.meta.env.BASE_URL || document.baseURI || "";
		const baseUrl = rawBase.replace(/\/$/, "");
		const httpUrl = isFileProtocol
			? `./ffmpeg/${filename}`
			: `${baseUrl}/ffmpeg/${filename}`;
		const response = await fetch(httpUrl);
		if (response.ok) {
			console.log(`[FFmpeg Utils] ✅ HTTP fallback succeeded for ${filename}`);
			return httpUrl;
		}
	} catch (error) {
		console.warn(
			`[FFmpeg Utils] ⚠️ HTTP fallback failed for ${filename}:`,
			error
		);
	}

	// Final fallback to public relative path
	try {
		const relativeUrl = `/ffmpeg/${filename}`;
		const response = await fetch(relativeUrl);
		if (response.ok) {
			console.log(
				`[FFmpeg Utils] ✅ Relative path fallback succeeded for ${filename}`
			);
			return relativeUrl;
		}
	} catch (error) {
		console.warn(
			`[FFmpeg Utils] ⚠️ Relative path fallback failed for ${filename}:`,
			error
		);
	}

	throw new Error(`Could not resolve FFmpeg resource: ${filename}`);
};
