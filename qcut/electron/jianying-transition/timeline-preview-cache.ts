import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingTimelinePreviewRequest,
	JianyingTimelinePreviewSource,
	JianyingTransitionPreviewResult,
} from "../jianying-transition-contract.js";
import { resolveJianyingTransition } from "../jianying-transition-contract.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import {
	getJianyingTransitionPreviewPath,
	getJianyingTransitionPreviewUrl,
} from "./preview-cache-path.js";
import {
	cleanupJianyingPreviewCache,
	enqueueJianyingPreviewRender,
	isValidPreviewFile,
	runPreviewProcess,
	type PreviewCacheArtifact,
} from "./preview-cache-shared.js";
import { renderJianyingTransition } from "./render.js";

const TIMELINE_PREVIEW_CACHE_VERSION = 1;
const MAX_TIMELINE_PREVIEW_DIMENSION = 1920;
const MAX_TIMELINE_PREVIEW_FPS = 60;
const MIN_TIMELINE_PREVIEW_DURATION = 0.1;
const MAX_TIMELINE_PREVIEW_DURATION = 5;

interface SourceIdentity {
	pathHash: string;
	size: number;
	modifiedAt: number;
}

function requireFiniteRange({
	value,
	label,
	minimum,
	maximum,
}: {
	value: number;
	label: string;
	minimum: number;
	maximum: number;
}): number {
	if (!Number.isFinite(value) || value < minimum || value > maximum) {
		throw new Error(`${label} is outside the supported preview range.`);
	}
	return value;
}

function requireEvenDimension({
	value,
	label,
}: {
	value: number;
	label: string;
}) {
	const dimension = Math.round(
		requireFiniteRange({
			value,
			label,
			minimum: 2,
			maximum: MAX_TIMELINE_PREVIEW_DIMENSION,
		})
	);
	return dimension % 2 === 0 ? dimension : dimension + 1;
}

async function resolveSourceIdentity({
	source,
}: {
	source: JianyingTimelinePreviewSource;
}): Promise<SourceIdentity> {
	const inputPath = path.resolve(source.inputPath);
	await fs.promises.access(inputPath, constants.R_OK);
	const sourceStat = await fs.promises.stat(inputPath);
	if (!sourceStat.isFile())
		throw new Error("Timeline preview input is not a file.");
	return {
		pathHash: createHash("sha256").update(inputPath).digest("hex"),
		size: sourceStat.size,
		modifiedAt: sourceStat.mtimeMs,
	};
}

function validateSource({
	source,
	label,
}: {
	source: JianyingTimelinePreviewSource;
	label: string;
}): void {
	if (source.kind !== "image" && source.kind !== "video") {
		throw new Error(`${label} kind is unsupported.`);
	}
	requireFiniteRange({
		value: source.sourceStart,
		label: `${label} start`,
		minimum: 0,
		maximum: 24 * 60 * 60,
	});
	requireFiniteRange({
		value: source.sourceDuration,
		label: `${label} duration`,
		minimum: source.kind === "video" ? 1 / 240 : 0,
		maximum: 60,
	});
	requireFiniteRange({
		value: source.playbackRate,
		label: `${label} playback rate`,
		minimum: 0.01,
		maximum: 100,
	});
}

function buildSourceFilter({
	source,
	duration,
	fps,
	width,
	height,
}: {
	source: JianyingTimelinePreviewSource;
	duration: number;
	fps: number;
	width: number;
	height: number;
}): string {
	const timingFilters =
		source.kind === "video"
			? [
					source.reverse ? "reverse" : null,
					`setpts=(PTS-STARTPTS)/${source.playbackRate}`,
				].filter((filter): filter is string => Boolean(filter))
			: ["setpts=PTS-STARTPTS"];
	return [
		...timingFilters,
		`scale=${width}:${height}:force_original_aspect_ratio=increase`,
		`crop=${width}:${height}`,
		`fps=${fps}`,
		`tpad=stop_mode=clone:stop_duration=${duration}`,
		`trim=duration=${duration}`,
		"setpts=PTS-STARTPTS",
		"format=yuv420p",
	].join(",");
}

async function createTimelinePreviewSource({
	source,
	outputPath,
	duration,
	fps,
	width,
	height,
}: {
	source: JianyingTimelinePreviewSource;
	outputPath: string;
	duration: number;
	fps: number;
	width: number;
	height: number;
}): Promise<void> {
	const inputArgs =
		source.kind === "image"
			? ["-loop", "1", "-framerate", String(fps), "-i", source.inputPath]
			: [
					"-ss",
					String(source.sourceStart),
					"-t",
					String(source.sourceDuration),
					"-i",
					source.inputPath,
				];
	await runPreviewProcess({
		command: getFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			...inputArgs,
			"-vf",
			buildSourceFilter({ source, duration, fps, width, height }),
			"-an",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"24",
			"-movflags",
			"+faststart",
			outputPath,
		],
	});
	if (!isValidPreviewFile({ filePath: outputPath })) {
		throw new Error("Timeline transition preview source is invalid.");
	}
}

