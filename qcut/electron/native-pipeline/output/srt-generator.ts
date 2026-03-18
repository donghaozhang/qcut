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
			.filter(
				(w: unknown) =>
					w &&
					typeof w === "object" &&
					("word" in (w as Record<string, unknown>) ||
						"text" in (w as Record<string, unknown>)) &&
					"start" in (w as Record<string, unknown>) &&
					"end" in (w as Record<string, unknown>)
			)
			.map((w: unknown) => {
				const item = w as Record<string, unknown>;
				return {
					word: (item.word ?? item.text) as string,
					start: item.start as number,
					end: item.end as number,
				};
			});
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
					if (
						w &&
						typeof w === "object" &&
						"word" in (w as Record<string, unknown>) &&
						"start" in (w as Record<string, unknown>) &&
						"end" in (w as Record<string, unknown>)
					) {
						allWords.push(w as WordTimestamp);
					}
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
		entries.push({
			index,
			start: currentWords[0].start,
			end: currentWords[currentWords.length - 1].end,
			text: currentWords.map((w) => w.word).join(" "),
		});
		index++;
		currentWords = [];
	}

	for (const word of words) {
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

	const entries = groupWords(words, maxWords, maxDuration);

	return entries
		.map(
			(e) =>
				`${e.index}\n${formatTimecode(e.start)} --> ${formatTimecode(e.end)}\n${e.text}\n`
		)
		.join("\n");
}
