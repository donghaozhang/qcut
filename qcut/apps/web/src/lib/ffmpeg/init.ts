/**
 * FFmpeg Initialization
 *
 * Handles loading and initializing the FFmpeg WebAssembly instance
 * with environment-specific strategies and timeout handling.
 */

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { createFFmpeg } from "@/lib/ffmpeg/ffmpeg-loader";
import { debugLog } from "@/lib/debug/debug-config";
import { handleMediaProcessingError } from "@/lib/debug/error-handler";
import { createObjectURL } from "@/lib/media/blob-manager";
import { isElectron, checkEnvironment } from "./environment";
import { getFFmpegResourceUrl } from "./resources";
import { getFFmpegState, setFFmpegState } from "./ffmpeg-state";

/**
 * Initializes the FFmpeg WebAssembly instance
 * Loads FFmpeg core and WASM files with fallback strategies for Electron and browser environments
 * Returns cached instance if already initialized
 */
export const initFFmpeg = async (): Promise<FFmpeg> => {
	const state = getFFmpegState();
	if (state.ffmpeg && state.isFFmpegLoaded) {
		return state.ffmpeg;
	}

	let ffmpeg = state.ffmpeg;
	if (!ffmpeg || !state.isFFmpegLoaded) {
		ffmpeg = await createFFmpeg();
	}

	if (!ffmpeg) {
		throw new Error(
			"Failed to create FFmpeg instance - createFFmpeg() returned null"
		);
	}

	if (typeof ffmpeg.load !== "function") {
		const error = new Error("Invalid FFmpeg instance - missing load() method");
		handleMediaProcessingError(error, "FFmpeg validation", {
			instanceType: typeof ffmpeg,
		});
		throw new Error("Invalid FFmpeg instance - missing load() method");
	}

	setFFmpegState({ ffmpeg });
	const environment = checkEnvironment();

	try {
		let coreUrl, wasmUrl;

		try {
			coreUrl = await getFFmpegResourceUrl("ffmpeg-core.js");
			wasmUrl = await getFFmpegResourceUrl("ffmpeg-core.wasm");
		} catch (resourceError) {
			handleMediaProcessingError(resourceError, "Resolve FFmpeg resources", {
				coreUrl: "ffmpeg-core.js",
				wasmUrl: "ffmpeg-core.wasm",
			});
			throw new Error(
				`Failed to resolve FFmpeg resources: ${resourceError instanceof Error ? resourceError.message : String(resourceError)}`
			);
		}

		const electronMode = isElectron();

		if (electronMode) {
			await loadInElectron(ffmpeg, coreUrl, wasmUrl, environment);
		} else {
			await loadInBrowser(ffmpeg, coreUrl, wasmUrl, environment);
		}

		setFFmpegState({ isFFmpegLoaded: true });
	} catch (error) {
		handleMediaProcessingError(error, "Initialize FFmpeg", {
			hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
			crossOriginIsolated: self.crossOriginIsolated,
		});
		setFFmpegState({ isFFmpegLoaded: false, ffmpeg: null });
		throw error;
	}

	return getFFmpegState().ffmpeg!;
};

/** Load FFmpeg in Electron mode using direct URLs */
async function loadInElectron(
	ffmpeg: FFmpeg,
	coreUrl: string,
	wasmUrl: string,
	environment: { hasSharedArrayBuffer: boolean; hasWorker: boolean }
) {
	console.log("[FFmpeg Utils] 🎯 Using direct URLs for Electron environment");

	try {
		const coreCheck = await fetch(coreUrl, { method: "HEAD" });
		const wasmCheck = await fetch(wasmUrl, { method: "HEAD" });

		if (!coreCheck.ok || !wasmCheck.ok) {
			throw new Error(
				`FFmpeg resources not accessible: core=${coreCheck.ok}, wasm=${wasmCheck.ok}`
			);
		}
	} catch (checkError) {
		console.warn(
			"[FFmpeg Utils] ⚠️ Resource check failed, attempting load anyway:",
			checkError
		);
	}

	const timeoutDuration = 180_000;

	console.log(
		`[FFmpeg Utils] ⏱️ Starting FFmpeg load with ${timeoutDuration / 1000}s timeout...`
	);
	console.log("[FFmpeg Utils] Core URL:", coreUrl);
	console.log("[FFmpeg Utils] WASM URL:", wasmUrl);

	try {
		const loadStartTime = Date.now();

		const loadPromise = ffmpeg.load({
			coreURL: coreUrl,
			wasmURL: wasmUrl,
		});

		const progressInterval = setInterval(() => {
			const elapsed = ((Date.now() - loadStartTime) / 1000).toFixed(1);
			console.log(`[FFmpeg Utils] ⏳ Loading... ${elapsed}s elapsed`);
		}, 5000);

		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => {
				clearInterval(progressInterval);
				reject(
					new Error(
						`FFmpeg load timeout after ${timeoutDuration / 1000} seconds. Check if FFmpeg files are accessible.`
					)
				);
			}, timeoutDuration);
		});

		await Promise.race([loadPromise, timeoutPromise]);
		clearInterval(progressInterval);

		const loadDuration = ((Date.now() - loadStartTime) / 1000).toFixed(2);
		console.log(
			`[FFmpeg Utils] ✅ FFmpeg loaded successfully in ${loadDuration}s`
		);
	} catch (loadError) {
		console.error(
			"[FFmpeg Utils] ❌ Failed to load FFmpeg with direct URLs:",
			loadError
		);
		console.error("[FFmpeg Utils] Environment info:", {
			hasSharedArrayBuffer: environment.hasSharedArrayBuffer,
			hasWorker: environment.hasWorker,
			crossOriginIsolated:
				typeof crossOriginIsolated !== "undefined"
					? crossOriginIsolated
					: false,
			isElectron: true,
		});
		throw loadError;
	}
}

