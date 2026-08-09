import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type {
	JianyingTransitionPreviewRequest,
	JianyingTransitionPreviewResult,
} from "../jianying-transition-contract.js";
import { resolveJianyingTransition } from "../jianying-transition-contract.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import { renderJianyingTransition } from "./render.js";
import {
	getJianyingTransitionPreviewCacheDir,
	getJianyingTransitionPreviewPath,
	getJianyingTransitionPreviewUrl,
} from "./preview-cache-path.js";
import {
	cleanupJianyingPreviewCache,
	enqueueJianyingPreviewRender,
	isValidPreviewFile,
	MAX_CONCURRENT_JIANYING_PREVIEW_RENDERS,
	runPreviewProcess,
	type PreviewCacheArtifact,
} from "./preview-cache-shared.js";

const PREVIEW_CACHE_VERSION = 1;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 270;
const PREVIEW_FPS = 24;
const PREVIEW_SOURCE_DURATION = 1;
const PREVIEW_DURATION = PREVIEW_SOURCE_DURATION * 2;
const MAX_PREVIEW_TRANSITION_DURATION = 1.8;
const PREVIEW_SOURCE_FILENAMES = ["neon-city.webp", "cozy-cafe.webp"] as const;

let sourcePreparationPromise: Promise<[string, string]> | null = null;

function resolvePreviewSourceImage({ filename }: { filename: string }): string {
	const candidates = [
		path.join(
			app.getAppPath(),
			"apps/web/dist/images/filter-previews",
			filename
		),
		path.join(
			app.getAppPath(),
			"apps/web/public/images/filter-previews",
			filename
		),
		path.join(
			process.cwd(),
			"apps/web/public/images/filter-previews",
			filename
		),
		path.join(process.cwd(), "apps/web/dist/images/filter-previews", filename),
	];
	const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
	if (!sourcePath) {
		throw new Error("Bundled transition preview source is missing.");
	}
	return sourcePath;
}

async function createPreviewSource({
	imagePath,
	outputPath,
}: {
	imagePath: string;
	outputPath: string;
}): Promise<void> {
	const partialPath = `${outputPath}.partial.mp4`;
	await fs.promises.rm(partialPath, { force: true });
	await runPreviewProcess({
		command: getFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-loop",
			"1",
			"-i",
			imagePath,
			"-t",
			String(PREVIEW_SOURCE_DURATION),
			"-vf",
			`scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT},fps=${PREVIEW_FPS},format=yuv420p`,
			"-an",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"24",
			"-movflags",
			"+faststart",
			partialPath,
		],
	});
	if (!isValidPreviewFile({ filePath: partialPath })) {
		await fs.promises.rm(partialPath, { force: true });
		throw new Error("Encoded transition preview source is invalid.");
	}
	await fs.promises.rename(partialPath, outputPath);
}

async function preparePreviewSources(): Promise<[string, string]> {
	const cacheDir = getJianyingTransitionPreviewCacheDir();
	await fs.promises.mkdir(cacheDir, { recursive: true });
	const outputPaths = PREVIEW_SOURCE_FILENAMES.map((_, index) =>
		path.join(cacheDir, `source-v${PREVIEW_CACHE_VERSION}-${index + 1}.mp4`)
	) as [string, string];
	const missingSources = outputPaths.flatMap((outputPath, index) =>
		isValidPreviewFile({ filePath: outputPath })
			? []
			: [
					createPreviewSource({
						imagePath: resolvePreviewSourceImage({
							filename: PREVIEW_SOURCE_FILENAMES[index] ?? "",
						}),
						outputPath,
					}),
				]
	);
	await Promise.all(missingSources);
	return outputPaths;
}

function ensurePreviewSources(): Promise<[string, string]> {
	if (!sourcePreparationPromise) {
		sourcePreparationPromise = preparePreviewSources().catch((error) => {
			sourcePreparationPromise = null;
			throw error;
		});
	}
	return sourcePreparationPromise;
}

