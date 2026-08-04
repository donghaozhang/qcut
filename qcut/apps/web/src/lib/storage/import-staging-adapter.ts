/**
 * Import staging adapter (JYI-010).
 *
 * The write primitives of an import transaction, journaled and ordered so
 * publish is a single visible step: media bytes and timelines land under a
 * project id that no project record points at yet, and only
 * `publishProject` makes the project exist. Rollback deletes everything the
 * journal attributes to this import — and nothing else.
 *
 * @module lib/storage/import-staging-adapter
 */

import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { storageService } from "./storage-service";
import type { ImportJournal } from "./import-journal";

/** The storage surface the staging session needs; injectable for tests. */
export interface ImportStagingStorage {
	saveMediaItem: (projectId: string, mediaItem: MediaItem) => Promise<void>;
	saveTimeline: (options: {
		projectId: string;
		tracks: TimelineTrack[];
		sceneId?: string;
	}) => Promise<void>;
	loadTimeline: (options: {
		projectId: string;
		sceneId?: string;
	}) => Promise<TimelineTrack[] | null>;
	saveProject: (options: { project: TProject }) => Promise<void>;
	loadProject: (options: { id: string }) => Promise<TProject | null>;
	getProjectStorageInfo: (
		projectId: string
	) => Promise<{ mediaItems: number; hasTimeline: boolean }>;
	deleteProjectMedia: (projectId: string) => Promise<void>;
	deleteProjectTimeline: (options: {
		projectId: string;
		sceneId?: string;
	}) => Promise<void>;
	deleteProject: (id: string) => Promise<void>;
}

export class ImportStagingSession {
	readonly #importId: string;
	readonly #journal: ImportJournal;
	readonly #projectId: string;
	readonly #sceneId: string;
	readonly #storage: ImportStagingStorage;
	#published = false;

	constructor({
		importId,
		bundleDigest,
		projectId,
		sceneId,
		journal,
		storage = storageService,
	}: {
		importId: string;
		bundleDigest: string;
		projectId: string;
		sceneId: string;
		journal: ImportJournal;
		storage?: ImportStagingStorage;
	}) {
		this.#importId = importId;
		this.#journal = journal;
		this.#projectId = projectId;
		this.#sceneId = sceneId;
		this.#storage = storage;
		this.bundleDigest = bundleDigest;
	}

	readonly bundleDigest: string;

	get projectId(): string {
		return this.#projectId;
	}

	get sceneId(): string {
		return this.#sceneId;
	}

	/** Journals intent; must run before any staging write. */
	async begin(): Promise<void> {
		await this.#journal.begin({
			importId: this.#importId,
			bundleDigest: this.bundleDigest,
			projectId: this.#projectId,
			sceneId: this.#sceneId,
		});
	}

	async stageMediaItem({ mediaItem }: { mediaItem: MediaItem }): Promise<void> {
		await this.#storage.saveMediaItem(this.#projectId, mediaItem);
		await this.#journal.recordMediaItem({
			importId: this.#importId,
			mediaItemId: mediaItem.id,
		});
	}

	async stageTimeline({ tracks }: { tracks: TimelineTrack[] }): Promise<void> {
		// Scene-scoped write plus the legacy main location loadTimeline falls
		// back to — both belong to this (unpublished) project id.
		await this.#storage.saveTimeline({
			projectId: this.#projectId,
			tracks,
			sceneId: this.#sceneId,
		});
		await this.#storage.saveTimeline({ projectId: this.#projectId, tracks });
	}

	/** Re-reads everything staged; refuses to publish on any mismatch. */
	async verifyStaged({
		expectedMediaCount,
	}: {
		expectedMediaCount: number;
	}): Promise<{ ok: boolean; reason?: string }> {
		const info = await this.#storage.getProjectStorageInfo(this.#projectId);
		if (info.mediaItems !== expectedMediaCount) {
			return {
				ok: false,
				reason: `staged media count ${info.mediaItems} != expected ${expectedMediaCount}`,
			};
		}
		const tracks = await this.#storage.loadTimeline({
			projectId: this.#projectId,
			sceneId: this.#sceneId,
		});
		if (tracks === null) {
			return { ok: false, reason: "staged timeline is unreadable" };
		}
		return { ok: true };
	}

	/** The single step that makes the project visible. */
	async publishProject({ project }: { project: TProject }): Promise<void> {
		if (this.#published) {
			throw new Error("Import has already been published.");
		}
		if (project.id !== this.#projectId) {
			throw new Error("Publish project id does not match the staged id.");
		}
		await this.#storage.saveProject({ project });
		this.#published = true;
		await this.#journal.markPublished({ importId: this.#importId });
		const readback = await this.#storage.loadProject({ id: project.id });
		if (readback === null) {
			throw new Error("Published project could not be read back.");
		}
		await this.#journal.complete({ importId: this.#importId });
	}

	/** Deletes everything this import staged and clears the journal. */
	async rollback(): Promise<void> {
		await Promise.all([
			this.#storage.deleteProjectMedia(this.#projectId),
			this.#storage.deleteProjectTimeline({ projectId: this.#projectId }),
			this.#storage.deleteProjectTimeline({
				projectId: this.#projectId,
				sceneId: this.#sceneId,
			}),
		]);
		await this.#storage.deleteProject(this.#projectId);
		await this.#journal.complete({ importId: this.#importId });
	}
}
