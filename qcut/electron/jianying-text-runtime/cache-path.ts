import os from "node:os";
import path from "node:path";

export const JIANYING_TEXT_PREVIEW_PROTOCOL_PATH = "jianying-text-preview";
const CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/;

function requireCacheKey({ cacheKey }: { cacheKey: string }) {
	if (!CACHE_KEY_PATTERN.test(cacheKey)) {
		throw new Error("Invalid Jianying text render cache key");
	}
	return cacheKey;
}

export function getJianyingTextRenderCacheRoot() {
	return path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-text-runtime",
		"renders"
	);
}

export function getJianyingTextRenderCacheDirectory({
	cacheKey,
}: {
	cacheKey: string;
}) {
	return path.join(
		getJianyingTextRenderCacheRoot(),
		requireCacheKey({ cacheKey })
	);
}

export function getJianyingTextPreviewVideoPath({
	cacheKey,
}: {
	cacheKey: string;
}) {
	return path.join(
		getJianyingTextRenderCacheDirectory({ cacheKey }),
		"preview.webm"
	);
}

export function getJianyingTextPreviewVideoUrl({
	cacheKey,
}: {
	cacheKey: string;
}) {
	requireCacheKey({ cacheKey });
	return `app://${JIANYING_TEXT_PREVIEW_PROTOCOL_PATH}/${cacheKey}.webm`;
}

export function resolveJianyingTextPreviewFilename({
	filename,
}: {
	filename: string;
}) {
	const match = /^([a-f0-9]{64})\.webm$/.exec(filename);
	return match?.[1]
		? getJianyingTextPreviewVideoPath({ cacheKey: match[1] })
		: null;
}
