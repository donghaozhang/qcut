import { ipcMain } from "electron";
import path from "node:path";
import { getDecryptedApiKeys } from "./api-key-handler.js";
import {
	isProxyAvailable,
	proxyRequest,
} from "./native-pipeline/infra/proxy-client.js";

interface Logger {
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

const noop = (): void => {};
let log: Logger = { info: noop, warn: noop, error: noop };

import("electron-log")
	.then((module) => {
		log = module.default as Logger;
	})
	.catch(() => {
		// Keep no-op logger when electron-log is unavailable
	});

type AIProvider = "gemini" | "anthropic" | "pattern";

interface AnalyzeWordItem {
	id: string;
	text: string;
	start: number;
	end: number;
	type: "word" | "spacing";
	speaker_id?: string;
}

interface AnalyzeFillersRequest {
	words: AnalyzeWordItem[];
	languageCode: string;
}

interface FilterDecision {
	id: string;
	reason: string;
	scope?: "word" | "sentence";
}

interface AnalyzeFillersResult {
	filteredWordIds: FilterDecision[];
	provider: AIProvider;
}

interface GeminiSdkModel {
	generateContent: (prompt: string) => Promise<{
		response: {
			text: () => string;
		};
	}>;
}

interface GeminiSdkClient {
	getGenerativeModel: (options: {
		model: string;
		generationConfig?: Record<string, unknown>;
	}) => GeminiSdkModel;
}

interface GeminiSdkConstructor {
	new (apiKey: string): GeminiSdkClient;
}

const CHUNK_WORD_LIMIT = 300;
const CHUNK_WORD_OVERLAP = 40;
const LONG_SILENCE_SECONDS = 1.5;
const REQUEST_TIMEOUT_MS = 30_000;
const GEMINI_FLASH_MODEL = "gemini-3.7-flash";
const GEMINI_FLASH_PROXY_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`;

/** Register the IPC handler for AI-based filler word analysis. */
export function setupAIFillerIPC(): void {
	ipcMain.handle(
		"ai:analyze-fillers",
		async (
			_event,
			rawRequest: AnalyzeFillersRequest
		): Promise<AnalyzeFillersResult> => {
			try {
				const words = sanitizeWords({ words: rawRequest.words });
				if (words.length === 0) {
					return { filteredWordIds: [], provider: "pattern" };
				}

				const request: AnalyzeFillersRequest = {
					words,
					languageCode: rawRequest.languageCode || "unknown",
				};
				return await analyzeFillersWithPriority({ request });
			} catch (error) {
				log.error("[AI Filler] IPC handler failed, using fallback:", error);
				return analyzeWithPatternMatch({ words: rawRequest.words || [] });
			}
		}
	);
}

/** Analyze fillers using the best available provider: Gemini > Anthropic > pattern. */
export async function analyzeFillersWithPriority({
	request,
}: {
	request: AnalyzeFillersRequest;
}): Promise<AnalyzeFillersResult> {
	try {
		if (await isProxyAvailable()) {
			try {
				return await analyzeWithGeminiProxy({
					words: request.words,
					languageCode: request.languageCode,
				});
			} catch (error) {
				log.warn("[AI Filler] Gemini proxy analysis failed:", error);
			}
		}

		const apiKeys = await getDecryptedApiKeys();
		if (apiKeys.geminiApiKey) {
			try {
				return await analyzeWithGemini({
					words: request.words,
					languageCode: request.languageCode,
					apiKey: apiKeys.geminiApiKey,
				});
			} catch (error) {
				log.warn("[AI Filler] Gemini analysis failed:", error);
			}
		}

		if (apiKeys.anthropicApiKey) {
			try {
				return await analyzeWithAnthropic({
					words: request.words,
					languageCode: request.languageCode,
					apiKey: apiKeys.anthropicApiKey,
				});
			} catch (error) {
				log.warn("[AI Filler] Anthropic analysis failed:", error);
			}
		}

		return analyzeWithPatternMatch({ words: request.words });
	} catch (error) {
		log.warn("[AI Filler] Provider selection failed:", error);
		return analyzeWithPatternMatch({ words: request.words });
	}
}

async function analyzeWithGeminiProxy({
	words,
	languageCode,
}: {
	words: AnalyzeWordItem[];
	languageCode: string;
}): Promise<AnalyzeFillersResult> {
	try {
		const chunks = splitWordChunks({ words });
		const chunkResults = await Promise.all(
			chunks.map(async (chunk) => {
				try {
					const prompt = buildFilterPrompt({ words: chunk, languageCode });
					const response = await proxyRequest({
						provider: "gemini",
						endpoint: GEMINI_FLASH_PROXY_URL,
						method: "POST",
						body: {
							contents: [{ role: "user", parts: [{ text: prompt }] }],
							generationConfig: { responseMimeType: "application/json" },
						},
						timeoutMs: REQUEST_TIMEOUT_MS,
					});
					if (!response.ok) {
						throw new Error(
							`Gemini proxy error ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`
						);
					}
					return parseFilterResponse({
						rawText: extractGeminiProxyText({ data: response.data }),
					});
				} catch (error) {
					log.warn("[AI Filler] Gemini proxy chunk failed:", error);
					return null;
				}
			})
		);
		const successfulChunkResults = chunkResults.filter(
			(result): result is FilterDecision[] => result !== null
		);
		if (successfulChunkResults.length === 0) {
			throw new Error("Gemini proxy analysis failed for every chunk");
		}

		return {
			filteredWordIds: mergeDecisions({
				decisions: successfulChunkResults.flat(),
			}),
			provider: "gemini",
		};
	} catch (error) {
		log.error("[AI Filler] Gemini proxy provider failed:", error);
		throw error;
	}
}

/** Analyze filler words using the Google Gemini API. */
async function analyzeWithGemini({
	words,
	languageCode,
	apiKey,
}: {
	words: AnalyzeWordItem[];
	languageCode: string;
	apiKey: string;
}): Promise<AnalyzeFillersResult> {
	try {
		const GoogleGenerativeAI = await loadGeminiSdk();
		const client = new GoogleGenerativeAI(apiKey);
		const model = client.getGenerativeModel({
			model: GEMINI_FLASH_MODEL,
			generationConfig: {
				responseMimeType: "application/json",
			},
		});

		const chunks = splitWordChunks({ words });
		const chunkResults = await Promise.all(
			chunks.map(async (chunk) => {
				try {
					const prompt = buildFilterPrompt({ words: chunk, languageCode });
					const generatePromise = model.generateContent(prompt);
					const result = await Promise.race([
						generatePromise,
						new Promise<never>((_, reject) =>
							setTimeout(
								() => reject(new Error("Gemini request timed out")),
								REQUEST_TIMEOUT_MS
							)
						),
					]);
					return parseFilterResponse({ rawText: result.response.text() });
				} catch (error) {
					log.warn("[AI Filler] Gemini chunk failed:", error);
					return [];
				}
			})
		);

		return {
			filteredWordIds: mergeDecisions({
				decisions: chunkResults.flat(),
			}),
			provider: "gemini",
		};
	} catch (error) {
		log.error("[AI Filler] Gemini provider failed:", error);
		throw error;
	}
}

/** Analyze filler words using the Anthropic Claude API. */
async function analyzeWithAnthropic({
	words,
	languageCode,
	apiKey,
}: {
	words: AnalyzeWordItem[];
	languageCode: string;
	apiKey: string;
}): Promise<AnalyzeFillersResult> {
	try {
		const chunks = splitWordChunks({ words });
		const chunkResults = await Promise.all(
			chunks.map(async (chunk) => {
				try {
					const prompt = buildFilterPrompt({ words: chunk, languageCode });
					const response = await fetch(
						"https://api.anthropic.com/v1/messages",
						{
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
						}
					);

					if (!response.ok) {
						const errorBody = await response.text();
						throw new Error(
							`Anthropic API error ${response.status}: ${errorBody.slice(0, 300)}`
						);
					}

					const data = (await response.json()) as {
						content?: Array<{ type: string; text?: string }>;
					};
					const textBlocks = data.content || [];
					const messageText = textBlocks
						.filter((block) => block.type === "text")
						.map((block) => block.text || "")
						.join("\n");

					return parseFilterResponse({ rawText: messageText });
				} catch (error) {
					log.warn("[AI Filler] Anthropic chunk failed:", error);
					return [];
				}
			})
		);

		return {
			filteredWordIds: mergeDecisions({
				decisions: chunkResults.flat(),
			}),
			provider: "anthropic",
		};
	} catch (error) {
		log.error("[AI Filler] Anthropic provider failed:", error);
		throw error;
	}
}

/** Detect filler words and stutters using regex pattern matching (offline fallback). */
export function analyzeWithPatternMatch({
	words,
}: {
	words: AnalyzeWordItem[];
}): AnalyzeFillersResult {
	try {
		const fillerWords = new Set([
			"um",
			"uh",
			"ah",
			"er",
			"erm",
			"hmm",
			"mmm",
			"uhh",
			"umm",
			"嗯",
			"呃",
			"额",
			"呃呃",
			"那个",
			"就是",
			"然后",
			"对吧",
			"你知道吧",
		]);

		const decisions: FilterDecision[] = [];
		const wordItems = words.filter((word) => word.type === "word");

		for (const word of words) {
			if (word.type === "word") {
				const cleaned = normalizeWordText({ text: word.text });
				if (fillerWords.has(cleaned)) {
					decisions.push({
						id: word.id,
						reason: "common filler word",
						scope: "word",
					});
				}
			}

			if (word.type === "spacing") {
				const gapDuration = Math.max(0, word.end - word.start);
				if (gapDuration > LONG_SILENCE_SECONDS) {
					decisions.push({
						id: word.id,
						reason: `${gapDuration.toFixed(1)}s silence gap`,
						scope: "word",
					});
				}
			}
		}

		for (let index = 0; index < wordItems.length - 1; index += 1) {
			const current = wordItems[index];
			const next = wordItems[index + 1];
			const currentText = normalizeWordText({ text: current.text });
			const nextText = normalizeWordText({ text: next.text });
			if (!currentText || currentText !== nextText) {
				continue;
			}

			const gap = Math.max(0, next.start - current.end);
			if (gap <= 0.5) {
				decisions.push({
					id: current.id,
					reason: "stutter repetition",
					scope: "word",
				});
			}
		}

		return {
			filteredWordIds: mergeDecisions({ decisions }),
			provider: "pattern",
		};
	} catch (error) {
		log.error("[AI Filler] Pattern analysis failed:", error);
		return {
			filteredWordIds: [],
			provider: "pattern",
		};
	}
}

function extractGeminiProxyText({ data }: { data: unknown }): string {
	try {
		const response = data as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
			}>;
		};
		return response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
	} catch {
		return "";
	}
}

/** Dynamically import the Gemini SDK, falling back to the packaged path. */
async function loadGeminiSdk(): Promise<GeminiSdkConstructor> {
	try {
		const module = await import("@google/generative-ai");
		return module.GoogleGenerativeAI as GeminiSdkConstructor;
	} catch {
		const modulePath = path.join(
			process.resourcesPath,
			"node_modules/@google/generative-ai/dist/index.js"
		);
		const module = await import(modulePath);
		return module.GoogleGenerativeAI as GeminiSdkConstructor;
	}
}

/** Split words into overlapping chunks for parallel AI analysis. */
function splitWordChunks({
	words,
}: {
	words: AnalyzeWordItem[];
}): AnalyzeWordItem[][] {
	try {
		const wordIndexes = words
			.map((word, index) => (word.type === "word" ? index : -1))
			.filter((index) => index >= 0);

		if (wordIndexes.length <= CHUNK_WORD_LIMIT) {
			return [words];
		}

		const chunks: AnalyzeWordItem[][] = [];
		const step = Math.max(1, CHUNK_WORD_LIMIT - CHUNK_WORD_OVERLAP);
		for (
			let startWordIndex = 0;
			startWordIndex < wordIndexes.length;
			startWordIndex += step
		) {
			const endWordIndex = Math.min(
				wordIndexes.length - 1,
				startWordIndex + CHUNK_WORD_LIMIT - 1
			);
			const startItemIndex = wordIndexes[startWordIndex];
			const endItemIndex = wordIndexes[endWordIndex];
			chunks.push(words.slice(startItemIndex, endItemIndex + 1));
		}

		return chunks;
	} catch {
		return [words];
	}
}

/** Deduplicate filter decisions by word ID, keeping the first occurrence. */
function mergeDecisions({
	decisions,
}: {
	decisions: FilterDecision[];
}): FilterDecision[] {
	try {
		const reasonById = new Map<string, FilterDecision>();
		for (const decision of decisions) {
			if (!decision.id || reasonById.has(decision.id)) {
				continue;
			}
			reasonById.set(decision.id, {
				id: decision.id,
				reason: decision.reason || "AI suggestion",
				scope: decision.scope || "word",
			});
		}
		return Array.from(reasonById.values());
	} catch {
		return [];
	}
}

/** Validate and normalize word items, filtering out invalid entries. */
function sanitizeWords({
	words,
}: {
	words: AnalyzeWordItem[];
}): AnalyzeWordItem[] {
	try {
		return words
			.filter((word) => Boolean(word?.id))
			.map((word) => ({
				id: String(word.id),
				text: String(word.text || ""),
				start: Number.isFinite(word.start) ? word.start : 0,
				end: Number.isFinite(word.end) ? word.end : 0,
				type: word.type === "word" ? "word" : "spacing",
				speaker_id: word.speaker_id,
			}));
	} catch {
		return [];
	}
}

/** Lowercase and strip punctuation from word text for comparison. */
function normalizeWordText({ text }: { text: string }): string {
	try {
		return text
			.toLowerCase()
			.replace(/[^\p{L}\p{N}'-]+/gu, "")
			.trim();
	} catch {
		return text.toLowerCase().trim();
	}
}

/** Build sentence-level and word-level context strings for the AI prompt. */
function buildSentenceContext({ words }: { words: AnalyzeWordItem[] }): {
	sentences: string;
	wordList: string;
} {
	try {
		const sentences: Array<{ text: string; startIdx: number; endIdx: number }> =
			[];
		let currentText = "";
		let currentStart = -1;
		let currentEnd = -1;

		for (const [index, word] of words.entries()) {
			if (word.type === "spacing") {
				const gap = Math.max(0, word.end - word.start);
				if (gap >= 0.5 && currentText.trim().length > 0) {
					sentences.push({
						text: currentText.trim(),
						startIdx: currentStart,
						endIdx: currentEnd,
					});
					currentText = "";
					currentStart = -1;
					currentEnd = -1;
				}
				continue;
			}

			if (currentStart === -1) {
				currentStart = index;
			}
			currentEnd = index;
			currentText += `${word.text} `;
		}

		if (currentText.trim().length > 0) {
			sentences.push({
				text: currentText.trim(),
				startIdx: currentStart,
				endIdx: currentEnd,
			});
		}

		const sentenceText = sentences
			.map(
				(sentence, index) =>
					`S${index}|${sentence.startIdx}-${sentence.endIdx}|${sentence.text}`
			)
			.join("\n");

		const wordList = words
			.filter(
				(word) =>
					word.type === "word" ||
					(word.type === "spacing" && word.end - word.start >= 0.5)
			)
			.map((word) => {
				if (word.type === "spacing") {
					const duration = Math.max(0, word.end - word.start);
					return `${word.id}|[silence ${duration.toFixed(1)}s]|${word.start.toFixed(2)}-${word.end.toFixed(2)}`;
				}
				return `${word.id}|${word.text}|${word.start.toFixed(2)}-${word.end.toFixed(2)}`;
			})
			.join("\n");

		return {
			sentences: sentenceText,
			wordList,
		};
	} catch {
		return { sentences: "", wordList: "" };
	}
}

/** Build the AI prompt for filler word and disfluency detection. */
export function buildFilterPrompt({
	words,
	languageCode,
}: {
	words: AnalyzeWordItem[];
	languageCode: string;
}): string {
	const { sentences, wordList } = buildSentenceContext({ words });
	return `Analyze this transcription and identify words/segments to remove for a clean edit.
Language: ${languageCode}

## Sentences (format: sentenceId|wordIndexRange|text):
${sentences}

## Words (format: id|text|startTime-endTime):
${wordList}

## Detection Rules (by priority, apply in order):

1. Silence >1s -> Mark for deletion.
2. Incomplete sentences -> Delete ENTIRE sentence.
3. Repeated sentences -> If adjacent starts are highly similar, delete shorter sentence.
4. In-sentence repeats -> Pattern A + filler + A, delete earlier A + filler.
5. Stutter words -> Same word repeated 2-3x, delete earlier ones.
6. Self-correction -> Keep later corrected phrase, delete interrupted earlier phrase.
7. Filler words -> "um", "uh", "er", "ah", conservative default.

## Core Principle
Delete earlier, keep later. If unsure, keep.

## Output Format
Return JSON array:
[{"id":"word-X","reason":"brief explanation","scope":"word|sentence"}]

For sentence-level deletions, include all word IDs in that sentence.
Return ONLY the JSON array, no extra text.`;
}

/** Extract a JSON array from raw AI response text, handling code blocks. */
function extractJsonArray({ rawText }: { rawText: string }): string | null {
	try {
		const trimmed = rawText.trim();
		if (trimmed.startsWith("[")) {
			return trimmed;
		}

		const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (codeBlockMatch?.[1]) {
			const inside = codeBlockMatch[1].trim();
			if (inside.startsWith("[")) {
				return inside;
			}
		}

		const firstBracket = trimmed.indexOf("[");
		const lastBracket = trimmed.lastIndexOf("]");
		if (firstBracket >= 0 && lastBracket > firstBracket) {
			return trimmed.slice(firstBracket, lastBracket + 1);
		}

		return null;
	} catch {
		return null;
	}
}

/** Parse the AI response text into validated filter decision objects. */
export function parseFilterResponse({
	rawText,
}: {
	rawText: string;
}): FilterDecision[] {
	try {
		const jsonArrayText = extractJsonArray({ rawText });
		if (!jsonArrayText) {
			return [];
		}

		const parsed = JSON.parse(jsonArrayText) as Array<{
			id?: unknown;
			reason?: unknown;
			scope?: unknown;
		}>;
		if (!Array.isArray(parsed)) {
			return [];
		}

		const decisions: FilterDecision[] = [];
		for (const item of parsed) {
			if (typeof item.id !== "string" || item.id.trim().length === 0) {
				continue;
			}

			decisions.push({
				id: item.id.trim(),
				reason:
					typeof item.reason === "string" && item.reason.trim().length > 0
						? item.reason.trim()
						: "AI suggestion",
				scope: item.scope === "sentence" ? "sentence" : "word",
			});
		}

		return mergeDecisions({ decisions });
	} catch {
		return [];
	}
}
