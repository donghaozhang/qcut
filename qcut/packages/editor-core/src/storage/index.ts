/**
 * @qcut/editor-core storage exports
 * @module @qcut/editor-core/storage
 */

export type { EditorStorageProvider } from "./interface.js";

// Re-export transcription types for convenience
export type {
	PersistedTranscription,
	TranscriptionWord,
	TranscriptionSegment as PersistedTranscriptionSegment,
	TranscriptionAvailability,
} from "../types/transcription.js";
