import { describe, it, expect } from "vitest";
import type { PersistedTranscription } from "../types/transcription.js";
import type { EditorStorageProvider } from "../storage/interface.js";

/** In-memory mock implementing the optional transcription methods. */
function createMockStorage(): Required<
	Pick<
		EditorStorageProvider,
		"saveTranscription" | "loadTranscription" | "listTranscriptions"
	>
> &
	EditorStorageProvider {
	const store = new Map<string, Map<string, PersistedTranscription>>();

	return {
		// Base required methods (stubs)
		loadTimeline: async () => null,
		saveTimeline: async () => {},
		findProjectThumbnail: async () => null,

		// Transcription methods
		async saveTranscription({ projectId, transcription }) {
			if (!store.has(projectId)) store.set(projectId, new Map());
			store.get(projectId)!.set(transcription.mediaId, transcription);
		},
		async loadTranscription({ projectId, mediaId }) {
			return store.get(projectId)?.get(mediaId) ?? null;
		},
		async listTranscriptions({ projectId }) {
			const project = store.get(projectId);
			return project ? [...project.values()] : [];
		},
	};
}

function makeTranscription(
	overrides: Partial<PersistedTranscription> = {}
): PersistedTranscription {
	return {
		version: 1,
		mediaId: "media-1",
		mediaName: "video.mp4",
		language: "en",
		duration: 60,
		provider: "elevenlabs",
		createdAt: Date.now(),
		text: "Hello world",
		words: [
			{ text: "Hello", start: 0.5, end: 0.8, type: "word" },
			{ text: " ", start: 0.8, end: 0.85, type: "spacing" },
			{ text: "world", start: 0.85, end: 1.2, type: "word" },
		],
		segments: [{ text: "Hello world", start: 0.5, end: 1.2 }],
		...overrides,
	};
}

describe("transcription storage interface", () => {
	it("save and load round-trip", async () => {
		const storage = createMockStorage();
		const transcription = makeTranscription();

		await storage.saveTranscription({
			projectId: "proj-1",
			transcription,
		});
		const loaded = await storage.loadTranscription({
			projectId: "proj-1",
			mediaId: "media-1",
		});

		expect(loaded).toEqual(transcription);
	});

	it("returns null for missing transcription", async () => {
		const storage = createMockStorage();

		const result = await storage.loadTranscription({
			projectId: "proj-1",
			mediaId: "nonexistent",
		});
		expect(result).toBeNull();
	});

	it("lists all transcriptions for a project", async () => {
		const storage = createMockStorage();
		const t1 = makeTranscription({ mediaId: "m1", mediaName: "a.mp4" });
		const t2 = makeTranscription({ mediaId: "m2", mediaName: "b.mp4" });

		await storage.saveTranscription({ projectId: "proj-1", transcription: t1 });
		await storage.saveTranscription({ projectId: "proj-1", transcription: t2 });

		const all = await storage.listTranscriptions({ projectId: "proj-1" });
		expect(all).toHaveLength(2);
		expect(all.map((t) => t.mediaId).sort()).toEqual(["m1", "m2"]);
	});

	it("returns empty list for project with no transcriptions", async () => {
		const storage = createMockStorage();
		const all = await storage.listTranscriptions({ projectId: "empty" });
		expect(all).toEqual([]);
	});

	it("save is idempotent — overwrites existing", async () => {
		const storage = createMockStorage();
		const original = makeTranscription({ text: "original" });
		const updated = makeTranscription({ text: "updated" });

		await storage.saveTranscription({
			projectId: "p1",
			transcription: original,
		});
		await storage.saveTranscription({
			projectId: "p1",
			transcription: updated,
		});

		const loaded = await storage.loadTranscription({
			projectId: "p1",
			mediaId: "media-1",
		});
		expect(loaded!.text).toBe("updated");

		const all = await storage.listTranscriptions({ projectId: "p1" });
		expect(all).toHaveLength(1);
	});

	it("PersistedTranscription has correct version field", () => {
		const t = makeTranscription();
		expect(t.version).toBe(1);
	});
});
