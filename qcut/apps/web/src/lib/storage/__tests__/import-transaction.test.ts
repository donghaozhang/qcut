import { createHash, webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	canonicalizeQCutImportBundleForDigest,
	deriveImportInternalId,
	type QCutImportBundleV1,
} from "@qcut/editor-core/draft-interop";
import {
	runQCutImportTransaction,
	type ImportEnvelopeStore,
	type ImportTransactionStorage,
} from "@/lib/jianying-draft/qcut-import-transaction";
import { ImportJournal, type ImportJournalRecordV1 } from "../import-journal";
import { recoverPendingImports } from "../import-recovery";
import { ImportStagingSession } from "../import-staging-adapter";
import type { StorageAdapter } from "../types";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";

/**
 * JYI-010 acceptance: staging, re-read verification, single publish,
 * rollback, and reload recovery.
 */

beforeAll(() => {
	if (globalThis.crypto?.subtle === undefined) {
		Object.defineProperty(globalThis, "crypto", { value: webcrypto });
	}
});

function createMapAdapter<T>(): StorageAdapter<T> & { map: Map<string, T> } {
	const map = new Map<string, T>();
	return {
		map,
		get: async (key) => map.get(key) ?? null,
		set: async (key, value) => {
			map.set(key, value);
		},
		remove: async (key) => {
			map.delete(key);
		},
		list: async () => [...map.keys()],
		clear: async () => {
			map.clear();
		},
	};
}

interface FakeStorage extends ImportTransactionStorage {
	projects: Map<string, TProject>;
	media: Map<string, Map<string, unknown>>;
	timelines: Map<string, TimelineTrack[]>;
	calls: string[];
	failOn?: string;
}

function createFakeStorage(): FakeStorage {
	const storage: FakeStorage = {
		projects: new Map(),
		media: new Map(),
		timelines: new Map(),
		calls: [],
		checkStorageQuota: async () => ({ available: true }),
		saveMediaItem: async (projectId, item) => {
			storage.calls.push(`saveMediaItem:${item.id}`);
			if (storage.failOn === "saveMediaItem") {
				throw new Error("disk full");
			}
			const bucket = storage.media.get(projectId) ?? new Map();
			bucket.set(item.id, item);
			storage.media.set(projectId, bucket);
		},
		saveTimeline: async ({ projectId, tracks, sceneId }) => {
			storage.calls.push(`saveTimeline:${sceneId ?? "main"}`);
			storage.timelines.set(`${projectId}:${sceneId ?? "main"}`, tracks);
		},
		loadTimeline: async ({ projectId, sceneId }) =>
			storage.timelines.get(`${projectId}:${sceneId ?? "main"}`) ?? null,
		saveProject: async ({ project }) => {
			storage.calls.push(`saveProject:${project.id}`);
			if (storage.failOn === "saveProject") {
				throw new Error("write denied");
			}
			storage.projects.set(project.id, project);
		},
		loadProject: async ({ id }) => storage.projects.get(id) ?? null,
		getProjectStorageInfo: async (projectId) => ({
			mediaItems: storage.media.get(projectId)?.size ?? 0,
			hasTimeline: [...storage.timelines.keys()].some((key) =>
				key.startsWith(`${projectId}:`)
			),
		}),
		deleteProjectMedia: async (projectId) => {
			storage.calls.push("deleteProjectMedia");
			storage.media.delete(projectId);
		},
		deleteProjectTimeline: async ({ projectId, sceneId }) => {
			storage.calls.push("deleteProjectTimeline");
			storage.timelines.delete(`${projectId}:${sceneId ?? "main"}`);
		},
		deleteProject: async (id) => {
			storage.calls.push("deleteProject");
			storage.projects.delete(id);
		},
	};
	return storage;
}

const SEED = "f".repeat(64);
const TRACK_ID = "track-a";
const ELEMENT_ID = "seg-1";
const RESOURCE_ID = "mat-1";

