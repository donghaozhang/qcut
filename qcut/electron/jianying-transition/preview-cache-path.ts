import { app } from "electron";
import path from "node:path";

export const JIANYING_TRANSITION_PREVIEW_PROTOCOL_PATH =
	"jianying-transition-preview";
const CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/;

export function getJianyingTransitionPreviewCacheDir(): string {
	return path.join(
		app.getPath("userData"),
		"Cache",
		"jianying-transition-previews",
		"v1"
	);
}

export function getJianyingTransitionPreviewPath({
	cacheKey,
}: {
	cacheKey: string;
}): string {
	if (!CACHE_KEY_PATTERN.test(cacheKey)) {
		throw new Error("Invalid Jianying transition preview cache key");
	}
	return path.join(getJianyingTransitionPreviewCacheDir(), `${cacheKey}.mp4`);
}

export function getJianyingTransitionPreviewUrl({
	cacheKey,
}: {
	cacheKey: string;
}): string {
	if (!CACHE_KEY_PATTERN.test(cacheKey)) {
		throw new Error("Invalid Jianying transition preview cache key");
	}
	return `app://${JIANYING_TRANSITION_PREVIEW_PROTOCOL_PATH}/${cacheKey}.mp4`;
}

export function resolveJianyingTransitionPreviewFilename({
	filename,
}: {
	filename: string;
}): string | null {
	const match = /^([a-f0-9]{64})\.mp4$/.exec(filename);
	if (!match?.[1]) return null;
	return getJianyingTransitionPreviewPath({ cacheKey: match[1] });
}
