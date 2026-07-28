import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { buildFFmpegArgs } from "../ffmpeg-args-builder.js";
import type {
	VideoCompositionFramePreviewOptions,
	VideoCompositionFramePreviewResult,
	VideoFramePreviewOptions,
	VideoFramePreviewResult,
	TextAssLayer,
} from "./types.js";
import {
	buildVideoEnhancementFilter,
	normalizeVideoEnhancements,
} from "./video-enhancement-filter.js";
import { prepareFFmpegFilterComplexScripts } from "./filter-complex-script.js";
import { removeTemporaryDirectory } from "./temporary-files.js";
import { buildVideoFitFilter } from "./video-fit-filter.js";
import { getFFmpegPath } from "./utils.js";

const MAX_CACHE_ENTRIES = 32;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_PREVIEW_DIMENSION = 4096;
const PROCESS_TIMEOUT_MS = 20_000;
const COMPOSITION_PROCESS_TIMEOUT_MS = 60_000;
const PROCESS_CLOSE_GRACE_MS = 1_000;
const TEMPORAL_PREROLL_SECONDS = 0.5;
const MAX_TEXT_ASS_LAYERS = 1_000;
const MAX_TEXT_ASS_BYTES = 16 * 1024 * 1024;

interface PreviewCacheEntry {
	pngData: Buffer;
	byteLength: number;
}

interface PreviewCommand {
	args: string[];
	sourceTime: number;
}

interface CompositionPreviewCommand {
	args: string[];
	timelineTime: number;
}

type PreparedTextAssLayer = Omit<TextAssLayer, "content"> & { path: string };

const previewCache = new Map<string, PreviewCacheEntry>();
const activeRequests = new Map<string, ChildProcess>();
let previewCacheBytes = 0;

function assertPreviewDimensions({
	width,
	height,
	fps,
}: {
	width: number;
	height: number;
	fps: number;
}): void {
	for (const [name, value] of [
		["width", width],
		["height", height],
	] as const) {
		if (
			!Number.isInteger(value) ||
			value < 2 ||
			value > MAX_PREVIEW_DIMENSION
		) {
			throw new Error(
				`Preview ${name} must be between 2 and ${MAX_PREVIEW_DIMENSION}`
			);
		}
	}
	if (!Number.isFinite(fps) || fps < 1 || fps > 240) {
		throw new Error("Preview FPS must be between 1 and 240");
	}
}

function assertPreviewOptions({
	options,
}: {
	options: VideoFramePreviewOptions;
}): void {
	if (!options.requestId.trim())
		throw new Error("Preview request ID is required");
	if (!fs.existsSync(options.sourcePath)) {
		throw new Error(`Preview source not found: ${options.sourcePath}`);
	}
	if (!Number.isFinite(options.sourceTime) || options.sourceTime < 0) {
		throw new Error("Preview source time must be a non-negative number");
	}
	assertPreviewDimensions(options);
}

function assertCompositionPreviewOptions({
	options,
}: {
	options: VideoCompositionFramePreviewOptions;
}): void {
	if (!options.requestId.trim()) {
		throw new Error("Preview request ID is required");
	}
	assertPreviewDimensions(options);
	if (!Number.isFinite(options.duration) || options.duration <= 0) {
		throw new Error("Composition duration must be greater than zero");
	}
	if (!Number.isFinite(options.timelineTime) || options.timelineTime < 0) {
		throw new Error("Composition timeline time must be non-negative");
	}
	if (options.timelineTime >= options.duration) {
		throw new Error("Composition timeline time must be before its duration");
	}
	const sources = [
		...options.videoSources,
		...(options.imageSources ?? []),
		...(options.stickerSources ?? []),
	];
	if (sources.length === 0) {
		throw new Error("Composition preview requires at least one visual source");
	}
	for (const source of sources) {
		if (!fs.existsSync(source.path)) {
			throw new Error(`Preview source not found: ${source.path}`);
		}
	}
	const textAssLayers = options.textAssLayers ?? [];
	if (textAssLayers.length > MAX_TEXT_ASS_LAYERS) {
		throw new Error(
			`Composition preview supports at most ${MAX_TEXT_ASS_LAYERS} text layers`
		);
	}
	const textAssBytes = textAssLayers.reduce(
		(total, layer) => total + Buffer.byteLength(layer.content, "utf8"),
		0
	);
	if (textAssBytes > MAX_TEXT_ASS_BYTES) {
		throw new Error("Composition preview text layers exceed 16 MiB");
	}
}

function hasTemporalEnhancement({
	options,
}: {
	options: VideoFramePreviewOptions;
}): boolean {
	return (
		options.enhancements.stabilization > 0 ||
		options.enhancements.denoise > 0 ||
		options.enhancements.beauty > 0
	);
}