function createBundle(): QCutImportBundleV1 {
	const internalIdBySemanticId: Record<string, string> = {};
	for (const semanticId of [TRACK_ID, ELEMENT_ID, RESOURCE_ID]) {
		internalIdBySemanticId[semanticId] = deriveImportInternalId({
			seed: SEED,
			semanticId,
		});
	}
	const unsigned: QCutImportBundleV1 = {
		schemaVersion: 1,
		bundleDigest: "0".repeat(64),
		planToken: "import-token-1",
		buildIdentity: { appVersion: "2026.08.04.1", interopSchemaVersion: 1 },
		createdAtUnixMilliseconds: 1_000_000,
		conflictPolicy: { projectName: "rename" },
		document: {
			schemaVersion: 1,
			timeUnit: "microseconds",
			source: {
				product: "jianying",
				profileId: "jianying-synthetic-plaintext-5.9",
				platform: "macos",
				files: [
					{
						relativePath: "draft_info.json",
						byteLength: 4096,
						sha256: "a".repeat(64),
						role: "content",
						classification: "plaintext-json",
					},
				],
			},
			project: {
				id: "draft-1",
				name: "Imported Draft",
				width: 1920,
				height: 1080,
				fps: 30,
			},
			timelines: [
				{
					id: "draft-1",
					isRoot: true,
					tracks: [
						{
							id: TRACK_ID,
							kind: "video",
							order: 0,
							isMain: true,
							segments: [
								{
									id: ELEMENT_ID,
									kind: "video",
									resourceId: RESOURCE_ID,
									targetRange: { startUs: 0, durationUs: 4_000_000 },
									capability: "exact",
								},
							],
							capability: "exact",
						},
					],
				},
			],
			resources: [
				{
					id: RESOURCE_ID,
					kind: "video",
					name: "clip.mp4",
					status: "resolved",
					capability: "exact",
				},
			],
			links: [],
			issues: [],
		},
		timelinePlan: {
			schemaVersion: 1,
			project: { name: "Imported Draft", width: 1920, height: 1080, fps: 30 },
			tracks: [
				{
					id: TRACK_ID,
					type: "media",
					name: "Video",
					order: 0,
					isMain: true,
					elements: [
						{
							id: ELEMENT_ID,
							type: "media",
							name: "clip.mp4",
							startTime: 0,
							duration: 5,
							trimStart: 0.5,
							trimEnd: 0.5,
							resourceId: RESOURCE_ID,
							sourceSegmentId: ELEMENT_ID,
						},
					],
					sourceTrackId: TRACK_ID,
				},
			],
			resourceIds: [RESOURCE_ID],
			skipped: [],
		},
		resourceStaging: [
			{
				resourceId: RESOURCE_ID,
				stagingKey: "import-token-1-media",
				kind: "video",
				status: "resolved",
			},
		],
		internalIdBySemanticId,
	};
	const digest = createHash("sha256")
		.update(canonicalizeQCutImportBundleForDigest({ bundle: unsigned }))
		.digest("hex");
	return { ...unsigned, bundleDigest: digest };
}

function createPayload() {
	return {
		resourceId: RESOURCE_ID,
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		bytes: new Uint8Array([1, 2, 3]),
	};
}

function createEnvelopeCapture() {
	const payload = new TextEncoder().encode("private foreign draft payload");
	return {
		envelope: {
			schemaVersion: 1 as const,
			importId: "import-token-1",
			profileId: "jianying-synthetic-plaintext-5.9",
			entries: [
				{
					relativePath: "draft_info.json",
					sha256: "a".repeat(64),
					byteLength: 4096,
					allowlistEntryId: "fixture-content",
					storage: "raw" as const,
				},
			],
			bindings: [],
			unknownSubtrees: [],
			dirtyDomains: [],
			acceptedDowngradeFingerprints: [],
		},
		payload,
		payloadSha256: createHash("sha256").update(payload).digest("hex"),
	};
}

