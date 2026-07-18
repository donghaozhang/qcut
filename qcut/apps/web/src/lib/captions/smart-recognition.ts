import { platform } from "@qcut/platform-core";
import { CAPTION_STYLE_PRESETS } from "@/lib/captions/caption-style-presets";
import { parseCaptionRewriteResponse } from "@/lib/captions/workbench";
import type {
	TranscriptionResult,
	TranscriptionSegment,
} from "@/types/captions";
import type { ElevenLabsTranscriptionWord } from "@/types/electron";
import type { CreateCaptionElement, SubtitleStyle } from "@/types/timeline";

/** Word retained for karaoke-capable caption elements (source-time based). */
export interface SmartCaptionWord {
	id: string;
	text: string;
	start: number;
	end: number;
}

export interface SmartSegmentation {
	segments: TranscriptionSegment[];
	/** Per-segment word breakdown keyed by segment id. */
	segmentWords: Map<number, SmartCaptionWord[]>;
}

const MAX_SEGMENT_WORDS = 14;
const MAX_SEGMENT_DURATION = 5;
const MAX_WORD_GAP = 0.8;
const SENTENCE_END_PATTERN = /[。.!?!?…;;]["')」』】]?\s*$/u;
const CJK_PATTERN = /[㐀-鿿぀-ヿ가-힯]/u;

export function parseKeyterms({ input }: { input: string }): string[] {
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const raw of input.split(/[,,、;;\n]+/u)) {
		const term = raw.trim();
		if (!term || seen.has(term)) continue;
		seen.add(term);
		terms.push(term);
	}
	// ElevenLabs bills keyterm biasing per request; keep the list bounded.
	return terms.slice(0, 40);
}

function makeSegment({
	id,
	start,
	end,
	text,
}: {
	id: number;
	start: number;
	end: number;
	text: string;
}): TranscriptionSegment {
	return {
		id,
		seek: 0,
		start,
		end: Math.max(end, start + 0.1),
		text,
		tokens: [],
		temperature: 0,
		avg_logprob: 0,
		compression_ratio: 1,
		no_speech_prob: 0,
	};
}

/**
 * Group ElevenLabs word-level output into caption-sized segments, breaking on
 * sentence-final punctuation, long silences, and length/duration caps.
 */
export function buildSegmentsFromWords({
	words,
}: {
	words: ElevenLabsTranscriptionWord[];
}): SmartSegmentation {
	const segments: TranscriptionSegment[] = [];
	const segmentWords = new Map<number, SmartCaptionWord[]>();
	let tokens: SmartCaptionWord[] = [];
	let text = "";
	let start = 0;
	let end = 0;

	const close = () => {
		const trimmed = text.trim();
		if (tokens.length > 0 && trimmed.length > 0) {
			const id = segments.length;
			segments.push(makeSegment({ id, start, end, text: trimmed }));
			segmentWords.set(id, tokens);
		}
		tokens = [];
		text = "";
	};

	for (const [index, word] of words.entries()) {
		if (word.type === "audio_event") continue;
		if (word.type === "spacing") {
			if (tokens.length > 0) text += word.text || " ";
			continue;
		}
		if (word.type === "punctuation") {
			if (tokens.length === 0) continue;
			text += word.text;
			const last = tokens.at(-1);
			if (last) last.text += word.text;
			end = Math.max(end, word.end);
			if (SENTENCE_END_PATTERN.test(text)) close();
			continue;
		}

		if (tokens.length > 0 && word.start - end > MAX_WORD_GAP) close();
		if (tokens.length === 0) start = word.start;
		// Scribe usually emits explicit spacing tokens; when it doesn't, join
		// non-CJK words with a space so text stays readable.
		if (text.length > 0 && !/\s$/u.test(text)) {
			const boundary = `${text.at(-1) ?? ""}${word.text.charAt(0)}`;
			if (!CJK_PATTERN.test(boundary)) text += " ";
		}
		tokens.push({
			id: `smart-word-${index}`,
			text: word.text,
			start: word.start,
			end: word.end,
		});
		text += word.text;
		end = Math.max(end, word.end);
		if (
			tokens.length >= MAX_SEGMENT_WORDS ||
			end - start >= MAX_SEGMENT_DURATION ||
			SENTENCE_END_PATTERN.test(text)
		) {
			close();
		}
	}
	close();

	return { segments, segmentWords };
}

