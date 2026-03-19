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
import { getKey } from "../infra/key-manager.js";

const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────────────────────

interface WordItem {
	id: string;
	text: string;
	start: number;
	end: number;
	type: "word" | "spacing";
	speaker_id?: string;
}

interface FilterDecision {
	id: string;
	reason: string;
	scope?: "word" | "sentence";
}

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

const CHUNK_WORD_LIMIT = 300;
const CHUNK_WORD_OVERLAP = 40;
const DEFAULT_SILENCE_THRESHOLD = 1.0;
const DEFAULT_KEEP_PADDING = 0.15;
const REQUEST_TIMEOUT_MS = 30_000;

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
				type: (w.type === "spacing" ? "spacing" : "word") as
					| "word"
					| "spacing",
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
		const wordDuration = blockWords.length > 0 ? duration / blockWords.length : 0;

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

// ── Filler analysis (adapted from ai-filler-handler.ts) ─────────────

const FILLER_WORDS = new Set([
	"um",
	"uh",
	"ah",
	"er",
	"erm",
	"hmm",
	"mmm",
	"uhh",
	"umm",
	// Chinese fillers
	"嗯",
	"啊",
	"呃",
	"哦",
	"额",
	"那个",
	"就是",
	"然后",
]);

async function analyzeFillersForCLI({
	words,
	removeFillers,
	removeSilences,
	silenceThreshold,
	model,
}: {
	words: WordItem[];
	removeFillers: boolean;
	removeSilences: boolean;
	silenceThreshold: number;
	model?: string;
}): Promise<FilterDecision[]> {
	const decisions: FilterDecision[] = [];

	// Silence detection
	if (removeSilences) {
		// Check spacing items
		for (const word of words) {
			if (word.type === "spacing") {
				const gap = word.end - word.start;
				if (gap > silenceThreshold) {
					decisions.push({
						id: word.id,
						reason: `${gap.toFixed(1)}s silence`,
						scope: "word",
					});
				}
			}
		}

		// Check gaps between consecutive items (any type)
		for (let i = 0; i < words.length - 1; i++) {
			const gap = words[i + 1].start - words[i].end;
			if (gap > silenceThreshold) {
				const gapId = `gap-${i}`;
				decisions.push({
					id: gapId,
					reason: `${gap.toFixed(1)}s silence gap`,
					scope: "word",
				});
				words.splice(i + 1, 0, {
					id: gapId,
					text: "",
					start: words[i].end,
					end: words[i + 1].start,
					type: "spacing",
				});
				i++;
			}
		}

		// Detect punctuation/events that represent long pauses
		// (scribe_v2 marks silences as long-duration punctuation like "。", "[笑]")
		const PAUSE_PATTERN = /^[。，、！？…\s]*$|^\[.*\]$/;
		for (const word of words) {
			if (word.type !== "word") continue;
			const dur = word.end - word.start;
			if (dur > silenceThreshold && PAUSE_PATTERN.test(word.text)) {
				decisions.push({
					id: word.id,
					reason: `${dur.toFixed(1)}s pause (${word.text})`,
					scope: "word",
				});
			}
		}
	}

	if (!removeFillers) return decisions;

	// Try LLM-based analysis first
	const llmDecisions = await tryLLMAnalysis(words, model);
	if (llmDecisions.length > 0) {
		decisions.push(...llmDecisions);
		return deduplicateDecisions(decisions);
	}

	// Fallback: pattern matching
	decisions.push(...patternMatchFillers(words));
	return deduplicateDecisions(decisions);
}

async function tryLLMAnalysis(
	words: WordItem[],
	model?: string
): Promise<FilterDecision[]> {
	const openrouterKey = getKey("OPENROUTER_API_KEY");
	const geminiKey = getKey("GEMINI_API_KEY");
	const anthropicKey = getKey("ANTHROPIC_API_KEY");

	if (openrouterKey) {
		try {
			return await analyzeWithOpenRouter(
				words,
				openrouterKey,
				model || "google/gemini-2.0-flash-001"
			);
		} catch {
			/* fall through */
		}
	}

	if (geminiKey) {
		try {
			return await analyzeWithGeminiREST(words, geminiKey);
		} catch {
			/* fall through */
		}
	}

	if (anthropicKey) {
		try {
			return await analyzeWithAnthropicREST(words, anthropicKey);
		} catch {
			/* fall through */
		}
	}

	return [];
}