function createEnvelopeStore({
	failStore = false,
}: {
	failStore?: boolean;
} = {}): ImportEnvelopeStore & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		store: async ({ importId, payload }) => {
			calls.push(`store:${importId}`);
			if (failStore) {
				return {
					ok: false,
					code: "keychain-unavailable",
					message: "keychain unavailable",
				};
			}
			return {
				ok: true,
				value: {
					location: `envelopes/${importId}.bin`,
					keyVersion: 1,
					sha256: createHash("sha256").update(payload).digest("hex"),
				},
			};
		},
		delete: async ({ importId }) => {
			calls.push(`delete:${importId}`);
		},
	};
}

let journalAdapter: ReturnType<typeof createMapAdapter<ImportJournalRecordV1>>;
let journal: ImportJournal;
let storage: FakeStorage;

beforeEach(() => {
	journalAdapter = createMapAdapter<ImportJournalRecordV1>();
	journal = new ImportJournal({ adapter: journalAdapter });
	storage = createFakeStorage();
});

describe("runQCutImportTransaction", () => {
	it("stages, verifies, publishes last, and clears the journal", async () => {
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal, now: () => new Date(1_000_000) },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Publish is the LAST write.
		const saveProjectIndex = storage.calls.findIndex((call) =>
			call.startsWith("saveProject")
		);
		expect(saveProjectIndex).toBe(storage.calls.length - 1);

		const project = storage.projects.get(result.projectId);
		expect(project?.name).toBe("Imported Draft");
		expect(project?.canvasSize).toEqual({ width: 1920, height: 1080 });
		expect(project?.scenes[0]?.isMain).toBe(true);
		expect(project?.draftInterop).toEqual({
			schemaVersion: 1,
			importId: "import-token-1",
			profileId: "jianying-synthetic-plaintext-5.9",
			bundleDigest: createBundle().bundleDigest,
			sourceFileSha256: ["a".repeat(64)],
			writeback: {
				status: "unavailable",
				reason: "envelope-not-captured",
			},
		});

		const tracks = storage.timelines.get(
			`${result.projectId}:${project?.currentSceneId}`
		);
		expect(tracks).toHaveLength(1);
		expect(tracks?.[0].elements[0]).toMatchObject({
			type: "media",
			trimStart: 0.5,
			trimEnd: 0.5,
		});
		// Media element points at the staged media item.
		const mediaBucket = storage.media.get(result.projectId);
		const element = tracks?.[0].elements[0];
		expect(
			element && "mediaId" in element && mediaBucket?.has(element.mediaId)
		).toBe(true);
		// Journal is empty after a verified publish.
		expect(journalAdapter.map.size).toBe(0);
	});

	it("is deterministic: same bundle → same project id", async () => {
		const first = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		// Seeded by the source content hashes, not the bundle digest.
		expect(first.projectId).toBe(
			deriveImportInternalId({
				seed: "a".repeat(64),
				semanticId: "qcut-project",
			})
		);
	});

	it("rejects a tampered bundle by digest, before any write", async () => {
		const tampered = JSON.parse(JSON.stringify(createBundle()));
		tampered.timelinePlan.project.name = "evil";
		const result = await runQCutImportTransaction({
			bundleValue: tampered,
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(result).toMatchObject({ ok: false, reason: "digest-mismatch" });
		expect(storage.calls).toEqual([]);
		expect(journalAdapter.map.size).toBe(0);
	});

	it("fails without writes when a resolved payload is missing", async () => {
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [],
			deps: { storage, journal },
		});
		expect(result).toMatchObject({ ok: false, reason: "payload-missing" });
		expect(storage.calls).toEqual([]);
	});

	it("stores the envelope before publish and persists only its encrypted reference", async () => {
		const envelopeStore = createEnvelopeStore();
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			envelopeCapture: createEnvelopeCapture(),
			deps: { storage, journal, envelopeStore },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(envelopeStore.calls).toEqual(["store:import-token-1"]);
		expect(storage.projects.get(result.projectId)?.draftInterop).toMatchObject({
			writeback: {
				status: "unavailable",
				reason: "profile-not-writable",
			},
			envelope: {
				payloadRef: {
					cipher: "os-keychain-wrapped",
					location: "envelopes/import-token-1.bin",
					keyVersion: 1,
				},
			},
		});
	});

	it("rejects a mismatched envelope before any write", async () => {
		const envelopeCapture = createEnvelopeCapture();
		envelopeCapture.envelope.profileId = "wrong-profile";
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			envelopeCapture,
			deps: { storage, journal },
		});

		expect(result).toMatchObject({ ok: false, reason: "envelope-invalid" });
		expect(storage.calls).toEqual([]);
	});

	it("rolls back staged data when envelope encryption fails", async () => {
		const envelopeStore = createEnvelopeStore({ failStore: true });
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			envelopeCapture: createEnvelopeCapture(),
			deps: { storage, journal, envelopeStore },
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "envelope-store-failed",
		});
		expect(storage.projects.size).toBe(0);
		expect(storage.media.size).toBe(0);
		expect(journalAdapter.map.size).toBe(0);
	});

	it("rolls back everything when staging fails midway", async () => {
		storage.failOn = "saveMediaItem";
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(result).toMatchObject({ ok: false, reason: "staging-failed" });
		expect(storage.calls).toContain("deleteProjectMedia");
		expect(storage.calls).toContain("deleteProject");
		expect(storage.projects.size).toBe(0);
		expect(journalAdapter.map.size).toBe(0);
	});

	it("rolls back when publish fails", async () => {
		storage.failOn = "saveProject";
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(result).toMatchObject({ ok: false, reason: "publish-failed" });
		expect(storage.projects.size).toBe(0);
		expect(storage.media.size).toBe(0);
		expect(journalAdapter.map.size).toBe(0);
	});

	it("deletes an encrypted envelope when project publish fails", async () => {
		storage.failOn = "saveProject";
		const envelopeStore = createEnvelopeStore();
		const result = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			envelopeCapture: createEnvelopeCapture(),
			deps: { storage, journal, envelopeStore },
		});

		expect(result).toMatchObject({ ok: false, reason: "publish-failed" });
		expect(envelopeStore.calls).toEqual([
			"store:import-token-1",
			"delete:import-token-1",
		]);
		expect(storage.projects.size).toBe(0);
	});

	it("applies the conflict policy on re-import", async () => {
		const okFirst = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(okFirst.ok).toBe(true);

		// rename policy: second import gets a fresh id and suffixed name.
		const renamed = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(renamed.ok).toBe(true);
		if (renamed.ok && okFirst.ok) {
			expect(renamed.projectId).not.toBe(okFirst.projectId);
			expect(storage.projects.get(renamed.projectId)?.name).toBe(
				"Imported Draft (imported)"
			);
		}

		// fail policy: refuse outright.
		const failing = JSON.parse(JSON.stringify(createBundle()));
		failing.conflictPolicy.projectName = "fail";
		const digest = createHash("sha256")
			.update(
				canonicalizeQCutImportBundleForDigest({
					bundle: { ...failing, bundleDigest: "0".repeat(64) },
				})
			)
			.digest("hex");
		failing.bundleDigest = digest;
		const refused = await runQCutImportTransaction({
			bundleValue: failing,
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(refused).toMatchObject({ ok: false, reason: "project-conflict" });
	});

	it("reuses a published deterministic project for offline delivery retries", async () => {
		const first = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			deps: { storage, journal },
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		storage.calls.length = 0;
		const retry = await runQCutImportTransaction({
			bundleValue: JSON.parse(JSON.stringify(createBundle())),
			mediaPayloads: [createPayload()],
			reuseExistingProject: true,
			deps: { storage, journal },
		});
		expect(retry).toEqual({ ok: true, projectId: first.projectId });
		expect(storage.calls).toEqual([]);
		expect(storage.projects.size).toBe(1);
		expect(journalAdapter.map.size).toBe(0);
	});
});