function joinSegmentWords({ words }: { words: SmartCaptionWord[] }): string {
	const joined = words.map((word) => word.text).join(" ");
	return CJK_PATTERN.test(joined)
		? words.map((word) => word.text).join("")
		: joined;
}

/**
 * Ask the AI filler analyzer which words are disfluencies (嗯/呃/um/uh,
 * repeated or self-corrected fragments) and return their word ids.
 */
export async function analyzeFillerWords({
	segmentation,
	languageCode,
}: {
	segmentation: SmartSegmentation;
	languageCode: string;
}): Promise<Set<string>> {
	const words = [...segmentation.segmentWords.values()].flat();
	if (words.length === 0) return new Set();
	const { filteredWordIds } = await platform().analyzeFillers({
		words: words.map((word) => ({
			id: word.id,
			text: word.text,
			start: word.start,
			end: word.end,
			type: "word" as const,
		})),
		languageCode,
	});
	return new Set(filteredWordIds.map((decision) => decision.id));
}

/** Drop filler words and rebuild segment text; empty segments are removed. */
export function applyFillerRemoval({
	segmentation,
	removedWordIds,
}: {
	segmentation: SmartSegmentation;
	removedWordIds: Set<string>;
}): SmartSegmentation & { removedCount: number } {
	if (removedWordIds.size === 0) {
		return { ...segmentation, removedCount: 0 };
	}
	const segments: TranscriptionSegment[] = [];
	const segmentWords = new Map<number, SmartCaptionWord[]>();
	let removedCount = 0;
	for (const segment of segmentation.segments) {
		const words = segmentation.segmentWords.get(segment.id) ?? [];
		const kept = words.filter((word) => !removedWordIds.has(word.id));
		removedCount += words.length - kept.length;
		if (words.length > 0 && kept.length === 0) continue;
		const text =
			kept.length > 0 ? joinSegmentWords({ words: kept }) : segment.text;
		segments.push({
			...segment,
			start: kept[0]?.start ?? segment.start,
			end: Math.max(kept.at(-1)?.end ?? segment.end, segment.start + 0.1),
			text,
		});
		segmentWords.set(segment.id, kept);
	}
	return { segments, segmentWords, removedCount };
}

/** Run a one-shot Gemini prompt, collecting the streamed response. */
async function runGeminiPrompt({
	prompt,
}: {
	prompt: string;
}): Promise<string> {
	let streamedText = "";
	await new Promise<void>((resolve, reject) => {
		platform().geminiChat.removeListeners();
		platform().geminiChat.onStreamChunk((data) => {
			streamedText += data.text;
		});
		platform().geminiChat.onStreamComplete(() => resolve());
		platform().geminiChat.onStreamError((data) =>
			reject(new Error(data.message))
		);
		void platform()
			.geminiChat.send({ messages: [{ role: "user", content: prompt }] })
			.then((response) => {
				if (!response.success) {
					reject(new Error(response.error || "Gemini request failed"));
				}
			})
			.catch((error) => reject(error));
	});
	return streamedText;
}

/**
 * Translate every segment and append the translation as a second line,
 * producing JianYing-style bilingual captions.
 */
export async function translateSegmentsBilingual({
	segments,
	targetLanguage,
}: {
	segments: TranscriptionSegment[];
	targetLanguage: string;
}): Promise<{ segments: TranscriptionSegment[]; translatedCount: number }> {
	if (segments.length === 0) return { segments, translatedCount: 0 };
	const payload = segments.map((segment) => ({
		id: segment.id,
		text: segment.text,
	}));
	const prompt = [
		`Translate each subtitle segment below into ${targetLanguage}.`,
		"Rules:",
		"- Keep translations concise enough to read as subtitles.",
		"- Preserve names, brands, and technical terms.",
		'- Return ONLY a JSON array like [{"id": 0, "text": "..."}] with the translation as text.',
		"",
		JSON.stringify(payload),
	].join("\n");
	const response = await runGeminiPrompt({ prompt });
	const rewrites = parseCaptionRewriteResponse({ content: response });
	const translationById = new Map(
		rewrites.map((rewrite) => [rewrite.id, rewrite.text.trim()])
	);
	let translatedCount = 0;
	const nextSegments = segments.map((segment) => {
		const translation = translationById.get(segment.id);
		if (!translation || translation === segment.text) return segment;
		translatedCount += 1;
		return { ...segment, text: `${segment.text}\n${translation}` };
	});
	return { segments: nextSegments, translatedCount };
}

