/**
 * Barrel re-export for backwards compatibility.
 * All consuming files import from "@/lib/ffmpeg/ffmpeg-utils".
 * Actual implementation split across:
 *   - environment.ts - runtime detection
 *   - resources.ts - WASM URL resolution
 *   - lifecycle.ts - cleanup scheduling
 *   - ffmpeg-state.ts - shared global state
 *   - init.ts - initialization
 *   - operations.ts - video processing + cleanup
 */

// Blob error listener (side effect)
let blobErrorListenerAdded = false;
if (typeof window !== "undefined" && !blobErrorListenerAdded) {
	window.addEventListener("error", (e: ErrorEvent) => {
		const msg = String(e?.message || "");
		const file = (e as any)?.filename || "";
		if (file?.startsWith("blob:") || msg.includes("Failed to load resource")) {
			console.error("[Blob] Resource loading failure detected", {
				file,
				msg,
				error: e.error,
			});
		}
	});
	blobErrorListenerAdded = true;
}

export { initFFmpeg, isFFmpegReady, getFFmpegInstance } from "./init";
export {
	generateThumbnail,
	trimVideo,
	getVideoInfo,
	convertToWebM,
	extractAudio,
	terminateFFmpeg,
	forceFFmpegCleanup,
} from "./operations";