/** Build the filler detection prompt. Reuses the same logic as ai-filler-handler. */
function buildPrompt(words: WordItem[]): string {
	const wordList = words
		.filter(
			(w) =>
				w.type === "word" ||
				(w.type === "spacing" && w.end - w.start >= 0.5)
		)
		.map((w) => {
			if (w.type === "spacing") {
				const dur = (w.end - w.start).toFixed(1);
				return `${w.id}|[silence ${dur}s]|${w.start.toFixed(2)}-${w.end.toFixed(2)}`;
			}
			return `${w.id}|${w.text}|${w.start.toFixed(2)}-${w.end.toFixed(2)}`;
		})
		.join("\n");

	return `Analyze this transcription and identify words/segments to remove for a clean edit.

## Words (format: id|text|startTime-endTime):
${wordList}

## Detection Rules (by priority):
1. Silence >1s -> Mark for deletion.
2. Incomplete sentences -> Delete ENTIRE sentence.
3. Repeated sentences -> Delete shorter duplicate.
4. In-sentence repeats -> Pattern A + filler + A, delete earlier A + filler.
5. Stutter words -> Same word repeated 2-3x, delete earlier ones.
6. Self-correction -> Keep corrected phrase, delete interrupted earlier phrase.
7. Filler words -> "um", "uh", "er", "ah", "嗯", "呃", conservative default.

## Core Principle
Delete earlier, keep later. If unsure, keep.

## Output Format
Return JSON array:
[{"id":"w-X","reason":"brief explanation","scope":"word|sentence"}]
Return ONLY the JSON array, no extra text.`;
}

/** Split words into overlapping chunks for LLM processing. */
function splitChunks(words: WordItem[]): WordItem[][] {
	const wordIndexes = words
		.map((w, i) => (w.type === "word" ? i : -1))
		.filter((i) => i >= 0);

	if (wordIndexes.length <= CHUNK_WORD_LIMIT) return [words];

	const chunks: WordItem[][] = [];
	const step = Math.max(1, CHUNK_WORD_LIMIT - CHUNK_WORD_OVERLAP);
	for (let si = 0; si < wordIndexes.length; si += step) {
		const ei = Math.min(wordIndexes.length - 1, si + CHUNK_WORD_LIMIT - 1);
		chunks.push(words.slice(wordIndexes[si], wordIndexes[ei] + 1));
	}
	return chunks;
}

async function analyzeWithOpenRouter(
	words: WordItem[],
	apiKey: string,
	model: string
): Promise<FilterDecision[]> {
	const chunks = splitChunks(words);
	const results = await Promise.all(
		chunks.map(async (chunk) => {
			const prompt = buildPrompt(chunk);
			const res = await fetch(
				"https://openrouter.ai/api/v1/chat/completions",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: prompt }],
						max_tokens: 4096,
					}),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				}
			);
			if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
			const data = (await res.json()) as Record<string, unknown>;
			const content = extractChatContent(data);
			return parseDecisions(content);
		})
	);
	return results.flat();
}

async function analyzeWithGeminiREST(
	words: WordItem[],
	apiKey: string
): Promise<FilterDecision[]> {
	const chunks = splitChunks(words);
	const results = await Promise.all(
		chunks.map(async (chunk) => {
			const prompt = buildPrompt(chunk);
			const res = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [{ parts: [{ text: prompt }] }],
						generationConfig: { responseMimeType: "application/json" },
					}),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				}
			);
			if (!res.ok) throw new Error(`Gemini ${res.status}`);
			const data = (await res.json()) as Record<string, unknown>;
			const candidates = (data.candidates ?? []) as Array<Record<string, unknown>>;
			const content = candidates[0]?.content as
				| { parts?: Array<{ text?: string }> }
				| undefined;
			const text = content?.parts?.[0]?.text ?? "";
			return parseDecisions(text);
		})
	);
	return results.flat();
}