async function buildCacheKey({
	request,
	inputAIdentity,
	inputBIdentity,
}: {
	request: JianyingTimelinePreviewRequest;
	inputAIdentity: SourceIdentity;
	inputBIdentity: SourceIdentity;
}): Promise<string> {
	return createHash("sha256")
		.update(
			JSON.stringify({
				version: TIMELINE_PREVIEW_CACHE_VERSION,
				presetId: request.presetId,
				packageHash: request.packageHash,
				duration: request.duration,
				fps: request.fps,
				width: request.width,
				height: request.height,
				inputA: { ...request.inputA, inputPath: inputAIdentity },
				inputB: { ...request.inputB, inputPath: inputBIdentity },
			})
		)
		.digest("hex");
}

async function renderTimelinePreviewArtifact({
	request,
	cacheKey,
}: {
	request: JianyingTimelinePreviewRequest;
	cacheKey: string;
}): Promise<PreviewCacheArtifact> {
	const outputPath = getJianyingTransitionPreviewPath({ cacheKey });
	if (isValidPreviewFile({ filePath: outputPath })) {
		void fs.promises.utimes(outputPath, new Date(), new Date()).catch(() => {});
		return { cacheKey, cached: true };
	}
	const temporaryDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-timeline-preview-")
	);
	const inputAPath = path.join(temporaryDirectory, "input-a.mp4");
	const inputBPath = path.join(temporaryDirectory, "input-b.mp4");
	const partialPath = `${outputPath}.partial.mp4`;
	const sourceDuration = request.duration / 2;
	try {
		await Promise.all([
			createTimelinePreviewSource({
				source: request.inputA,
				outputPath: inputAPath,
				duration: sourceDuration,
				fps: request.fps,
				width: request.width,
				height: request.height,
			}),
			createTimelinePreviewSource({
				source: request.inputB,
				outputPath: inputBPath,
				duration: sourceDuration,
				fps: request.fps,
				width: request.width,
				height: request.height,
			}),
		]);
		await fs.promises.rm(partialPath, { force: true });
		await renderJianyingTransition({
			request: {
				presetId: request.presetId,
				inputA: inputAPath,
				inputB: inputBPath,
				outputPath: partialPath,
				duration: request.duration,
				fps: request.fps,
				width: request.width,
				height: request.height,
				overwrite: true,
			},
		});
		if (!isValidPreviewFile({ filePath: partialPath })) {
			throw new Error("Timeline transition preview output is invalid.");
		}
		await fs.promises.rename(partialPath, outputPath);
		void cleanupJianyingPreviewCache({ keepPath: outputPath });
		return { cacheKey, cached: false };
	} finally {
		await Promise.all([
			fs.promises.rm(temporaryDirectory, { recursive: true, force: true }),
			fs.promises.rm(partialPath, { force: true }),
		]);
	}
}

export async function getJianyingTimelineTransitionPreview({
	request,
}: {
	request: JianyingTimelinePreviewRequest;
}): Promise<JianyingTransitionPreviewResult> {
	const transition = resolveJianyingTransition({ value: request.presetId });
	if (!transition || transition.runtimeKind !== "transition-segment") {
		throw new Error("Unknown local Jianying timeline transition.");
	}
	if (transition.metadataMd5 !== request.packageHash) {
		throw new Error("Local Jianying transition package changed.");
	}
	validateSource({ source: request.inputA, label: "Input A" });
	validateSource({ source: request.inputB, label: "Input B" });
	const duration = requireFiniteRange({
		value: request.duration,
		label: "Duration",
		minimum: MIN_TIMELINE_PREVIEW_DURATION,
		maximum: MAX_TIMELINE_PREVIEW_DURATION,
	});
	const fps = requireFiniteRange({
		value: request.fps,
		label: "FPS",
		minimum: 1,
		maximum: MAX_TIMELINE_PREVIEW_FPS,
	});
	const width = requireEvenDimension({ value: request.width, label: "Width" });
	const height = requireEvenDimension({
		value: request.height,
		label: "Height",
	});
	const normalizedRequest = { ...request, duration, fps, width, height };
	const [inputAIdentity, inputBIdentity] = await Promise.all([
		resolveSourceIdentity({ source: normalizedRequest.inputA }),
		resolveSourceIdentity({ source: normalizedRequest.inputB }),
	]);
	const cacheKey = await buildCacheKey({
		request: normalizedRequest,
		inputAIdentity,
		inputBIdentity,
	});
	const outputPath = getJianyingTransitionPreviewPath({ cacheKey });
	const artifact = isValidPreviewFile({ filePath: outputPath })
		? { cacheKey, cached: true }
		: await enqueueJianyingPreviewRender({
				cacheKey,
				run: () =>
					renderTimelinePreviewArtifact({
						request: normalizedRequest,
						cacheKey,
					}),
			});
	return {
		presetId: transition.id,
		packageHash: transition.metadataMd5,
		previewUrl: getJianyingTransitionPreviewUrl({ cacheKey }),
		duration,
		posterTime: duration / 2,
		cached: artifact.cached,
	};
}

export const jianyingTimelinePreviewCacheTestUtils = {
	buildSourceFilter,
	requireEvenDimension,
	validateSource,
};
