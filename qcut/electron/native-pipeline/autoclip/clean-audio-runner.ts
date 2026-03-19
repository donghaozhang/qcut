/**
 * Clean Audio Pipeline Runner
 *
 * Removes filler words, stutters, and long silences from video/audio files.
 * Pipeline: transcribe → detect fillers/silences → ffmpeg concat keep-segments.
 *
 * Reuses filler detection logic from ai-filler-handler.ts (adapted for CLI)
 * and transcription from the native pipeline.
 *
 * @module electron/native-pipeline/autoclip/clean-audio-runner
 */

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "../cli/cli-runner/types.js";
import {
	analyzeFillersForCLI,
	type WordItem,
	type FilterDecision,
} from "./clean-audio-analysis.js";

const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────────────────────

interface CutInterval {
	start: number;
	end: number;
	reason: string;
}

interface KeepInterval {
	start: number;
	end: number;
}

export interface CleanAudioOptions {
	input: string;
	srtFile?: string;
	outputDir?: string;
	model?: string;
	removeFillers?: boolean;
	removeSilences?: boolean;
	silenceThreshold?: number;
	keepPadding?: number;
	dryRun?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_SILENCE_THRESHOLD = 1.0;
const DEFAULT_KEEP_PADDING = 0.15;

// ── Options parsing ──────────────────────────────────────────────────

export function parseCleanAudioOptions(opts: CLIRunOptions): CleanAudioOptions {
	return {
		input: opts.input ?? "",
		srtFile: opts.srtFile,
		outputDir: opts.output ?? opts.outputDir,
		model: opts.model,
		removeFillers: opts.removeFillers ?? true,
		removeSilences: opts.removeSilences ?? true,
		silenceThreshold: opts.silenceThreshold,
		keepPadding: opts.keepPadding,
		dryRun: opts.dryRun,
	};
}

// ── Main runner ──────────────────────────────────────────────────────

export async function runCleanAudio(
	options: CleanAudioOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const {
		input,
		removeFillers = true,
		removeSilences = true,
		dryRun,
	} = options;
	const silenceThreshold =
		options.silenceThreshold ?? DEFAULT_SILENCE_THRESHOLD;
	const keepPadding = options.keepPadding ?? DEFAULT_KEEP_PADDING;

	if (!input || !fs.existsSync(input)) {
		return { success: false, error: `Input file not found: ${input}` };
	}

	const outputDir =
		options.outputDir || path.join(path.dirname(input), "clean-output");
	const metadataDir = path.join(outputDir, "clean-metadata");
	ensureDir(metadataDir);

	const startTime = Date.now();

	try {
		// ─── Step 1: Get word-level transcription ─────────────────
		onProgress({
			stage: "transcribe",
			percent: 0,
			message: "Transcribing audio for word-level timestamps...",
		});

		const words = await getWordTimestamps(input, options.srtFile, signal);
		if (words.length === 0) {
			return { success: false, error: "No words found in transcription" };
		}

		saveJson(path.join(metadataDir, "words.json"), words);
		onProgress({
			stage: "transcribe",
			percent: 100,
			message: `Transcribed ${words.filter((w) => w.type === "word").length} words`,
		});

		// ─── Step 2: Detect fillers & silences ────────────────────
		onProgress({
			stage: "analyze",
			percent: 0,
			message: "Analyzing for fillers and silences...",
		});

		const decisions = await analyzeFillersForCLI({
			words,
			removeFillers,
			removeSilences,
			silenceThreshold,
			model: options.model,
		});

		saveJson(path.join(metadataDir, "decisions.json"), decisions);
		onProgress({
			stage: "analyze",
			percent: 100,
			message: `Found ${decisions.length} segments to remove`,
		});

		if (decisions.length === 0) {
			return {
				success: true,
				data: {
					message: "No fillers or silences detected — audio is clean",
					duration: (Date.now() - startTime) / 1000,
				},
			};
		}

		// ─── Step 3: Build cut/keep intervals ─────────────────────
		const wordMap = new Map(words.map((w) => [w.id, w]));
		const cutIntervals: CutInterval[] = [];

		for (const decision of decisions) {
			const word = wordMap.get(decision.id);
			if (!word) continue;
			cutIntervals.push({
				start: word.start,
				end: word.end,
				reason: decision.reason,
			});
		}

		const videoDuration = await getVideoDuration(input);
		const mergedCuts = mergeCutIntervals(cutIntervals);
		const keepIntervals = invertToKeep(mergedCuts, videoDuration, keepPadding);

		saveJson(path.join(metadataDir, "cuts.json"), mergedCuts);
		saveJson(path.join(metadataDir, "keeps.json"), keepIntervals);

		const totalCutTime = mergedCuts.reduce(
			(sum, c) => sum + (c.end - c.start),
			0
		);

		onProgress({
			stage: "plan",
			percent: 100,
			message: `Removing ${totalCutTime.toFixed(1)}s across ${mergedCuts.length} segments`,
		});

		if (dryRun) {
			return {
				success: true,
				data: {
					dryRun: true,
					totalWords: words.filter((w) => w.type === "word").length,
					decisionsCount: decisions.length,
					cutsCount: mergedCuts.length,
					totalCutTime: +totalCutTime.toFixed(1),
					totalKeepSegments: keepIntervals.length,
					videoDuration: +videoDuration.toFixed(1),
					estimatedOutputDuration: +(videoDuration - totalCutTime).toFixed(1),
					metadataDir,
				},
			};
		}

		// ─── Step 4: FFmpeg concat ────────────────────────────────
		onProgress({
			stage: "cutting",
			percent: 0,
			message: `Stitching ${keepIntervals.length} segments...`,
		});

		const ext = path.extname(input);
		const baseName = path.basename(input, ext);
		const outputPath = path.join(outputDir, `${baseName}_clean${ext}`);

		await concatKeepSegments(input, keepIntervals, outputPath, onProgress);

		onProgress({
			stage: "done",
			percent: 100,
			message: `Done! Removed ${totalCutTime.toFixed(1)}s of fillers/silences`,
		});

		return {
			success: true,
			outputPath,
			data: {
				totalWords: words.filter((w) => w.type === "word").length,
				decisionsCount: decisions.length,
				cutsCount: mergedCuts.length,
				totalCutTime: +totalCutTime.toFixed(1),
				videoDuration: +videoDuration.toFixed(1),
				outputDuration: +(videoDuration - totalCutTime).toFixed(1),
				outputPath,
				duration: (Date.now() - startTime) / 1000,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Clean audio error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

// ── Transcription ────────────────────────────────────────────────────

async function getWordTimestamps(
	input: string,
	srtFile: string | undefined,
	signal: AbortSignal
): Promise<WordItem[]> {
	// If SRT provided, parse it (no word-level timing though)
	if (srtFile && fs.existsSync(srtFile)) {
		return parseWordsFromSrt(srtFile);
	}

	// Extract audio to mp3 first (FAL rejects large video uploads)
	const audioPath = await extractAudioForTranscription(input);

	try {
		// Use FAL transcription API for word-level timestamps
		const { PipelineExecutor } = await import("../execution/executor.js");
		const { ModelRegistry } = await import("../infra/registry.js");

		// Ensure models are registered
		const { registerSpeechToTextModels } = await import(
			"../registry-data/speech-to-text.js"
		);
		if (!ModelRegistry.has("scribe_v2")) {
			registerSpeechToTextModels();
		}

		const executor = new PipelineExecutor();
		const result = await executor.executeStep(
			{
				type: "speech_to_text",
				model: "scribe_v2",
				params: {},
				enabled: true,
				retryCount: 0,
			},
			{ audioUrl: audioPath },
			{ signal }
		);

		if (!result.success || !result.data) {
			throw new Error(`Transcription failed: ${result.error || "unknown"}`);
		}

		const data = result.data as { words?: Array<Record<string, unknown>> };
		if (!Array.isArray(data.words)) {
			throw new Error("Transcription returned no word-level timestamps");
		}

		return data.words
			.filter(
				(w) =>
					(typeof w.text === "string" || typeof w.word === "string") &&
					typeof w.start === "number" &&
					typeof w.end === "number"
			)
			.map((w, i) => ({
				id: `w-${i}`,
				text: (w.text ?? w.word) as string,
				start: w.start as number,
				end: w.end as number,
				type: (w.type === "spacing" ? "spacing" : "word") as "word" | "spacing",
				speaker_id: w.speaker_id as string | undefined,
			}));
	} finally {
		// Clean up temp audio file
		try {
			if (audioPath !== input && fs.existsSync(audioPath)) {
				fs.unlinkSync(audioPath);
			}
		} catch {
			// ignore cleanup errors
		}
	}
}

/** Extract audio from video to a temp mp3 file for transcription. */
async function extractAudioForTranscription(
	inputPath: string
): Promise<string> {
	const ext = path.extname(inputPath).toLowerCase();
	if ([".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext)) {
		return inputPath; // Already audio
	}

	const ffmpegPath = await resolveFFmpegPath();
	const tmpAudio = path.join(
		path.dirname(inputPath),
		`.clean-audio-tmp-${Date.now()}.mp3`
	);

	await execFileAsync(ffmpegPath, [
		"-i",
		inputPath,
		"-vn",
		"-acodec",
		"libmp3lame",
		"-q:a",
		"4",
		"-y",
		tmpAudio,
	]);

	return tmpAudio;
}

/** Parse SRT file into word items (block-level timing, not ideal but usable). */
function parseWordsFromSrt(srtPath: string): WordItem[] {
	const content = fs.readFileSync(srtPath, "utf-8");
	const blocks = content.split(/\n\n+/).filter((b) => b.trim());
	const words: WordItem[] = [];

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;

		const timeMatch = lines[1].match(
			/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
		);
		if (!timeMatch) continue;

		const start =
			+timeMatch[1] * 3600 +
			+timeMatch[2] * 60 +
			+timeMatch[3] +
			+timeMatch[4] / 1000;
		const end =
			+timeMatch[5] * 3600 +
			+timeMatch[6] * 60 +
			+timeMatch[7] +
			+timeMatch[8] / 1000;
		const text = lines.slice(2).join(" ").trim();

		// Split block text into individual words with estimated timing
		const blockWords = text.split(/\s+/).filter(Boolean);
		const duration = end - start;
		const wordDuration =
			blockWords.length > 0 ? duration / blockWords.length : 0;

		for (let i = 0; i < blockWords.length; i++) {
			words.push({
				id: `w-${words.length}`,
				text: blockWords[i],
				start: start + i * wordDuration,
				end: start + (i + 1) * wordDuration,
				type: "word",
			});
		}
	}

	return words;
}

// ── Cut/keep interval logic ──────────────────────────────────────────

function mergeCutIntervals(cuts: CutInterval[]): CutInterval[] {
	if (cuts.length === 0) return [];
	const sorted = [...cuts].sort((a, b) => a.start - b.start);
	const merged: CutInterval[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const last = merged[merged.length - 1];
		if (sorted[i].start <= last.end + 0.05) {
			last.end = Math.max(last.end, sorted[i].end);
			last.reason += `; ${sorted[i].reason}`;
		} else {
			merged.push({ ...sorted[i] });
		}
	}
	return merged;
}

function invertToKeep(
	cuts: CutInterval[],
	totalDuration: number,
	padding: number
): KeepInterval[] {
	if (cuts.length === 0) return [{ start: 0, end: totalDuration }];

	const keeps: KeepInterval[] = [];
	let pos = 0;

	for (const cut of cuts) {
		const keepStart = pos;
		const keepEnd = Math.max(pos, cut.start - padding);
		if (keepEnd > keepStart + 0.05) {
			keeps.push({ start: keepStart, end: keepEnd });
		}
		pos = cut.end + padding;
	}

	if (pos < totalDuration - 0.05) {
		keeps.push({ start: pos, end: totalDuration });
	}

	return keeps;
}

// ── FFmpeg operations ────────────────────────────────────────────────

async function resolveFFmpegPath(): Promise<string> {
	try {
		const { getFFmpegPath } = await import("../../ffmpeg/paths.js");
		return getFFmpegPath();
	} catch {
		// Try staged binary (CLI mode where Electron imports fail)
		// __dirname = electron/native-pipeline/autoclip/
		const staged = path.join(
			__dirname,
			"..",
			"..",
			"resources",
			"ffmpeg",
			`${process.platform}-${process.arch}`,
			process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
		);
		if (fs.existsSync(staged)) return staged;
		return "ffmpeg";
	}
}

async function getVideoDuration(inputPath: string): Promise<number> {
	let ffprobePath: string;
	try {
		const { getFFprobePath } = await import("../../ffmpeg/paths.js");
		ffprobePath = await getFFprobePath();
	} catch {
		ffprobePath = "ffprobe";
	}

	const { stdout } = await execFileAsync(ffprobePath, [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		inputPath,
	]);
	const dur = parseFloat(stdout.trim());
	if (Number.isNaN(dur)) throw new Error("Could not determine video duration");
	return dur;
}

const AUDIO_ONLY_EXTENSIONS = new Set([
	".mp3",
	".wav",
	".m4a",
	".ogg",
	".flac",
]);

function isAudioOnly(filePath: string): boolean {
	return AUDIO_ONLY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function concatKeepSegments(
	inputPath: string,
	keeps: KeepInterval[],
	outputPath: string,
	onProgress: ProgressFn
): Promise<void> {
	const ffmpegPath = await resolveFFmpegPath();
	ensureDir(path.dirname(outputPath));

	if (keeps.length === 0) {
		throw new Error("No segments to keep — would produce empty output");
	}

	const audioOnly = isAudioOnly(inputPath);

	// Build ffmpeg complex filter for concat
	const filterParts = audioOnly
		? keeps.map(
				(k, i) =>
					`[0:a]atrim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
			)
		: keeps.map(
				(k, i) =>
					`[0:v]trim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
					`[0:a]atrim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
			);

	const concatInputs = audioOnly
		? keeps.map((_, i) => `[a${i}]`).join("")
		: keeps.map((_, i) => `[v${i}][a${i}]`).join("");

	const filter = audioOnly
		? filterParts.join(";") +
			`;${concatInputs}concat=n=${keeps.length}:v=0:a=1[outa]`
		: filterParts.join(";") +
			`;${concatInputs}concat=n=${keeps.length}:v=1:a=1[outv][outa]`;

	const args = ["-i", inputPath, "-filter_complex", filter];

	if (audioOnly) {
		args.push("-map", "[outa]", "-c:a", "aac", "-b:a", "128k");
	} else {
		args.push(
			"-map",
			"[outv]",
			"-map",
			"[outa]",
			"-c:v",
			"libx264",
			"-preset",
			"fast",
			"-crf",
			"23",
			"-c:a",
			"aac",
			"-b:a",
			"128k"
		);
	}

	args.push("-avoid_negative_ts", "make_zero", "-y", outputPath);

	onProgress({
		stage: "cutting",
		percent: 50,
		message: `Encoding ${keeps.length} segments...`,
	});

	await execFileAsync(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 });
}

// ── Utilities ────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveJson(filePath: string, data: unknown): void {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