async function analyzeWithAnthropicREST(
	words: WordItem[],
	apiKey: string
): Promise<FilterDecision[]> {
	const chunks = splitChunks(words);
	const results = await Promise.all(
		chunks.map(async (chunk) => {
			const prompt = buildPrompt(chunk);
			const res = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: "claude-sonnet-4-5-20250929",
					max_tokens: 4096,
					messages: [{ role: "user", content: prompt }],
				}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (!res.ok) throw new Error(`Anthropic ${res.status}`);
			const data = (await res.json()) as {
				content?: Array<{ type: string; text?: string }>;
			};
			const text = (data.content ?? [])
				.filter((b) => b.type === "text")
				.map((b) => b.text || "")
				.join("\n");
			return parseDecisions(text);
		})
	);
	return results.flat();
}

function patternMatchFillers(words: WordItem[]): FilterDecision[] {
	const decisions: FilterDecision[] = [];
	const wordItems = words.filter((w) => w.type === "word");

	for (const word of words) {
		if (word.type === "word") {
			const cleaned = word.text
				.toLowerCase()
				.replace(/[^\p{L}\p{N}'-]+/gu, "")
				.trim();
			if (FILLER_WORDS.has(cleaned)) {
				decisions.push({
					id: word.id,
					reason: "filler word",
					scope: "word",
				});
			}
		}
	}

	// Stutter detection
	for (let i = 0; i < wordItems.length - 1; i++) {
		const curr = wordItems[i].text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
		const next = wordItems[i + 1].text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
		if (curr && curr === next) {
			const gap = wordItems[i + 1].start - wordItems[i].end;
			if (gap <= 0.5) {
				decisions.push({
					id: wordItems[i].id,
					reason: "stutter repetition",
					scope: "word",
				});
			}
		}
	}

	return decisions;
}

// ── Response parsing ─────────────────────────────────────────────────

function extractChatContent(data: Record<string, unknown>): string {
	const choices = data.choices as Array<Record<string, unknown>> | undefined;
	if (choices?.[0]) {
		const msg = choices[0].message as Record<string, unknown> | undefined;
		if (typeof msg?.content === "string") return msg.content;
	}
	return "";
}

function parseDecisions(rawText: string): FilterDecision[] {
	try {
		const trimmed = rawText.trim();
		let jsonStr: string | null = null;

		if (trimmed.startsWith("[")) {
			jsonStr = trimmed;
		} else {
			const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
			if (match?.[1]?.trim().startsWith("[")) {
				jsonStr = match[1].trim();
			} else {
				const first = trimmed.indexOf("[");
				const last = trimmed.lastIndexOf("]");
				if (first >= 0 && last > first) {
					jsonStr = trimmed.slice(first, last + 1);
				}
			}
		}
		if (!jsonStr) return [];

		const parsed = JSON.parse(jsonStr) as Array<{
			id?: unknown;
			reason?: unknown;
			scope?: unknown;
		}>;
		if (!Array.isArray(parsed)) return [];

		return parsed
			.filter((item) => typeof item.id === "string" && item.id.trim())
			.map((item) => ({
				id: (item.id as string).trim(),
				reason:
					typeof item.reason === "string" ? item.reason.trim() : "AI suggestion",
				scope: (item.scope === "sentence" ? "sentence" : "word") as
					| "word"
					| "sentence",
			}));
	} catch {
		return [];
	}
}

function deduplicateDecisions(decisions: FilterDecision[]): FilterDecision[] {
	const seen = new Map<string, FilterDecision>();
	for (const d of decisions) {
		if (!seen.has(d.id)) seen.set(d.id, d);
	}
	return Array.from(seen.values());
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
			__dirname, "..", "..", "resources", "ffmpeg",
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

const AUDIO_ONLY_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac"]);

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
