/**
 * FFmpeg Word Filter Cut Export
 *
 * Handles word-filter-based video cutting with segment concatenation.
 * Supports sticker overlay as a second pass after cutting.
 *
 * Location: electron/ffmpeg-export-word-filter.ts
 */

import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

import type {
	ExportOptions,
	ExportResult,
	FFmpegProgress,
	StickerSource,
} from "./ffmpeg/types";

import { debugLog, parseProgress, probeVideoFile } from "./ffmpeg/utils";
import { appendStickerInputArgs } from "./ffmpeg-sticker-input";
import { buildStickerFilterGraph } from "./ffmpeg/sticker-filter-graph";

import { buildFilterCutComplex } from "./ffmpeg-filter-cut.js";
import type { IpcMainInvokeEvent } from "electron";

/** Execute an FFmpeg command, streaming progress events to the renderer. */
export async function runFFmpegCommand({
	args,
	event,
	ffmpegPath,
}: {
	args: string[];
	event?: IpcMainInvokeEvent;
	ffmpegPath: string;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const process = spawn(ffmpegPath, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderrOutput = "";
		process.stderr?.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderrOutput += text;
			if (event) {
				const progress = parseProgress(text);
				if (progress) {
					event.sender?.send?.("ffmpeg-progress", progress);
				}
			}
		});

		process.on("error", (error: Error) => {
			reject(error);
		});

		process.on("close", (code: number | null) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`FFmpeg failed with code ${code}. ${stderrOutput.slice(-5000)}`
				)
			);
		});
	});
}

/**
 * Remap an original-timeline time to the post-cut output timeline.
 * Walks through keep segments and accumulates output duration.
 */
function remapTimeForCutSegments(
	originalTime: number,
	keepSegments: Array<{ start: number; end: number }>
): number {
	let outputTime = 0;
	for (const seg of keepSegments) {
		if (originalTime <= seg.start) break;
		if (originalTime >= seg.end) {
			outputTime += seg.end - seg.start;
		} else {
			outputTime += originalTime - seg.start;
			break;
		}
	}
	return outputTime;
}

/**
 * Build FFmpeg args for a sticker overlay pass on an already-cut video.
 * Returns null if no valid stickers to overlay.
 */
function buildStickerOverlayPass(
	inputVideoPath: string,
	outputPath: string,
	stickerSources: StickerSource[],
	keepSegments: Array<{ start: number; end: number }>
): string[] | null {
	// Remap sticker timing and filter out stickers with zero duration
	const remapped = stickerSources
		.map((sticker) => ({
			...sticker,
			startTime: remapTimeForCutSegments(sticker.startTime, keepSegments),
			endTime: remapTimeForCutSegments(sticker.endTime, keepSegments),
		}))
		.filter((s) => s.endTime > s.startTime);

	if (remapped.length === 0) return null;

	// Validate all sticker files exist
	const validStickers = remapped.filter((s) => fs.existsSync(s.path));
	if (validStickers.length === 0) return null;

	const args: string[] = ["-y", "-i", inputVideoPath];

	for (const sticker of validStickers) {
		appendStickerInputArgs({ args, sticker });
	}

	// Build filter_complex
	const filterSteps: string[] = [];
	let currentVideoLabel = "0:v";
	let filterIdx = 0;

	for (const [index, sticker] of validStickers.entries()) {
		const inputIdx = 1 + index;
		const graph = buildStickerFilterGraph({
			inputLabel: `${inputIdx}:v`,
			sticker,
			labelPrefix: `word_sticker_${index}`,
		});
		filterSteps.push(...graph.filterSteps);
		const outputLabel = `v_sticker_${filterIdx++}`;
		const sStart = Number(sticker.startTime) || 0;
		const sEnd = Number(sticker.endTime) || 0;
		filterSteps.push(
			`[${currentVideoLabel}][${graph.inputLabel}]overlay=x=${graph.x}:y=${graph.y}:enable='between(t,${sStart},${sEnd})'[${outputLabel}]`
		);
		currentVideoLabel = outputLabel;
	}

	args.push(
		"-filter_complex",
		filterSteps.join(";"),
		"-map",
		`[${currentVideoLabel}]`,
		"-map",
		"0:a?",
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"copy",
		"-movflags",
		"+faststart",
		outputPath
	);

	return args;
}