describe("ImportStagingSession", () => {
	it("publishes exactly once", async () => {
		const session = new ImportStagingSession({
			importId: "once",
			bundleDigest: "d".repeat(64),
			projectId: "p1",
			sceneId: "s1",
			journal,
			storage,
		});
		await session.begin();
		await session.stageTimeline({ tracks: [] });
		const project = {
			id: "p1",
			name: "P",
			thumbnail: "",
			createdAt: new Date(0),
			updatedAt: new Date(0),
			scenes: [
				{
					id: "s1",
					name: "Main Scene",
					isMain: true,
					createdAt: new Date(0),
					updatedAt: new Date(0),
				},
			],
			currentSceneId: "s1",
			canvasSize: { width: 1920, height: 1080 },
			canvasMode: "custom",
		} as TProject;
		await session.publishProject({ project });
		await expect(session.publishProject({ project })).rejects.toThrow(
			/already been published/
		);
	});

	it("refuses to publish a mismatching project id", async () => {
		const session = new ImportStagingSession({
			importId: "mismatch",
			bundleDigest: "d".repeat(64),
			projectId: "p1",
			sceneId: "s1",
			journal,
			storage,
		});
		await session.begin();
		await expect(
			session.publishProject({
				project: { id: "other" } as TProject,
			})
		).rejects.toThrow(/does not match/);
	});
});

