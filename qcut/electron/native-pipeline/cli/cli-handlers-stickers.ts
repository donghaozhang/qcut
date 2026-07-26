import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/paths.js";
import {
	searchIconifyStickers,
	type StickerSearchResponse,
} from "../stickers/iconify-sticker-client.js";
import {
	materializeSticker,
	type MaterializedSticker,
} from "../stickers/sticker-asset-materializer.js";
import {
	buildStickerOverlayFfmpegArgs,
	type ResolvedStickerOverlay,
	type StickerOverlayVideoProbe,
} from "../stickers/sticker-overlay-ffmpeg.js";
import {
	parseStickerOverlayPlan,
	type StickerOverlayItem,
} from "../stickers/sticker-overlay-plan.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

const execFileAsync = promisify(execFile);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mkv", ".mov", ".mp4", ".webm"]);

export interface StickerOverlayDependencies {
	materialize: ({
		item,
		outputDirectory,
		index,
		planDirectory,
		signal,
	}: {
		item: StickerOverlayItem;
		outputDirectory: string;
		index: number;
		planDirectory: string;
		signal: AbortSignal;
	}) => Promise<MaterializedSticker>;
	probeVideo: ({
		filePath,
		signal,
	}: {
		filePath: string;
		signal: AbortSignal;
	}) => Promise<StickerOverlayVideoProbe>;
	renderVideo: ({
		args,
		signal,
	}: {
		args: string[];
		signal: AbortSignal;
	}) => Promise<void>;
	search: ({
		query,
		collection,
		limit,
		signal,
	}: {
		query: string;
		collection?: string;
		limit?: number;
		signal: AbortSignal;
	}) => Promise<StickerSearchResponse>;
}

async function probeVideo({
	filePath,
	signal,
}: {
	filePath: string;
	signal: AbortSignal;
}): Promise<StickerOverlayVideoProbe> {
	const ffprobe = await getFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobe,
		[
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,width,height:format=duration",
			"-of",
			"json",
			filePath,
		],
		{ signal, maxBuffer: 4 * 1024 * 1024 }
	);
	const payload = JSON.parse(String(stdout)) as {
		streams?: Array<{
			codec_type?: string;
			width?: number;
			height?: number;
		}>;
		format?: { duration?: string };
	};
	const video = payload.streams?.find(
		(stream) => stream.codec_type === "video"
	);
	const duration = Number(payload.format?.duration);
	const width = Number(video?.width);
	const height = Number(video?.height);
	if (
		!Number.isFinite(duration) ||
		duration <= 0 ||
		!Number.isFinite(width) ||
		width <= 0 ||
		!Number.isFinite(height) ||
		height <= 0
	) {
		throw new Error(`Unable to probe video: ${filePath}`);
	}
	return {
		duration,
		width,
		height,
		hasAudio:
			payload.streams?.some((stream) => stream.codec_type === "audio") ?? false,
	};
}

async function renderVideo({
	args,
	signal,
}: {
	args: string[];
	signal: AbortSignal;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), args, {
		signal,
		maxBuffer: 32 * 1024 * 1024,
	});
}

const DEFAULT_DEPENDENCIES: StickerOverlayDependencies = {
	materialize: materializeSticker,
	probeVideo,
	renderVideo,
	search: searchIconifyStickers,
};

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

export async function handleStickerSearch(
	options: CLIRunOptions,
	_onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: StickerOverlayDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	try {
		const query = options.query?.trim();
		if (!query) throw new Error("Missing --query");
		const data = await dependencies.search({
			query,
			collection: options.collection,
			limit: options.limit,
			signal,
		});
		return { success: true, data };
	} catch (error) {
		return {
			success: false,
			error: `Sticker search failed: ${errorMessage({ error })}`,
		};
	}
}

function resolveSoundEffectPath({
	item,
	planDirectory,
}: {
	item: StickerOverlayItem;
	planDirectory: string;
}): string | undefined {
	if (!item.soundEffect) return;
	const soundEffectPath = resolve(planDirectory, item.soundEffect.source);
	if (!existsSync(soundEffectPath)) {
		throw new Error(`Sound effect not found: ${soundEffectPath}`);
	}
	return soundEffectPath;
}

function validateOverlayBounds({
	item,
	probe,
}: {
	item: StickerOverlayItem;
	probe: StickerOverlayVideoProbe;
}): void {
	if (
		item.x >= probe.width ||
		item.y >= probe.height ||
		item.x + item.width <= 0 ||
		item.y + (item.height ?? item.width) <= 0
	) {
		throw new Error(
			`Sticker ${item.id ?? item.stickerId ?? item.source} is outside the ${probe.width}x${probe.height} canvas`
		);
	}
	if (item.startTime + item.duration > probe.duration + 0.1) {
		throw new Error(
			`Sticker ${item.id ?? item.stickerId ?? item.source} ends after the video`
		);
	}
}

