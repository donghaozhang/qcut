/**
 * Storage provider interface for editor persistence.
 *
 * Platform adapters implement this to provide project/timeline storage:
 * - Desktop: ElectronStorageAdapter → IPC → disk
 * - Web: IndexedDB + OPFS
 *
 * @module @qcut/editor-core/storage
 */

import type { TimelineTrack } from "../types/timeline.js";
import type { PersistedTranscription } from "../types/transcription.js";

/**
 * Minimal storage interface for editor core operations.
 *
 * This is the subset of StorageService that editor-core needs.
 * The full StorageService in apps/web implements much more
 * (media files, project CRUD, folders, etc.).
 */
export interface EditorStorageProvider {
	/** Load timeline tracks for a project (and optionally a scene). */
	loadTimeline(params: {
		projectId: string;
		sceneId?: string;
	}): Promise<TimelineTrack[] | null>;

	/** Save timeline tracks for a project (and optionally a scene). */
	saveTimeline(params: {
		projectId: string;
		tracks: TimelineTrack[];
		sceneId?: string;
	}): Promise<void>;

	/** Find a thumbnail URL for a project from persisted data. */
	findProjectThumbnail(
		projectId: string,
		tracks: TimelineTrack[] | null
	): Promise<string | null>;

	// ── Transcription persistence (optional — not all adapters implement) ──

	/** Save a transcription for a media item. Overwrites if already exists. */
	saveTranscription?(params: {
		projectId: string;
		transcription: PersistedTranscription;
	}): Promise<void>;

	/** Load a transcription for a specific media item. Returns null if not found. */
	loadTranscription?(params: {
		projectId: string;
		mediaId: string;
	}): Promise<PersistedTranscription | null>;

	/** List all persisted transcriptions for a project. */
	listTranscriptions?(params: {
		projectId: string;
	}): Promise<PersistedTranscription[]>;
}