/** Ask the LLM which segments carry the key points; returns segment ids. */
export async function selectKeySegments({
	segments,
}: {
	segments: TranscriptionSegment[];
}): Promise<Set<number>> {
	if (segments.length === 0) return new Set();
	const limit = Math.max(1, Math.round(segments.length * 0.2));
	const payload = segments.map((segment) => ({
		id: segment.id,
		text: segment.text,
	}));
	const prompt = [
		"You are labeling subtitles for a video editor's key-point highlight feature.",
		`Pick at most ${limit} segments that carry the core message, memorable claims, numbers, or conclusions.`,
		"Return ONLY a JSON array of the chosen segment ids, e.g. [2, 7].",
		"",
		JSON.stringify(payload),
	].join("\n");
	const response = await runGeminiPrompt({ prompt });
	const match = response.match(/\[[\s\S]*?\]/u);
	if (!match) return new Set();
	const parsed: unknown = JSON.parse(match[0]);
	if (!Array.isArray(parsed)) return new Set();
	const validIds = new Set(segments.map((segment) => segment.id));
	return new Set(
		parsed.filter(
			(id): id is number => typeof id === "number" && validIds.has(id)
		)
	);
}

function highlightStyle(): SubtitleStyle | undefined {
	return CAPTION_STYLE_PRESETS.find(
		(preset) => preset.id === "knowledge-highlight"
	)?.style;
}

/**
 * Build timeline caption elements from processed segments. Source times are
 * shifted by `timelineOffset` and, when a source window is given (recognizing
 * a trimmed timeline clip), segments outside the window are dropped.
 */
export function buildSmartCaptionElements({
	segmentation,
	language,
	highlightIds,
	timelineOffset = 0,
	windowStart = 0,
	windowEnd = Number.POSITIVE_INFINITY,
}: {
	segmentation: SmartSegmentation;
	language: string;
	highlightIds?: Set<number>;
	timelineOffset?: number;
	windowStart?: number;
	windowEnd?: number;
}): CreateCaptionElement[] {
	const emphasis =
		highlightIds && highlightIds.size > 0 ? highlightStyle() : undefined;
	const shift = timelineOffset - windowStart;
	const elements: CreateCaptionElement[] = [];
	for (const segment of segmentation.segments) {
		if (segment.end <= windowStart || segment.start >= windowEnd) continue;
		const start = Math.max(segment.start, windowStart);
		const end = Math.min(segment.end, windowEnd);
		const words = (segmentation.segmentWords.get(segment.id) ?? [])
			.filter((word) => word.end > windowStart && word.start < windowEnd)
			.map((word) => ({
				id: word.id,
				text: word.text,
				start: Math.max(word.start, windowStart) + shift,
				end: Math.min(word.end, windowEnd) + shift,
				type: "word" as const,
			}));
		const style =
			emphasis && highlightIds?.has(segment.id)
				? structuredClone(emphasis)
				: undefined;
		elements.push({
			type: "captions",
			name: `Caption ${elements.length + 1}`,
			startTime: start + shift,
			duration: Math.max(0.1, end - start),
			trimStart: 0,
			trimEnd: 0,
			text: segment.text,
			language,
			confidence: 1 - segment.no_speech_prob,
			source: "transcription",
			...(words.length > 0 ? { words } : {}),
			...(style ? { style } : {}),
		});
	}
	return elements;
}

/** Wrap segments into a TranscriptionResult for the workbench/result views. */
export function toTranscriptionResult({
	segments,
	language,
}: {
	segments: TranscriptionSegment[];
	language: string;
}): TranscriptionResult {
	return {
		text: segments.map((segment) => segment.text).join(" "),
		segments,
		language,
	};
}
