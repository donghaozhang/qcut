import { app } from "electron";
import path from "node:path";

export const VIDEO_PREVIEW_PROXY_PROTOCOL_PATH = "video-preview-proxy";
const CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/;

export function getVideoPreviewProxyCacheDir(): string {
	return path.join(app.getPath("userData"), "video-preview-proxies");
}

export function getVideoPreviewProxyPath({
	cacheKey,
}: {
	cacheKey: string;
}): string {
	if (!CACHE_KEY_PATTERN.test(cacheKey)) {
		throw new Error("Invalid video preview proxy cache key");
	}
	return path.join(getVideoPreviewProxyCacheDir(), `${cacheKey}.mp4`);
}

export function getVideoPreviewProxyUrl({
	cacheKey,
}: {
	cacheKey: string;
}): string {
	if (!CACHE_KEY_PATTERN.test(cacheKey)) {
		throw new Error("Invalid video preview proxy cache key");
	}
	return `app://${VIDEO_PREVIEW_PROXY_PROTOCOL_PATH}/${cacheKey}.mp4`;
}

export function resolveVideoPreviewProxyFilename({
	filename,
}: {
	filename: string;
}): string | null {
	const match = /^([a-f0-9]{64})\.mp4$/.exec(filename);
	if (!match?.[1]) return null;
	return getVideoPreviewProxyPath({ cacheKey: match[1] });
}
