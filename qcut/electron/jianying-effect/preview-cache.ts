import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import type {
	JianyingEffectPreviewRequest,
	JianyingEffectPreviewResult,
} from "../jianying-effect-contract.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import { renderJianyingEffectClip } from "./render.js";
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
}: {
	request: JianyingEffectPreviewRequest;
	packageHash: string;
}): string {
	const adjust = (request.adjustValues ?? [])
		.map((entry) => `${entry.key}=${entry.value}`)
		.sort()
		.join(",");
	return createHash("sha256")
		.update(
			[
				request.effectId,
				packageHash,
				String(request.seconds ?? PREVIEW_SECONDS),
				adjust,
			].join("|")
		)
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

export async function getJianyingEffectPreview({
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

	const key = cacheKey({ request, packageHash: definition.packageHash });
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

	const seconds = request.seconds ?? PREVIEW_SECONDS;
	const ffmpegPath = getFFmpegPath();
	const sourceImage = await firstReadableFile({
		candidates: resolvePreviewSourceImage(),
	});
	const workspace = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-preview-"));

	try {
		// A still image looped into a short clip gives the effect a timeline to
		// animate along, which is what its seek-driven scene expects.
		const sourceClip = path.join(workspace, "source.mp4");
		await runFfmpeg({
			ffmpegPath,
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
		await renderJianyingEffectClip({
			inspection,
			definition,
			inputPath: sourceClip,
			outputPath: renderedClip,
			width: PREVIEW_WIDTH,
			height: PREVIEW_HEIGHT,
			frameRate: PREVIEW_FPS,
			startSeconds: 0,
			durationSeconds: definition.defaultDurationMs / 1000,
			adjustValues: request.adjustValues,
		});

		const stillPath = path.join(workspace, "still.png");
		await runFfmpeg({
			ffmpegPath,
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
		await writeFile(cachedPath, still);
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

function runFfmpeg({
	ffmpegPath,
	args,
}: {
	ffmpegPath: string;
	args: string[];
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpegPath, args, {
			stdio: ["ignore", "ignore", "pipe"],
			windowsHide: true,
		});
		let error = "";
		child.stderr?.on("data", (chunk: Buffer) => {
			error = (error + chunk.toString()).slice(-4096);
		});
		child.on("error", reject);
		child.on("close", (code: number | null) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`ffmpeg failed (${code}): ${error.trim()}`));
		});
	});
}
