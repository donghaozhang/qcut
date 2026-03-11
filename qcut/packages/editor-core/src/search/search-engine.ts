/**
 * Search Engine — pure logic for matching queries against transcription data.
 *
 * No framework dependencies. Works in Node, browser, or test environments.
 *
 * @module @qcut/editor-core/search/search-engine
 */

import type { PersistedTranscription } from "../types/transcription.js";

// ── Types ────────────────────────────────────────────────────────────

/** A single search result with location and timing data. */
export interface SearchResult {
	/** ID of the media item containing the match. */
	mediaId: string;
	/** Display name of the media item. */
	mediaName: string;
	/** Full text of the segment containing the match. */
	segmentText: string;
	/** Character index where the match starts in segmentText. */
	matchStart: number;
	/** Character index where the match ends in segmentText. */
	matchEnd: number;
	/** Start time (seconds) of the matching segment. */
	timestamp: number;
	/** End time (seconds) of the matching segment. */
	timestampEnd: number;
	/** Precise word-level timestamp (seconds), if available. */
	wordTimestamp?: number;
}

/** Options for configuring a search query. */
export interface SearchOptions {
	/** The search query string. */
	query: string;
	/** Whether matching should be case-sensitive. Default: false. */
	caseSensitive?: boolean;
	/** Whether to match whole words only. Default: false. */
	wholeWord?: boolean;
	/** Maximum number of results to return. Default: unlimited. */
	maxResults?: number;
	/** Scope search to a specific media ID. Default: search all. */
	mediaId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Escape special regex characters in a string.
 * This ensures user input is treated as a literal string when used in regex patterns.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a RegExp from search options.
 * Handles case sensitivity, whole word matching, and special character escaping.
 */
function buildSearchRegex(options: SearchOptions): RegExp {
	const escaped = escapeRegex(options.query);
	const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
	const flags = options.caseSensitive ? "g" : "gi";
	return new RegExp(pattern, flags);
}

/**
 * Find the best word-level timestamp for a match within a segment.
 *
 * Given a character-level match position in the segment text, finds the
 * corresponding word that overlaps with the match start position.
 */
function findWordTimestamp(
	words: PersistedTranscription["words"],
	segmentStart: number,
	segmentEnd: number,
	matchCharOffset: number,
	segmentText: string
): number | undefined {
	if (!words.length) return undefined;

	// Filter words that fall within this segment's time range
	const segmentWords = words.filter(
		(w) =>
			w.type === "word" &&
			w.start >= segmentStart - 0.01 &&
			w.end <= segmentEnd + 0.01
	);
	if (!segmentWords.length) return undefined;

	// Walk through words to find which one corresponds to matchCharOffset
	let charPos = 0;
	for (const word of segmentWords) {
		// Find where this word appears in the segment text, starting from charPos
		const idx = segmentText
			.toLowerCase()
			.indexOf(word.text.toLowerCase(), charPos);
		if (idx === -1) continue;

		const wordEnd = idx + word.text.length;
		if (matchCharOffset >= idx && matchCharOffset < wordEnd) {
			return word.start;
		}
		charPos = wordEnd;
	}

	// Fallback: return the first word's timestamp
	return segmentWords[0]?.start;
}

// ── Main Search Function ─────────────────────────────────────────────

/**
 * Search across one or more transcriptions for matching text.
 *
 * Results follow media order (input array order), then segment order within each transcription.
 *
 * @param transcriptions - Array of persisted transcriptions to search through.
 * @param options - Search configuration (query, case sensitivity, etc.).
 * @returns Array of search results with timing and highlight info.
 */
export function searchTranscriptions(
	transcriptions: PersistedTranscription[],
	options: SearchOptions
): SearchResult[] {
	if (!options.query || !options.query.trim()) return [];

	const regex = buildSearchRegex(options);
	const results: SearchResult[] = [];
	const maxResults = options.maxResults ?? Infinity;

	for (const transcription of transcriptions) {
		// Skip if scoped to a specific media and this isn't it
		if (options.mediaId && transcription.mediaId !== options.mediaId) continue;

		for (const segment of transcription.segments) {
			if (!segment.text) continue;

			// Reset regex lastIndex for each segment
			regex.lastIndex = 0;
			let match = regex.exec(segment.text);

			while (match !== null) {
				const wordTs = findWordTimestamp(
					transcription.words,
					segment.start,
					segment.end,
					match.index,
					segment.text
				);

				results.push({
					mediaId: transcription.mediaId,
					mediaName: transcription.mediaName,
					segmentText: segment.text,
					matchStart: match.index,
					matchEnd: match.index + match[0].length,
					timestamp: segment.start,
					timestampEnd: segment.end,
					wordTimestamp: wordTs,
				});

				if (results.length >= maxResults) return results;
				match = regex.exec(segment.text);
			}
		}
	}

	return results;
}
