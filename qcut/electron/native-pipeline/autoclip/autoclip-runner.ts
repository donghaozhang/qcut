/**
 * AutoClip Pipeline Runner
 *
 * Orchestrates the 4-step subtitle-based clip extraction pipeline:
 * 1. Parse SRT → chunk → extract outline
 * 2. Extract timeline (timestamps per topic)
 * 3. Score segments
 * 4. Cut video with FFmpeg
 *
 * @module electron/native-pipeline/autoclip/autoclip-runner
 */

import * as fs from "fs";
import * as path from "path";
import {
	parseSubtitleFile,
	chunkByInterval,
	type SrtChunk,
} from "./srt-parser.js";
import { extractOutline, type OutlineTopic } from "./steps/step-outline.js";
import {
	extractTimeline,
	type TimelineSegment,
} from "./steps/step-timeline.js";
import {
	scoreSegments,
	type ScoredSegment,
} from "./steps/step-scoring.js";
import { cutSegments, type CutResult } from "./steps/step-cut.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "../cli/cli-runner/types.js";

export interface AutoclipOptions {
	input: string; // Video file path
	srt?: string; // SRT/VTT file path
	outputDir?: string; // Output directory
	model?: string; // LLM model
	minScore?: number; // Score threshold 0-1
	step?: number; // Run specific step only
	chunkMinutes?: number; // Chunk interval
	dryRun?: boolean; // Skip video cutting
}