/** Export using filter_complex to cut and concatenate word-filter segments. */
export async function handleWordFilterCut({
	options,
	ffmpegPath,
	outputFile,
	event,
	resolve,
	reject,
}: {
	options: ExportOptions;
	ffmpegPath: string;
	outputFile: string;
	event: IpcMainInvokeEvent;
	resolve: (value: ExportResult) => void;
	reject: (reason: Error) => void;
}): Promise<void> {
	try {
		if (!options.videoInputPath) {
			throw new Error(
				"Word filter cut mode requires useVideoInput with videoInputPath."
			);
		}

		if (!fs.existsSync(options.videoInputPath)) {
			throw new Error(`Video input not found: ${options.videoInputPath}`);
		}

		const keepSegments = options.wordFilterSegments || [];
		if (keepSegments.length === 0) {
			throw new Error("No keep segments provided for word filter cut.");
		}

		const trimStart = options.trimStart ?? 0;
		const adjustedSegments =
			trimStart > 0
				? keepSegments
						.map((seg) => ({
							start: Math.max(0, seg.start - trimStart),
							end: Math.max(0, seg.end - trimStart),
						}))
						.filter((seg) => seg.end > seg.start)
				: keepSegments;

		const hasStickers =
			options.stickerSources && options.stickerSources.length > 0;

		console.log(
			`🎬 [WORD FILTER CUT] Starting word filter cut — ${adjustedSegments.length} segments`
		);
		if (hasStickers) {
			console.log(
				`🎬 [WORD FILTER CUT] Will overlay ${options.stickerSources!.length} sticker(s) after cut (2-pass)`
			);
		}

		// Determine output target: if stickers exist, cut to temp file first
		const cutOutputFile = hasStickers
			? path.join(path.dirname(outputFile), "word-cut-intermediate.mp4")
			: outputFile;

		if (adjustedSegments.length > 100) {
			console.log(
				`🎬 [WORD FILTER CUT] Using fallback concat (${adjustedSegments.length} segments > 100)`
			);
			await handleWordFilterCutFallback({
				ffmpegPath,
				videoPath: options.videoInputPath,
				outputFile: cutOutputFile,
				keepSegments: adjustedSegments,
				event,
			});
		} else {
			console.log(
				`🎬 [WORD FILTER CUT] Pass 1: Cutting ${adjustedSegments.length} segments with filter_complex...`
			);
			const probe = await probeVideoFile(options.videoInputPath);
			const { filterComplex, outputMaps } = buildFilterCutComplex({
				keepSegments: adjustedSegments,
				hasAudio: probe.hasAudio,
			});

			const args: string[] = ["-y"];
			if (trimStart > 0) {
				args.push("-ss", String(trimStart));
			}
			args.push(
				"-i",
				options.videoInputPath,
				"-filter_complex",
				filterComplex,
				...outputMaps,
				"-c:v",
				"libx264",
				"-preset",
				"fast",
				"-crf",
				"18",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-movflags",
				"+faststart",
				cutOutputFile
			);

			await runFFmpegCommand({
				args,
				event,
				ffmpegPath,
			});
		}

		// Pass 2: Overlay stickers onto the cut video (with remapped timing)
		if (hasStickers && options.stickerSources) {
			console.log(
				`🎨 [WORD FILTER CUT] Pass 2: Overlaying ${options.stickerSources.length} sticker(s) onto cut video...`
			);
			debugLog(
				`[WordFilterCut] Applying ${options.stickerSources.length} sticker overlays to cut video`
			);

			const stickerArgs = buildStickerOverlayPass(
				cutOutputFile,
				outputFile,
				options.stickerSources,
				adjustedSegments
			);

			if (stickerArgs) {
				await runFFmpegCommand({
					args: stickerArgs,
					event,
					ffmpegPath,
				});
				console.log("🎨 [WORD FILTER CUT] Sticker overlay pass complete");

				// Clean up intermediate file
				try {
					fs.unlinkSync(cutOutputFile);
				} catch {
					// Ignore cleanup errors
				}
			} else {
				console.log(
					"🎨 [WORD FILTER CUT] No visible stickers after timing remap — skipping overlay pass"
				);
				// No valid stickers after remapping — rename intermediate to final
				fs.renameSync(cutOutputFile, outputFile);
			}
		}

		resolve({
			success: true,
			outputFile,
			method: "spawn",
		});
	} catch (error) {
		reject(error as Error);
	}
}

/** Fallback export: cut individual segments then concat via demuxer. */
async function handleWordFilterCutFallback({
	ffmpegPath,
	videoPath,
	outputFile,
	keepSegments,
	event,
}: {
	ffmpegPath: string;
	videoPath: string;
	outputFile: string;
	keepSegments: Array<{ start: number; end: number }>;
	event: IpcMainInvokeEvent;
}): Promise<void> {
	const outputDir = path.dirname(outputFile);
	const segmentDir = path.join(outputDir, "word-cut-segments");
	if (!fs.existsSync(segmentDir)) {
		fs.mkdirSync(segmentDir, { recursive: true });
	}

	const segmentPaths = keepSegments.map((_, index) =>
		path.join(segmentDir, `segment-${String(index).padStart(4, "0")}.mp4`)
	);

	await keepSegments.reduce(async (previousPromise, segment, index) => {
		await previousPromise;
		const duration = Math.max(0, segment.end - segment.start);
		const args = [
			"-y",
			"-ss",
			String(segment.start),
			"-t",
			String(duration),
			"-i",
			videoPath,
			"-c:v",
			"libx264",
			"-preset",
			"fast",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			segmentPaths[index],
		];
		await runFFmpegCommand({
			args,
			event,
			ffmpegPath,
		});
	}, Promise.resolve());

	const concatListPath = path.join(segmentDir, "concat-list.txt");
	const concatContent = segmentPaths
		.map((segmentPath) => {
			const escapedPath = segmentPath
				.replace(/\\/g, "/")
				.replace(/'/g, "'\\''");
			return `file '${escapedPath}'`;
		})
		.join("\n");
	fs.writeFileSync(concatListPath, concatContent, "utf8");

	await runFFmpegCommand({
		args: [
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			concatListPath,
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			outputFile,
		],
		event,
		ffmpegPath,
	});
}