export function buildVideoFramePreviewCommand({
	options,
}: {
	options: VideoFramePreviewOptions;
}): PreviewCommand {
	assertPreviewOptions({ options });
	const enhancements = normalizeVideoEnhancements({
		enhancements: options.enhancements,
	});
	const sourceTime = Math.round(options.sourceTime * options.fps) / options.fps;
	const preroll = hasTemporalEnhancement({ options })
		? Math.min(sourceTime, TEMPORAL_PREROLL_SECONDS)
		: 0;
	const frameDuration = 1 / options.fps;
	const filters = [
		buildVideoFitFilter({
			fitMode: options.fitMode,
			width: options.width,
			height: options.height,
		}),
		"setsar=1",
		"format=rgba",
		buildVideoEnhancementFilter({
			enhancements,
			width: options.width,
			height: options.height,
		}),
		`trim=start=${preroll}:duration=${frameDuration}`,
		"setpts=PTS-STARTPTS",
	].filter(Boolean);
	return {
		sourceTime,
		args: [
			"-v",
			"error",
			"-ss",
			String(Math.max(0, sourceTime - preroll)),
			"-i",
			options.sourcePath,
			"-t",
			String(preroll + frameDuration),
			"-vf",
			filters.join(","),
			"-frames:v",
			"1",
			"-an",
			"-c:v",
			"png",
			"-pix_fmt",
			"rgba",
			"-f",
			"image2pipe",
			"pipe:1",
		],
	};
}

function getMappedVideoLabel({ args }: { args: string[] }): {
	filterIndex: number;
	mapIndex: number;
	videoMap: string;
} {
	const filterIndex = args.indexOf("-filter_complex");
	const mapIndex = args.indexOf("-map");
	const videoMap = mapIndex >= 0 ? args[mapIndex + 1] : undefined;
	if (
		filterIndex < 0 ||
		mapIndex < 0 ||
		typeof videoMap !== "string" ||
		!/^\[[^\]]+\]$/.test(videoMap)
	) {
		throw new Error(
			"Composition preview could not resolve the export video map"
		);
	}
	return { filterIndex, mapIndex, videoMap };
}

export function buildVideoCompositionFramePreviewCommand({
	options,
	textAssLayerPaths = [],
}: {
	options: VideoCompositionFramePreviewOptions;
	textAssLayerPaths?: PreparedTextAssLayer[];
}): CompositionPreviewCommand {
	assertCompositionPreviewOptions({ options });
	const timelineTime =
		Math.round(options.timelineTime * options.fps) / options.fps;
	const frameDuration = 1 / options.fps;
	const firstSource = options.videoSources[0] ?? options.imageSources?.[0];
	if (!firstSource) {
		throw new Error("Composition preview requires a visual source");
	}
	const exportArgs = buildFFmpegArgs({
		inputDir: path.dirname(firstSource.path),
		outputFile: "composition-preview-unused.mp4",
		width: options.width,
		height: options.height,
		fps: options.fps,
		quality: "low",
		duration: options.duration,
		backgroundColor: options.backgroundColor,
		videoSources: options.videoSources,
		videoTransitions: options.videoTransitions,
		imageSources: options.imageSources,
		stickerSources: options.stickerSources,
		textAssLayers: textAssLayerPaths,
	});
	const { filterIndex, mapIndex, videoMap } = getMappedVideoLabel({
		args: exportArgs,
	});
	const filterGraph = exportArgs[filterIndex + 1];
	if (typeof filterGraph !== "string") {
		throw new Error("Composition preview export graph is missing");
	}
	const previewLabel = "composition_preview_frame";
	const previewFilter = `${videoMap}trim=start=${timelineTime}:duration=${frameDuration},setpts=PTS-STARTPTS,format=rgba[${previewLabel}]`;
	const inputAndFilters = exportArgs.slice(0, mapIndex);
	inputAndFilters[filterIndex + 1] = `${filterGraph};${previewFilter}`;
	inputAndFilters.splice(1, 0, "-v", "error");
	return {
		timelineTime,
		args: [
			...inputAndFilters,
			"-map",
			`[${previewLabel}]`,
			"-frames:v",
			"1",
			"-an",
			"-c:v",
			"png",
			"-pix_fmt",
			"rgba",
			"-f",
			"image2pipe",
			"pipe:1",
		],
	};
}

function buildCacheKey({
	options,
	sourceTime,
}: {
	options: VideoFramePreviewOptions;
	sourceTime: number;
}): string {
	const source = fs.statSync(options.sourcePath);
	return createHash("sha256")
		.update(
			JSON.stringify({
				sourcePath: options.sourcePath,
				sourceSize: source.size,
				sourceModified: source.mtimeMs,
				sourceTime,
				width: options.width,
				height: options.height,
				fps: options.fps,
				fitMode: options.fitMode,
				enhancements: normalizeVideoEnhancements({
					enhancements: options.enhancements,
				}),
			})
		)
		.digest("hex");
}