/** Ensure directory exists. */
function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Save JSON to file. */
function saveJson(filePath: string, data: unknown): void {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** Load JSON from file. */
function loadJson<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

/** Extract autoclip options from CLI run options. */
export function parseAutoclipOptions(opts: CLIRunOptions): AutoclipOptions {
	return {
		input: opts.input ?? "",
		srt: opts.srtFile,
		outputDir: opts.output ?? opts.outputDir,
		model: opts.model,
		minScore: opts.minScore,
		step: opts.autoclipStep,
		chunkMinutes: opts.chunkMinutes,
		dryRun: opts.dryRun,
	};
}

/**
 * Run the AutoClip pipeline.
 */
export async function runAutoclip(
	options: AutoclipOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const { input, model, dryRun } = options;
	const minScore = options.minScore ?? 0.7;
	const chunkMinutes = options.chunkMinutes ?? 30;
	const step = options.step;

	// Validate input
	if (!input || !fs.existsSync(input)) {
		return { success: false, error: `Input file not found: ${input}` };
	}

	// Determine output directory
	const outputDir =
		options.outputDir || path.join(path.dirname(input), "autoclip-output");
	const metadataDir = path.join(outputDir, "autoclip-metadata");
	ensureDir(metadataDir);

	// Determine SRT file
	let srtPath = options.srt;
	if (!srtPath) {
		// Try to find SRT next to video
		const baseName = path.basename(input, path.extname(input));
		const videoDir = path.dirname(input);
		for (const ext of [".srt", ".vtt"]) {
			const candidate = path.join(videoDir, baseName + ext);
			if (fs.existsSync(candidate)) {
				srtPath = candidate;
				break;
			}
		}
	}
	if (!srtPath || !fs.existsSync(srtPath)) {
		return {
			success: false,
			error: `No subtitle file found. Provide --srt flag or place .srt/.vtt next to the video.`,
		};
	}

	const stepOpts = { model, signal };

	try {
		// ─── Step 1: Parse SRT + Extract Outline ──────────────────
		let outlines: OutlineTopic[];
		let chunks: SrtChunk[];
		const outlinePath = path.join(metadataDir, "step1_outline.json");
		const chunksPath = path.join(metadataDir, "chunks.json");

		if (step && step > 1 && fs.existsSync(outlinePath)) {
			outlines = loadJson(outlinePath);
			chunks = loadJson(chunksPath);
		} else if (!step || step === 1) {
			onProgress({
				stage: "parse",
				percent: 0,
				message: `Parsing subtitles: ${path.basename(srtPath)}`,
			});

			const entries = parseSubtitleFile(srtPath);
			if (entries.length === 0) {
				return { success: false, error: "No subtitle entries found in file" };
			}

			chunks = chunkByInterval(entries, chunkMinutes);
			saveJson(chunksPath, chunks);

			onProgress({
				stage: "outline",
				percent: 0,
				message: `Extracting outlines from ${chunks.length} chunks`,
			});

			outlines = await extractOutline(chunks, {
				...stepOpts,
				onProgress,
			});
			saveJson(outlinePath, outlines);

			if (outlines.length === 0) {
				return {
					success: false,
					error: "No topics extracted from subtitles",
				};
			}

			onProgress({
				stage: "outline",
				percent: 100,
				message: `Extracted ${outlines.length} topics`,
			});

			if (step === 1) {
				return {
					success: true,
					data: {
						step: 1,
						topics: outlines.length,
						chunks: chunks.length,
						outlinePath,
					},
				};
			}
		} else {
			return {
				success: false,
				error: `Step ${step} requires previous step outputs. Run step 1 first.`,
			};
		}

		// ─── Step 2: Extract Timeline ─────────────────────────────
		let timeline: TimelineSegment[];
		const timelinePath = path.join(metadataDir, "step2_timeline.json");

		if (step && step > 2 && fs.existsSync(timelinePath)) {
			timeline = loadJson(timelinePath);
		} else if (!step || step === 2) {
			onProgress({
				stage: "timeline",
				percent: 0,
				message: "Extracting timestamps for each topic",
			});

			timeline = await extractTimeline(outlines!, chunks!, {
				...stepOpts,
				onProgress,
			});
			saveJson(timelinePath, timeline);

			onProgress({
				stage: "timeline",
				percent: 100,
				message: `Located ${timeline.length} segments`,
			});

			if (step === 2) {
				return {
					success: true,
					data: {
						step: 2,
						segments: timeline.length,
						timelinePath,
					},
				};
			}
		} else {
			return {
				success: false,
				error: `Step ${step} requires previous step outputs. Run step 2 first.`,
			};
		}

		// ─── Step 3: Score Segments ───────────────────────────────
		let highScore: ScoredSegment[];
		const allScoresPath = path.join(metadataDir, "step3_all_scores.json");
		const highScoresPath = path.join(metadataDir, "step3_high_scores.json");

		if (step && step > 3 && fs.existsSync(highScoresPath)) {
			highScore = loadJson(highScoresPath);
		} else if (!step || step === 3) {
			onProgress({
				stage: "scoring",
				percent: 0,
				message: "Scoring segments for highlight potential",
			});

			const scored = await scoreSegments(timeline!, {
				...stepOpts,
				minScore,
				onProgress,
			});
			saveJson(allScoresPath, scored.all);
			saveJson(highScoresPath, scored.highScore);
			highScore = scored.highScore;

			onProgress({
				stage: "scoring",
				percent: 100,
				message: `${scored.highScore.length}/${scored.all.length} segments above ${minScore} threshold`,
			});

			if (step === 3) {
				return {
					success: true,
					data: {
						step: 3,
						total: scored.all.length,
						highScore: scored.highScore.length,
						threshold: minScore,
						allScoresPath,
						highScoresPath,
					},
				};
			}
		} else {
			return {
				success: false,
				error: `Step ${step} requires previous step outputs. Run step 3 first.`,
			};
		}

		// ─── Step 4: Cut Video ────────────────────────────────────
		if (dryRun) {
			return {
				success: true,
				data: {
					dryRun: true,
					topics: outlines!.length,
					segments: timeline!.length,
					highScore: highScore.length,
					threshold: minScore,
					metadataDir,
				},
			};
		}

		if (!step || step === 4) {
			if (highScore.length === 0) {
				return {
					success: true,
					data: {
						message:
							"No segments scored above threshold. Try lowering --min-score.",
						threshold: minScore,
					},
				};
			}

			onProgress({
				stage: "cutting",
				percent: 0,
				message: `Cutting ${highScore.length} highlight clips`,
			});

			const cutResults = await cutSegments(
				highScore,
				input,
				outputDir,
				{ onProgress }
			);

			const succeeded = cutResults.filter((r) => r.success);
			const failed = cutResults.filter((r) => !r.success);

			onProgress({
				stage: "done",
				percent: 100,
				message: `Done! ${succeeded.length} clips created${failed.length > 0 ? `, ${failed.length} failed` : ""}`,
			});

			return {
				success: true,
				outputPath: path.join(outputDir, "clips"),
				outputPaths: succeeded.map((r) => r.outputPath),
				data: {
					topics: outlines!.length,
					segments: timeline!.length,
					highScore: highScore.length,
					clipsCreated: succeeded.length,
					clipsFailed: failed.length,
					threshold: minScore,
					outputDir,
					failures: failed.map((f) => ({
						id: f.segmentId,
						title: f.title,
						error: f.error,
					})),
				},
			};
		}

		return { success: false, error: `Invalid step: ${step}` };
	} catch (err) {
		return {
			success: false,
			error: `AutoClip pipeline error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
