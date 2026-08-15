import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import type {
	JianyingEffectPreviewRequest,
	JianyingEffectPreviewResult,
} from "../jianying-effect-contract.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import {
	renderJianyingEffectClip,
	runJianyingEffectProcess,
} from "./render.js";
import { inspectJianyingEffectRuntime } from "./runtime-discovery.js";

const PREVIEW_CACHE_VERSION = 1;
const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;
const PREVIEW_FPS = 12;
/**
 * Effects are frequently identity near t=0, so the still is taken from part way
 * through the animation rather than its first frame.
 */
const PREVIEW_SECONDS = 0.75;
const PREVIEW_SOURCE_IMAGE = "neon-city.webp";
const MAX_PREVIEW_SECONDS = 10;

/**
 * Clamped once, up front — the cache key, the render, and the frame selection
 * must all see the same value, or values past the cap would each miss the
 * cache while producing the same image.
 */
function clampPreviewSeconds({ requested }: { requested?: number }): number {
	const value = requested ?? PREVIEW_SECONDS;
	if (!Number.isFinite(value) || value < 0) {
		throw new Error("特效预览时间点无效。");
	}
	return Math.min(value, MAX_PREVIEW_SECONDS);
}

/**
 * Rendering a preview costs a full native session, so identical concurrent
 * requests share one render instead of racing to write the same cache file.
 */
const inFlightPreviews = new Map<
	string,
	Promise<JianyingEffectPreviewResult>
>();

function previewCacheDirectory(): string {
	return path.join(
		app.getPath("userData"),
		"Cache",
		"jianying-effect-previews",
		`v${PREVIEW_CACHE_VERSION}`
	);
}

function cacheKey({
	request,
	packageHash,
	seconds,
}: {
	request: JianyingEffectPreviewRequest;
	packageHash: string;
	seconds: number;
}): string {
	const adjust = (request.adjustValues ?? [])
		.map((entry) => `${entry.key}=${entry.value}`)
		.sort()
		.join(",");
	return createHash("sha256")
		.update([request.effectId, packageHash, String(seconds), adjust].join("|"))
		.digest("hex");
}

function resolvePreviewSourceImage(): string[] {
	return [
		path.join(
			app.getAppPath(),
			"apps/web/dist/images/filter-previews",
			PREVIEW_SOURCE_IMAGE
		),
		path.join(
			app.getAppPath(),
			"apps/web/public/images/filter-previews",
			PREVIEW_SOURCE_IMAGE
		),
		path.join(
			process.cwd(),
			"apps/web/public/images/filter-previews",
			PREVIEW_SOURCE_IMAGE
		),
	];
}

async function firstReadableFile({
	candidates,
}: {
	candidates: string[];
}): Promise<string> {
	for (const candidate of candidates) {
		try {
			await readFile(candidate);
			return candidate;
		} catch {
			// try the next location
		}
	}
	throw new Error("未找到特效预览底图。");
}

export function getJianyingEffectPreview({
	request,
}: {
	request: JianyingEffectPreviewRequest;
}): Promise<JianyingEffectPreviewResult> {
	const shareKey = JSON.stringify([
		request.effectId,
		clampPreviewSeconds({ requested: request.seconds }),
		request.adjustValues ?? [],
	]);
	const existing = inFlightPreviews.get(shareKey);
	if (existing) return existing;

	const pending = renderPreview({ request }).finally(() => {
		inFlightPreviews.delete(shareKey);
	});
	inFlightPreviews.set(shareKey, pending);
	return pending;
}

async function renderPreview({
	request,
}: {
	request: JianyingEffectPreviewRequest;
}): Promise<JianyingEffectPreviewResult> {
	const inspection = await inspectJianyingEffectRuntime();
	const definition = inspection.effects.find(
		(effect) => effect.id === request.effectId
	);
	if (!definition) {
		throw new Error(`未找到本机剪映特效：${request.effectId}`);
	}
	if (!definition.supported) {
		throw new Error(definition.unsupportedReason ?? "该特效暂不支持本机渲染。");
	}

	const seconds = clampPreviewSeconds({ requested: request.seconds });
	const key = cacheKey({
		request,
		packageHash: definition.packageHash,
		seconds,
	});
	const cacheDirectory = previewCacheDirectory();
	const cachedPath = path.join(cacheDirectory, `${key}.png`);
	const cached = await readFile(cachedPath).catch(() => null);
	if (cached) {
		return {
			effectId: request.effectId,
			dataUrl: `data:image/png;base64,${cached.toString("base64")}`,
			width: PREVIEW_WIDTH,
			height: PREVIEW_HEIGHT,
			cached: true,
		};
	}

	const ffmpegPath = getFFmpegPath();
	const sourceImage = await firstReadableFile({
		candidates: resolvePreviewSourceImage(),
	});
	const workspace = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-preview-"));

	try {
		// A still image looped into a short clip gives the effect a timeline to
		// animate along, which is what its seek-driven scene expects.
		const sourceClip = path.join(workspace, "source.mp4");
		await runJianyingEffectProcess({
			command: ffmpegPath,
			args: [
				"-y",
				"-loop",
				"1",
				"-i",
				sourceImage,
				"-t",
				String(seconds + 1 / PREVIEW_FPS),
				"-r",
				String(PREVIEW_FPS),
				"-vf",
				`scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}`,
				"-pix_fmt",
				"yuv420p",
				sourceClip,
			],
		});

		const renderedClip = path.join(workspace, "rendered.mp4");
		// The window covers the selected frame even when the requested timestamp
		// is past the package's default duration — a frame outside the window
		// would be copied through untouched and preview as "no effect".
		const windowSeconds = Math.max(
			definition.defaultDurationMs / 1000,
			seconds + 1 / PREVIEW_FPS
		);
		await renderJianyingEffectClip({
			inspection,
			definition,
			inputPath: sourceClip,
			outputPath: renderedClip,
			width: PREVIEW_WIDTH,
			height: PREVIEW_HEIGHT,
			frameRate: PREVIEW_FPS,
			startSeconds: 0,
			durationSeconds: windowSeconds,
			adjustValues: request.adjustValues,
		});

		const stillPath = path.join(workspace, "still.png");
		await runJianyingEffectProcess({
			command: ffmpegPath,
			args: [
				"-y",
				"-i",
				renderedClip,
				"-vf",
				`select=eq(n\\,${Math.max(0, Math.round(seconds * PREVIEW_FPS) - 1)})`,
				"-frames:v",
				"1",
				stillPath,
			],
		});

		const still = await readFile(stillPath);
		await mkdir(cacheDirectory, { recursive: true });
		// Written aside and renamed so a concurrent reader never sees a half file.
		const pendingPath = `${cachedPath}.${process.pid}.tmp`;
		await writeFile(pendingPath, still);
		await rename(pendingPath, cachedPath);
		return {
			effectId: request.effectId,
			dataUrl: `data:image/png;base64,${still.toString("base64")}`,
			width: PREVIEW_WIDTH,
			height: PREVIEW_HEIGHT,
			cached: false,
		};
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}