function buildPreviewCacheKey({
	presetId,
	packageHash,
}: {
	presetId: string;
	packageHash: string;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				version: PREVIEW_CACHE_VERSION,
				presetId,
				packageHash,
				width: PREVIEW_WIDTH,
				height: PREVIEW_HEIGHT,
				fps: PREVIEW_FPS,
				duration: PREVIEW_DURATION,
			})
		)
		.digest("hex");
}

async function renderPreviewArtifact({
	presetId,
	cacheKey,
	transitionDuration,
}: {
	presetId: string;
	cacheKey: string;
	transitionDuration: number;
}): Promise<PreviewCacheArtifact> {
	const outputPath = getJianyingTransitionPreviewPath({ cacheKey });
	if (isValidPreviewFile({ filePath: outputPath })) {
		void fs.promises.utimes(outputPath, new Date(), new Date()).catch(() => {});
		return { cacheKey, cached: true };
	}
	const [inputA, inputB] = await ensurePreviewSources();
	const partialPath = `${outputPath}.partial.mp4`;
	await fs.promises.rm(partialPath, { force: true });
	try {
		await renderJianyingTransition({
			request: {
				presetId,
				inputA,
				inputB,
				outputPath: partialPath,
				duration: Math.min(transitionDuration, MAX_PREVIEW_TRANSITION_DURATION),
				fps: PREVIEW_FPS,
				width: PREVIEW_WIDTH,
				height: PREVIEW_HEIGHT,
				overwrite: true,
			},
		});
		if (!isValidPreviewFile({ filePath: partialPath })) {
			throw new Error("Rendered transition preview is invalid.");
		}
		await fs.promises.rename(partialPath, outputPath);
		void cleanupJianyingPreviewCache({ keepPath: outputPath });
		return { cacheKey, cached: false };
	} catch (error) {
		await fs.promises.rm(partialPath, { force: true });
		throw error;
	}
}

function getOrCreatePreviewArtifact({
	presetId,
	cacheKey,
	transitionDuration,
}: {
	presetId: string;
	cacheKey: string;
	transitionDuration: number;
}): Promise<PreviewCacheArtifact> {
	const outputPath = getJianyingTransitionPreviewPath({ cacheKey });
	if (isValidPreviewFile({ filePath: outputPath })) {
		void fs.promises.utimes(outputPath, new Date(), new Date()).catch(() => {});
		return Promise.resolve({ cacheKey, cached: true });
	}
	return enqueueJianyingPreviewRender({
		cacheKey,
		run: () =>
			renderPreviewArtifact({ presetId, cacheKey, transitionDuration }),
	});
}

export async function getJianyingTransitionPreview({
	request,
}: {
	request: JianyingTransitionPreviewRequest;
}): Promise<JianyingTransitionPreviewResult> {
	const transition = resolveJianyingTransition({ value: request.presetId });
	if (!transition || transition.runtimeKind !== "transition-segment") {
		throw new Error("Unknown local Jianying transition preview preset.");
	}
	const cacheKey = buildPreviewCacheKey({
		presetId: transition.id,
		packageHash: transition.metadataMd5,
	});
	const artifact = await getOrCreatePreviewArtifact({
		presetId: transition.id,
		cacheKey,
		transitionDuration: transition.defaultDuration,
	});
	return {
		presetId: transition.id,
		packageHash: transition.metadataMd5,
		previewUrl: getJianyingTransitionPreviewUrl({ cacheKey }),
		duration: PREVIEW_DURATION,
		posterTime: PREVIEW_SOURCE_DURATION,
		cached: artifact.cached,
	};
}

export const jianyingTransitionPreviewCacheTestUtils = {
	buildPreviewCacheKey,
	maxConcurrentRenders: MAX_CONCURRENT_JIANYING_PREVIEW_RENDERS,
};
