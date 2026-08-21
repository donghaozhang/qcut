import { platform } from "@qcut/platform-core";

const CSP_ALLOWED = new Set(["fal.media", "v3.fal.media", "v3b.fal.media"]);

export type VideoSource =
	| {
			file: File;
			type: "file";
			/**
			 * `app://local-media/…` URL streaming the same media from disk with
			 * Range support. Preferred over a blob URL when present — the video
			 * element then reads from disk instead of the in-memory File. Players
			 * fall back to the blob path when the protocol source errors (e.g.
			 * the extracted temp file was cleaned up).
			 */
			protocolSrc?: string;
	  }
	| { src: string; type: "remote" }
	| null;

/** Builds the `app://local-media` streaming URL for an absolute disk path. */
export function localMediaUrlForPath(localPath: string): string {
	const bytes = new TextEncoder().encode(localPath);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	const token = btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
	return `app://local-media/${token}`;
}

export function getVideoSource(mediaItem: {
	file?: File;
	url?: string;
	localPath?: string;
}): VideoSource {
	if (mediaItem.file) {
		const protocolSrc =
			mediaItem.localPath && platform().isElectron
				? localMediaUrlForPath(mediaItem.localPath)
				: undefined;
		return { file: mediaItem.file, type: "file", protocolSrc };
	}

	if (mediaItem.url) {
		try {
			const hostname = new URL(mediaItem.url).hostname;
			if (CSP_ALLOWED.has(hostname)) {
				console.log("[media-source] Using remote source", {
					hostname,
					url: mediaItem.url,
				});
				return { src: mediaItem.url, type: "remote" };
			}
			console.warn("[media-source] Remote URL blocked by CSP whitelist", {
				hostname,
				url: mediaItem.url,
			});
		} catch {
			console.warn(
				"[media-source] Invalid mediaItem.url, cannot parse hostname",
				{
					url: mediaItem.url,
				}
			);
		}
	}

	console.warn(
		"[media-source] No playable source available (no file, URL blocked or missing)"
	);
	return null;
}
