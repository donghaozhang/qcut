/**
 * Persisted transcription types for search and storage.
 *
 * These types represent transcription data stored per media item,
 * enabling cross-session search and retrieval.
 *
 * @module @qcut/editor-core/types/transcription
 */

/** A single word with precise timing information. */
export interface TranscriptionWord {
	/** The word or punctuation text. */
	text: string;
	/** Start time in seconds. */
	start: number;
	/** End time in seconds. */
	end: number;
	/** Word type: "word", "spacing", or "punctuation". */
	type: string;
	/** Optional speaker identifier. */
	speakerId?: string | null;
}

/** A segment (sentence/phrase) with timing and optional word-level detail. */
export interface TranscriptionSegment {
	/** Full text of the segment. */
	text: string;
	/** Start time in seconds. */
	start: number;
	/** End time in seconds. */
	end: number;
	/** Optional word-level breakdown within this segment. */
	words?: TranscriptionWord[];
}

/** Persisted transcription data for a single media item. */
export interface PersistedTranscription {
	/** Schema version for future migrations. */
	version: 1;
	/** ID of the media item this transcription belongs to. */
	mediaId: string;
	/** Display name of the media item (for search results). */
	mediaName: string;
	/** Detected or specified language code (e.g. "en", "zh"). */
	language: string;
	/** Total media duration in seconds. */
	duration: number;
	/** Transcription provider (e.g. "elevenlabs", "gemini"). */
	provider: string;
	/** Unix timestamp (ms) when this transcription was created. */
	createdAt: number;
	/** Full concatenated transcript text. */
	text: string;
	/** Word-level timing data (if available from provider). */
	words: TranscriptionWord[];
	/** Segment-level timing data. */
	segments: TranscriptionSegment[];
}

/** Status of transcription for a media item. */
export type TranscriptionAvailability = "none" | "loading" | "ready" | "error";
