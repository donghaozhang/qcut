/**
 * Clean Audio Analysis — filler/silence detection via LLM and pattern matching.
 *
 * Extracted from clean-audio-runner.ts to keep file sizes manageable.
 *
 * @module electron/native-pipeline/autoclip/clean-audio-analysis
 */

import { getKey } from "../infra/key-manager.js";

// ── Types (shared with clean-audio-runner) ────────────────────────────

export interface WordItem {
	id: string;
	text: string;
	start: number;
	end: number;
	type: "word" | "spacing";
	speaker_id?: string;
}

export interface FilterDecision {
	id: string;
	reason: string;
	scope?: "word" | "sentence";
}

// ── Constants ─────────────────────────────────────────────────────────

const CHUNK_WORD_LIMIT = 300;
const CHUNK_WORD_OVERLAP = 40;
const REQUEST_TIMEOUT_MS = 30_000;

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

// ── Public API ────────────────────────────────────────────────────────

export async function analyzeFillersForCLI({
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

// ── LLM Analysis ──────────────────────────────────────────────────────

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

// ── Pattern matching fallback ─────────────────────────────────────────

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

// ── Response parsing ──────────────────────────────────────────────────

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