function publishStagedOutput({
	stagedOutput,
	output,
}: {
	stagedOutput: string;
	output: string;
}): void {
	const backup = `${output}.backup-${randomUUID()}`;
	const hasExistingOutput = existsSync(output);
	if (hasExistingOutput) renameSync(output, backup);
	try {
		renameSync(stagedOutput, output);
		if (hasExistingOutput) rmSync(backup, { force: true });
	} catch (error) {
		if (hasExistingOutput && existsSync(backup) && !existsSync(output)) {
			renameSync(backup, output);
		}
		throw error;
	}
}

export async function handleStickerOverlay(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: StickerOverlayDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	let temporaryDirectory: string | undefined;
	let stagedOutput: string | undefined;
	try {
		if (!options.input) throw new Error("Missing --input/-i video path");
		if (!options.plan) throw new Error("Missing --plan JSON path");
		const input = resolve(options.input);
		const planPath = resolve(options.plan);
		if (!VIDEO_EXTENSIONS.has(extname(input).toLowerCase())) {
			throw new Error(`Unsupported input video: ${input}`);
		}
		if (!existsSync(input)) throw new Error(`Input not found: ${input}`);
		if (!existsSync(planPath)) throw new Error(`Plan not found: ${planPath}`);
		const output = options.output
			? resolve(options.output)
			: join(
					resolve(options.outputDir),
					`${basename(input, extname(input))}_stickers.mp4`
				);
		if (extname(output).toLowerCase() !== ".mp4") {
			throw new Error("--output must use .mp4");
		}
		if (input === output) {
			throw new Error("Sticker overlay output cannot replace the input video");
		}
		if (existsSync(output) && !options.force) {
			throw new Error(
				`Output already exists: ${output}. Pass --force to replace it.`
			);
		}
		const plan = parseStickerOverlayPlan({
			value: JSON.parse(readFileSync(planPath, "utf8")),
		});
		const planDirectory = dirname(planPath);
		const probe = await dependencies.probeVideo({ filePath: input, signal });
		for (const item of plan.stickers) {
			validateOverlayBounds({ item, probe });
		}

		mkdirSync(dirname(output), { recursive: true });
		stagedOutput = join(
			dirname(output),
			`.${basename(output, extname(output))}.sticker-${randomUUID()}.mp4`
		);
		temporaryDirectory = mkdtempSync(join(tmpdir(), "qcut-sticker-overlay-"));
		const assetDirectory = options.saveIntermediates
			? join(
					dirname(output),
					`${basename(output, extname(output))}-sticker-assets`
				)
			: join(temporaryDirectory, "assets");
		mkdirSync(assetDirectory, { recursive: true });

		onProgress({
			stage: "stickers",
			percent: 10,
			message: `Preparing ${plan.stickers.length} stickers...`,
		});
		const materialized = await Promise.all(
			plan.stickers.map((item, index) =>
				dependencies.materialize({
					item,
					outputDirectory: assetDirectory,
					index,
					planDirectory,
					signal,
				})
			)
		);
		const overlays: ResolvedStickerOverlay[] = materialized.map((sticker) => ({
			...sticker,
			soundEffectPath: resolveSoundEffectPath({
				item: sticker.item,
				planDirectory,
			}),
		}));

		onProgress({
			stage: "rendering",
			percent: 35,
			message: "Rendering sticker and sound-effect overlays...",
		});
		await dependencies.renderVideo({
			args: buildStickerOverlayFfmpegArgs({
				input,
				output: stagedOutput,
				probe,
				stickers: overlays,
			}),
			signal,
		});
		if (!existsSync(stagedOutput)) {
			throw new Error(`Renderer did not create output: ${stagedOutput}`);
		}
		const outputProbe = await dependencies.probeVideo({
			filePath: stagedOutput,
			signal,
		});
		const durationDifference = Math.abs(probe.duration - outputProbe.duration);
		if (durationDifference > 0.35) {
			throw new Error(
				`Output duration differs from input by ${durationDifference.toFixed(3)}s`
			);
		}
		const soundEffectCount = overlays.filter(
			(sticker) => sticker.soundEffectPath
		).length;
		if ((probe.hasAudio || soundEffectCount > 0) && !outputProbe.hasAudio) {
			throw new Error("Rendered output is missing its audio stream");
		}
		publishStagedOutput({ stagedOutput, output });
		stagedOutput = undefined;

		onProgress({
			stage: "complete",
			percent: 100,
			message: "Sticker overlay complete",
		});
		return {
			success: true,
			outputPath: output,
			outputPaths: [output],
			data: {
				input,
				output,
				plan: planPath,
				stickerCount: overlays.length,
				soundEffectCount,
				width: outputProbe.width,
				height: outputProbe.height,
				duration: outputProbe.duration,
				assetDirectory: options.saveIntermediates ? assetDirectory : undefined,
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Sticker overlay failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	} finally {
		if (stagedOutput) rmSync(stagedOutput, { force: true });
		if (temporaryDirectory) {
			rmSync(temporaryDirectory, { recursive: true, force: true });
		}
	}
}