function buildCompositionCacheKey({
	options,
	timelineTime,
}: {
	options: VideoCompositionFramePreviewOptions;
	timelineTime: number;
}): string {
	const sourceFiles = [
		...options.videoSources,
		...(options.imageSources ?? []),
		...(options.stickerSources ?? []),
	].map((source) => {
		const stats = fs.statSync(source.path);
		return {
			path: source.path,
			size: stats.size,
			modified: stats.mtimeMs,
		};
	});
	return createHash("sha256")
		.update(
			JSON.stringify({
				timelineTime,
				duration: options.duration,
				width: options.width,
				height: options.height,
				fps: options.fps,
				backgroundColor: options.backgroundColor ?? "#000000",
				sourceFiles,
				videoSources: options.videoSources,
				videoTransitions: options.videoTransitions ?? [],
				imageSources: options.imageSources ?? [],
				stickerSources: options.stickerSources ?? [],
				textAssLayers: options.textAssLayers ?? [],
			})
		)
		.digest("hex");
}

function readCachedPreview({ key }: { key: string }): Buffer | undefined {
	const cached = previewCache.get(key);
	if (!cached) return;
	previewCache.delete(key);
	previewCache.set(key, cached);
	return cached.pngData;
}

function cachePreview({
	key,
	pngData,
}: {
	key: string;
	pngData: Buffer;
}): void {
	if (pngData.byteLength > MAX_CACHE_BYTES) return;
	const existing = previewCache.get(key);
	if (existing) {
		previewCacheBytes -= existing.byteLength;
		previewCache.delete(key);
	}
	previewCache.set(key, { pngData, byteLength: pngData.byteLength });
	previewCacheBytes += pngData.byteLength;
	while (
		previewCache.size > MAX_CACHE_ENTRIES ||
		previewCacheBytes > MAX_CACHE_BYTES
	) {
		const oldestKey = previewCache.keys().next().value;
		if (typeof oldestKey !== "string") break;
		const oldest = previewCache.get(oldestKey);
		previewCache.delete(oldestKey);
		previewCacheBytes -= oldest?.byteLength ?? 0;
	}
}

function prepareTextAssLayerFiles({
	textAssLayers,
}: {
	textAssLayers: TextAssLayer[];
}): { directory?: string; layers: PreparedTextAssLayer[] } {
	if (textAssLayers.length === 0) return { layers: [] };
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "qcut-composition-preview-")
	);
	try {
		const layers = textAssLayers.map((layer, index) => {
			const assPath = path.join(directory, `text-layer-${index}.ass`);
			fs.writeFileSync(assPath, layer.content, "utf8");
			return {
				path: assPath,
				blendMode: layer.blendMode,
				trackOrder: layer.trackOrder,
				elementOrder: layer.elementOrder,
			};
		});
		return { directory, layers };
	} catch (error) {
		fs.rmSync(directory, { recursive: true, force: true });
		throw error;
	}
}

