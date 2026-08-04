import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { capturePersistedQCutImportEvidence } from "../qcut-import-evidence-bridge";

const BUNDLE_DIGEST = "b".repeat(64);

function createProject(): TProject {
	const createdAt = new Date("2026-08-05T00:00:00.000Z");
	return {
		id: "project-1",
		name: "Imported Project",
		thumbnail: "",
		createdAt,
		updatedAt: createdAt,
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt,
				updatedAt: createdAt,
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "custom",
		fps: 30,
		draftInterop: {
			schemaVersion: 1,
			importId: "plan-token",
			profileId: "capcut-desktop-8.1-plaintext",
			bundleDigest: BUNDLE_DIGEST,
			sourceFileSha256: ["a".repeat(64)],
			internalIdBySemanticId: {},
			writeback: {
				status: "unavailable",
				reason: "envelope-not-captured",
			},
		},
	};
}

function createTracks(): TimelineTrack[] {
	return [
		{
			id: "track-1",
			name: "Video",
			type: "media",
			order: 0,
			isMain: true,
			elements: [],
		},
	];
}

function createStorage({
	tracks = createTracks(),
}: {
	tracks?: TimelineTrack[];
} = {}) {
	return {
		loadProject: vi.fn(async () => createProject()),
		loadTimeline: vi.fn(async () => structuredClone(tracks)),
		loadAllMediaItems: vi.fn(async () => [
			{
				id: "media-1",
				name: "clip.mp4",
				type: "video" as const,
				file: new File(["persisted-media"], "clip.mp4"),
			},
		]),
	};
}

describe("persisted QCut import evidence", () => {
	it("captures two stable storage passes without local paths", async () => {
		const storage = createStorage();
		const snapshot = await capturePersistedQCutImportEvidence({
			appVersion: "2026.08.05.1",
			now: () => new Date("2026-08-05T01:02:03.000Z"),
			request: {
				projectId: "project-1",
				expectedBundleDigest: BUNDLE_DIGEST,
			},
			storage,
		});

		expect(storage.loadProject).toHaveBeenCalledTimes(2);
		expect(storage.loadTimeline).toHaveBeenCalledTimes(2);
		expect(storage.loadAllMediaItems).toHaveBeenCalledTimes(2);
		expect(snapshot).toMatchObject({
			binding: {
				bundleDigest: BUNDLE_DIGEST,
				importId: "plan-token",
				profileId: "capcut-desktop-8.1-plaintext",
			},
			capture: {
				appVersion: "2026.08.05.1",
				capturedAtIso: "2026-08-05T01:02:03.000Z",
				readPasses: 2,
				source: "qcut-renderer-persisted-storage",
			},
			project: {
				id: "project-1",
				sceneId: "scene-1",
				fps: 30,
				width: 1920,
				height: 1080,
			},
			media: [
				{
					id: "media-1",
					byteLength: 15,
					sha256: createHash("sha256").update("persisted-media").digest("hex"),
					type: "video",
				},
			],
		});
		expect(JSON.stringify(snapshot)).not.toContain("/Users/");
	});

	it("rejects a project bound to a different bundle", async () => {
		await expect(
			capturePersistedQCutImportEvidence({
				appVersion: "test",
				request: {
					projectId: "project-1",
					expectedBundleDigest: "c".repeat(64),
				},
				storage: createStorage(),
			})
		).rejects.toThrow("bundle digest");
	});

	it("rejects evidence when persisted state changes between passes", async () => {
		const storage = createStorage();
		storage.loadTimeline
			.mockResolvedValueOnce(createTracks())
			.mockResolvedValueOnce([
				{ ...createTracks()[0], name: "Changed while reading" },
			]);

		await expect(
			capturePersistedQCutImportEvidence({
				appVersion: "test",
				request: {
					projectId: "project-1",
					expectedBundleDigest: BUNDLE_DIGEST,
				},
				storage,
			})
		).rejects.toThrow("changed while evidence was captured");
	});
});