/** Load FFmpeg in browser mode using blob URLs */
async function loadInBrowser(
	ffmpeg: FFmpeg,
	coreUrl: string,
	wasmUrl: string,
	environment: { hasSharedArrayBuffer: boolean; hasWorker: boolean }
) {
	console.log("[FFmpeg Utils] 🌐 Using blob URLs for browser environment");

	let coreResponse, wasmResponse;

	try {
		coreResponse = await fetch(coreUrl);
		wasmResponse = await fetch(wasmUrl);
	} catch (fetchError) {
		handleMediaProcessingError(fetchError, "Fetch FFmpeg resources", {
			coreUrl,
			wasmUrl,
		});
		throw new Error(
			`Network error while fetching FFmpeg resources: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
		);
	}

	if (!coreResponse.ok) {
		const errorMsg = `Failed to fetch ffmpeg-core.js: ${coreResponse.status} ${coreResponse.statusText}`;
		const error = new Error(errorMsg);
		handleMediaProcessingError(error, "Fetch FFmpeg core", {
			status: coreResponse.status,
			statusText: coreResponse.statusText,
		});
		throw new Error(errorMsg);
	}
	if (!wasmResponse.ok) {
		const errorMsg = `Failed to fetch ffmpeg-core.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`;
		const error = new Error(errorMsg);
		handleMediaProcessingError(error, "Fetch FFmpeg WASM", {
			status: wasmResponse.status,
			statusText: wasmResponse.statusText,
		});
		throw new Error(errorMsg);
	}

	let coreBlob, wasmBlob;

	try {
		coreBlob = await coreResponse.blob();
		wasmBlob = await wasmResponse.blob();
	} catch (blobError) {
		handleMediaProcessingError(blobError, "Convert FFmpeg resources to blobs", {
			coreSize: coreResponse.headers.get("content-length"),
			wasmSize: wasmResponse.headers.get("content-length"),
		});
		throw new Error(
			`Failed to convert FFmpeg resources to blobs: ${blobError instanceof Error ? blobError.message : String(blobError)}`
		);
	}

	const coreBlobUrl = createObjectURL(coreBlob, "FFmpeg-core");
	const wasmBlobUrl = createObjectURL(wasmBlob, "FFmpeg-wasm");

	const timeoutDuration = environment.hasSharedArrayBuffer ? 60_000 : 120_000;

	try {
		const loadPromise = ffmpeg.load({
			coreURL: coreBlobUrl,
			wasmURL: wasmBlobUrl,
		});

		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(
				() =>
					reject(
						new Error(
							`FFmpeg load timeout after ${timeoutDuration / 1000} seconds`
						)
					),
				timeoutDuration
			);
		});

		await Promise.race([loadPromise, timeoutPromise]);

		debugLog("[FFmpeg Utils] ✅ FFmpeg core loaded with blob URLs");

		try {
			URL.revokeObjectURL(coreBlobUrl);
			URL.revokeObjectURL(wasmBlobUrl);
		} catch {}
	} catch (loadError) {
		debugLog("[FFmpeg Utils] ❌ FFmpeg load failed:", loadError);

		try {
			console.error("[FFmpeg] WASM load failed from blob URLs", {
				coreBlobUrl,
				wasmBlobUrl,
				isElectron: !!(window as any)?.process?.versions?.electron,
				userAgent: navigator.userAgent,
				error:
					loadError instanceof Error ? loadError.message : String(loadError),
			});
		} catch {}

		try {
			URL.revokeObjectURL(coreBlobUrl);
			URL.revokeObjectURL(wasmBlobUrl);
		} catch {}

		debugLog("[FFmpeg Utils] 🔍 Environment diagnostics:", {
			hasSharedArrayBuffer: environment.hasSharedArrayBuffer,
			crossOriginIsolated: self.crossOriginIsolated,
			timeoutUsed: timeoutDuration / 1000 + "s",
			userAgent: navigator.userAgent,
		});

		const errorMessage =
			loadError instanceof Error ? loadError.message : String(loadError);
		if (errorMessage.includes("timeout")) {
			throw new Error(
				`FFmpeg initialization timed out after ${timeoutDuration / 1000}s. This may be due to slow network, large WASM files, or missing SharedArrayBuffer support.`
			);
		}
		if (errorMessage.includes("SharedArrayBuffer")) {
			throw new Error(
				"FFmpeg requires SharedArrayBuffer support. Please ensure proper COOP/COEP headers are set."
			);
		}
		throw new Error(`FFmpeg initialization failed: ${errorMessage}`);
	}
}

/**
 * Checks if FFmpeg is loaded and ready for use
 */
export const isFFmpegReady = (): boolean => {
	const { ffmpeg, isFFmpegLoaded } = getFFmpegState();
	return ffmpeg !== null && isFFmpegLoaded;
};

/**
 * Gets the current FFmpeg instance without initializing it
 */
export const getFFmpegInstance = (): FFmpeg | null => {
	return getFFmpegState().ffmpeg;
};
