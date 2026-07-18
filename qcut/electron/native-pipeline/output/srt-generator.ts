/**
 * SRT Subtitle Generator
 *
 * Converts word-level timestamps from STT API responses
 * into SRT subtitle format. Ported from Python SRT generation logic.
 *
 * @module electron/native-pipeline/srt-generator
 */

export interface WordTimestamp {
	word: string;
	start: number;
	end: number;
}

export interface SrtOptions {
	/** Max words per subtitle line (default: 8) */
	maxWords?: number;
	/** Max duration per subtitle in seconds (default: 4.0) */
	maxDuration?: number;
}

interface SrtEntry {
	index: number;
	start: number;
	end: number;
	text: string;
}

/** CJK ideographs, kana, and fullwidth/CJK punctuation. */
const CJK_CHAR =
	/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Tokens that are only punctuation/whitespace (never start a line). */
const PUNCT_ONLY_TOKEN =
	/^[\s。，、！？；：…·—～「」『』（）《》【】!?,.;:'")\]]+$/;

/** Closing punctuation stuck to the front of a token (e.g. "，Sol"). */
const LEADING_CLOSER = /^[。，、！？；：…·—～」』）》】!?,.;:'")\]]+/;

/**
 * STT tokens sometimes carry the previous clause's closing punctuation as
 * a prefix ("，Sol，"). Move that prefix onto the preceding token so a
 * subtitle line can never start with it.
 */
function reattachLeadingPunctuation(words: WordTimestamp[]): WordTimestamp[] {
	const out: WordTimestamp[] = [];
	for (const word of words) {
		const prefix = word.word.match(LEADING_CLOSER)?.[0];
		if (prefix && prefix.length < word.word.length && out.length > 0) {
			const prev = out[out.length - 1];
			out[out.length - 1] = { ...prev, word: prev.word + prefix };
			out.push({ ...word, word: word.word.slice(prefix.length) });
		} else {
			out.push(word);
		}
	}
	return out;
}

/** Join tokens with spaces only between non-CJK neighbors (Latin words). */
function joinTokens(words: WordTimestamp[]): string {
	let text = "";
	for (const { word } of words) {
		const token = word.trim();
		if (!token) continue;
		const needsSpace =
			text.length > 0 &&
			!CJK_CHAR.test(text[text.length - 1]) &&
			!CJK_CHAR.test(token[0]) &&
			!PUNCT_ONLY_TOKEN.test(token);
		text += needsSpace ? ` ${token}` : token;
	}
	return text;
}

/**
 * Format seconds into SRT timecode: HH:MM:SS,mmm
 */
function formatTimecode(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.round((seconds % 1) * 1000);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * Extract word timestamps from STT API response data.
 * Handles common response formats (ElevenLabs Scribe, FAL, etc.)
 */
export function extractWordTimestamps(
	data: unknown
): WordTimestamp[] | undefined {
	if (!data || typeof data !== "object") return;
	const obj = data as Record<string, unknown>;

	// Format 1: { words: [{ word, start, end }] } or { words: [{ text, start, end }] }
	if (Array.isArray(obj.words)) {
		return obj.words
			.map((w: unknown) => {
				if (!w || typeof w !== "object") return null;
				const item = w as Record<string, unknown>;
				return {
					word: item.word ?? item.text,
					start: item.start,
					end: item.end,
				};
			})
			.filter(
				(item): item is WordTimestamp =>
					item != null &&
					typeof item.word === "string" &&
					typeof item.start === "number" &&
					typeof item.end === "number"
			);
	}

	// Format 2: { segments: [{ words: [...] }] }
	if (Array.isArray(obj.segments)) {
		const allWords: WordTimestamp[] = [];
		for (const seg of obj.segments) {
			if (
				seg &&
				typeof seg === "object" &&
				Array.isArray((seg as Record<string, unknown>).words)
			) {
				for (const w of (seg as Record<string, unknown>).words as unknown[]) {
					if (!w || typeof w !== "object") continue;
					const item = w as Record<string, unknown>;
					if (
						!("word" in item || "text" in item) ||
						typeof item.start !== "number" ||
						typeof item.end !== "number"
					)
						continue;
					const word = (item.word ?? item.text) as string;
					if (typeof word !== "string") continue;
					allWords.push({ word, start: item.start, end: item.end });
				}
			}
		}
		if (allWords.length > 0) return allWords;
	}

	return;
}

/**
 * Group word timestamps into subtitle entries respecting
 * maxWords and maxDuration constraints.
 */
function groupWords(
	words: WordTimestamp[],
	maxWords: number,
	maxDuration: number
): SrtEntry[] {
	const entries: SrtEntry[] = [];
	let currentWords: WordTimestamp[] = [];
	let index = 1;

	function flush(): void {
		if (currentWords.length === 0) return;
		const text = joinTokens(currentWords);
		if (text) {
			entries.push({
				index,
				start: currentWords[0].start,
				end: currentWords[currentWords.length - 1].end,
				text,
			});
			index++;
		}
		currentWords = [];
	}

	for (const word of words) {
		// Punctuation must not start a line: keep it on the current one
		// even when that line is already at its limits.
		if (currentWords.length > 0 && PUNCT_ONLY_TOKEN.test(word.word)) {
			currentWords.push(word);
			continue;
		}

		const wouldExceedWords = currentWords.length >= maxWords;
		const wouldExceedDuration =
			currentWords.length > 0 && word.end - currentWords[0].start > maxDuration;

		if (wouldExceedWords || wouldExceedDuration) {
			flush();
		}

		currentWords.push(word);
	}

	flush();
	return entries;
}

/**
 * Generate SRT subtitle content from word timestamps.
 */
export function generateSrt(
	words: WordTimestamp[],
	options?: SrtOptions
): string {
	const maxWords = options?.maxWords ?? 8;
	const maxDuration = options?.maxDuration ?? 4.0;

	const entries = groupWords(
		reattachLeadingPunctuation(words),
		maxWords,
		maxDuration
	);

	return entries
		.map(
			(e) =>
				`${e.index}\n${formatTimecode(e.start)} --> ${formatTimecode(e.end)}\n${e.text}\n`
		)
		.join("\n");
}