describe("recoverPendingImports", () => {
	it("rolls back staging records and finishes published ones", async () => {
		// Interrupted import: journal says staging, data partially present.
		await journal.begin({
			importId: "crashed",
			bundleDigest: "a".repeat(64),
			projectId: "p-crashed",
			sceneId: "s-crashed",
		});
		storage.media.set("p-crashed", new Map([["m1", {}]]));
		storage.timelines.set("p-crashed:s-crashed", []);

		// Finished import whose journal cleanup never ran.
		await journal.begin({
			importId: "finished",
			bundleDigest: "b".repeat(64),
			projectId: "p-finished",
			sceneId: "s-finished",
		});
		await journal.markPublished({ importId: "finished" });
		storage.projects.set("p-finished", { id: "p-finished" } as TProject);

		const result = await recoverPendingImports({ journal, storage });
		expect(result.rolledBackImportIds).toEqual(["crashed"]);
		expect(result.completedImportIds).toEqual(["finished"]);
		expect(storage.media.has("p-crashed")).toBe(false);
		expect(storage.projects.has("p-finished")).toBe(true);
		expect(journalAdapter.map.size).toBe(0);
	});

	it("cleans up a published record whose project vanished", async () => {
		await journal.begin({
			importId: "ghost",
			bundleDigest: "c".repeat(64),
			projectId: "p-ghost",
			sceneId: "s-ghost",
		});
		await journal.markPublished({ importId: "ghost" });
		const result = await recoverPendingImports({ journal, storage });
		expect(result.rolledBackImportIds).toEqual(["ghost"]);
		expect(journalAdapter.map.size).toBe(0);
	});

	it("keeps records it cannot recover for the next startup", async () => {
		await journal.begin({
			importId: "sticky",
			bundleDigest: "e".repeat(64),
			projectId: "p-sticky",
			sceneId: "s-sticky",
		});
		const failingStorage = {
			...storage,
			deleteProjectMedia: vi.fn().mockRejectedValue(new Error("locked")),
		};
		const result = await recoverPendingImports({
			journal,
			storage: failingStorage,
		});
		expect(result.rolledBackImportIds).toEqual([]);
		expect(journalAdapter.map.size).toBe(1);
	});
});
