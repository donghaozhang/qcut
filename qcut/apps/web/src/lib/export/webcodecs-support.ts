/**
 * WebCodecs capability detection for iPad/browser export.
 *
 * Checks whether the current browser supports the WebCodecs APIs
 * needed for mediabunny-based MP4 muxing without FFmpeg.
 */

/** Check if all WebCodecs APIs needed for muxer export are available. */
export function supportsWebCodecsExport(): boolean {
	return (
		typeof VideoEncoder !== "undefined" &&
		typeof VideoFrame !== "undefined" &&
		typeof EncodedVideoChunk !== "undefined"
	);
}

/**
 * Check if H.264 (AVC) encoding is supported by the browser.
 * Returns the codec string if supported, or null.
 */
export async function getH264Support(): Promise<string | null> {
	if (!supportsWebCodecsExport()) return null;

	// Test H.264 profiles in preference order
	const profiles = [
		"avc1.640028", // High L4.0
		"avc1.4d0028", // Main L4.0
		"avc1.42001e", // Baseline L3.0
	];

	for (const codec of profiles) {
		try {
			const result = await VideoEncoder.isConfigSupported({
				codec,
				width: 1920,
				height: 1080,
				bitrate: 8_000_000,
				framerate: 30,
			});
			if (result.supported) return codec;
		} catch {
			// Try next profile
		}
	}

	return null;
}

/**
 * Determine the best video codec available for muxer export.
 * Prefers H.264 (MP4) but falls back to VP8 (WebM).
 */
export async function getBestMuxerCodec(): Promise<{
	codec: "avc" | "vp8";
	codecString: string;
	container: "mp4" | "webm";
} | null> {
	const h264 = await getH264Support();
	if (h264) {
		return { codec: "avc", codecString: h264, container: "mp4" };
	}

	// Fallback: VP8 in WebM
	if (!supportsWebCodecsExport()) return null;

	try {
		const result = await VideoEncoder.isConfigSupported({
			codec: "vp8",
			width: 1920,
			height: 1080,
			bitrate: 8_000_000,
			framerate: 30,
		});
		if (result.supported) {
			return { codec: "vp8", codecString: "vp8", container: "webm" };
		}
	} catch {
		// Not supported
	}

	return null;
}