function runPreviewProcess({
	requestId,
	args,
	timeoutMs = PROCESS_TIMEOUT_MS,
}: {
	requestId: string;
	args: string[];
	timeoutMs?: number;
}): Promise<Buffer> {
	const ffmpegPath = getFFmpegPath();
	const preparedFilterScripts = prepareFFmpegFilterComplexScripts({ args });
	return new Promise<Buffer>((resolve, reject) => {
		let child: ChildProcess;
		try {
			child = spawn(ffmpegPath, preparedFilterScripts.args, {
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (error) {
			void preparedFilterScripts.cleanup().then(
				() => reject(error),
				() => reject(error)
			);
			return;
		}
		let requestSettled = false;
		let childTerminated = false;
		let processTimer: ReturnType<typeof setTimeout> | undefined;
		let closeGraceTimer: ReturnType<typeof setTimeout> | undefined;
		let cleanupStarted = false;
		const cleanupAfterProcessExit = async () => {
			if (cleanupStarted) return;
			cleanupStarted = true;
			try {
				const removed = await preparedFilterScripts.cleanup();
				if (removed) return;
				await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
				const removedAfterRetry = await preparedFilterScripts.cleanup();
				if (!removedAfterRetry) cleanupStarted = false;
			} catch (error) {
				cleanupStarted = false;
				console.warn("[FFmpeg] Video frame preview cleanup failed", {
					requestId,
					error,
				});
			}
		};
		child.once("exit", () => {
			childTerminated = true;
			void cleanupAfterProcessExit();
		});
		const settleRequest = ({
			error,
			data,
		}: {
			error?: Error;
			data?: Buffer;
		}) => {
			if (requestSettled) return;
			requestSettled = true;
			if (processTimer) clearTimeout(processTimer);
			if (closeGraceTimer) clearTimeout(closeGraceTimer);
			if (activeRequests.get(requestId) === child) {
				activeRequests.delete(requestId);
			}
			if (error) reject(error);
			else resolve(data ?? Buffer.alloc(0));
		};
		const finishAfterClose = ({
			error,
			data,
		}: {
			error?: Error;
			data?: Buffer;
		}) => {
			childTerminated = true;
			settleRequest({ error, data });
			void cleanupAfterProcessExit();
		};
		const scheduleCloseGrace = ({ error }: { error: Error }) => {
			if (requestSettled || closeGraceTimer) return;
			closeGraceTimer = setTimeout(() => {
				if (!childTerminated) {
					try {
						child.kill("SIGKILL");
					} catch (killError) {
						console.warn("[FFmpeg] Failed to force-stop video frame preview", {
							requestId,
							error: killError,
						});
					}
				}
				settleRequest({ error });
			}, PROCESS_CLOSE_GRACE_MS);
		};
		if (!(child.stdout && child.stderr)) {
			const pipeError = new Error("Video frame preview pipes are unavailable");
			child.once("error", () => undefined);
			child.once("close", () => {
				finishAfterClose({ error: pipeError });
			});
			scheduleCloseGrace({ error: pipeError });
			child.kill();
			return;
		}
		activeRequests.set(requestId, child);
		const stdout: Buffer[] = [];
		let stderr = "";
		let terminalError: Error | undefined;
		processTimer = setTimeout(() => {
			terminalError = new Error("Video frame preview timed out");
			scheduleCloseGrace({ error: terminalError });
			if (!childTerminated) child.kill();
		}, timeoutMs);
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			terminalError = error;
			scheduleCloseGrace({ error });
		});
		child.on("close", (code, signal) => {
			if (terminalError) {
				finishAfterClose({ error: terminalError });
				return;
			}
			if (code !== 0) {
				finishAfterClose({
					error: new Error(
						signal
							? `Video frame preview cancelled (${signal})`
							: `Video frame preview failed (${code}): ${stderr}`
					),
				});
				return;
			}
			const pngData = Buffer.concat(stdout);
			if (pngData.byteLength < 100) {
				finishAfterClose({
					error: new Error("Video frame preview returned no image"),
				});
				return;
			}
			finishAfterClose({ data: pngData });
		});
	});
}

export async function renderVideoFramePreview({
	options,
}: {
	options: VideoFramePreviewOptions;
}): Promise<VideoFramePreviewResult> {
	const command = buildVideoFramePreviewCommand({ options });
	const cacheKey = buildCacheKey({ options, sourceTime: command.sourceTime });
	const cached = readCachedPreview({ key: cacheKey });
	if (cached) {
		return {
			requestId: options.requestId,
			pngData: cached,
			cacheHit: true,
			sourceTime: command.sourceTime,
		};
	}
	const pngData = await runPreviewProcess({
		requestId: options.requestId,
		args: command.args,
	});
	cachePreview({ key: cacheKey, pngData });
	return {
		requestId: options.requestId,
		pngData,
		cacheHit: false,
		sourceTime: command.sourceTime,
	};
}

export async function renderVideoCompositionFramePreview({
	options,
}: {
	options: VideoCompositionFramePreviewOptions;
}): Promise<VideoCompositionFramePreviewResult> {
	assertCompositionPreviewOptions({ options });
	const timelineTime =
		Math.round(options.timelineTime * options.fps) / options.fps;
	const cacheKey = buildCompositionCacheKey({
		options,
		timelineTime,
	});
	const cached = readCachedPreview({ key: cacheKey });
	if (cached) {
		return {
			requestId: options.requestId,
			pngData: cached,
			cacheHit: true,
			timelineTime,
		};
	}
	const preparedText = prepareTextAssLayerFiles({
		textAssLayers: options.textAssLayers ?? [],
	});
	try {
		const command = buildVideoCompositionFramePreviewCommand({
			options,
			textAssLayerPaths: preparedText.layers,
		});
		const pngData = await runPreviewProcess({
			requestId: options.requestId,
			args: command.args,
			timeoutMs: COMPOSITION_PROCESS_TIMEOUT_MS,
		});
		cachePreview({ key: cacheKey, pngData });
		return {
			requestId: options.requestId,
			pngData,
			cacheHit: false,
			timelineTime: command.timelineTime,
		};
	} finally {
		if (preparedText.directory) {
			await removeTemporaryDirectory({ directory: preparedText.directory });
		}
	}
}

export function cancelVideoFramePreview({
	requestId,
}: {
	requestId: string;
}): boolean {
	const child = activeRequests.get(requestId);
	if (!child) return false;
	activeRequests.delete(requestId);
	return child.kill();
}

export function clearVideoFramePreviewCache(): void {
	previewCache.clear();
	previewCacheBytes = 0;
}
