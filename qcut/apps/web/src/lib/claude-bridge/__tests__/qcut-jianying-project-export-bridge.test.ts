import { describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { JIANYING_11_3_BETA2_PROFILE_ID } from "@qcut/editor-core/jianying-draft";
import { executePersistedQCutJianyingProjectExport } from "../qcut-jianying-project-export-bridge";

type ExecuteOptions = Parameters<
	typeof executePersistedQCutJianyingProjectExport
>[0];
type RunExport = NonNullable<ExecuteOptions["runExport"]>;
type RunExportRequest = Parameters<RunExport>[0];

const createdAt = new Date("2026-08-13T00:00:00.000Z");

function createProject(): TProject {
	type DraftInteropBinding = NonNullable<TProject["draftInterop"]>;
	return {
		canvasMode: "preset",
		canvasSize: { height: 1080, width: 1920 },
		createdAt,
		currentSceneId: "scene-1",
		draftInterop: {
			baselineDocument: {} as NonNullable<
				DraftInteropBinding["baselineDocument"]
			>,
			bundleDigest: "b".repeat(64),
			envelope: {} as NonNullable<DraftInteropBinding["envelope"]>,
			importId: "import-1",
			internalIdBySemanticId: {},
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
			schemaVersion: 1,
			sourceFileSha256: ["a".repeat(64)],
			writeback: { reason: "profile-not-writable", status: "unavailable" },
		},
		fps: 30,
		id: "project-1",
		name: "Imported Jianying project",
		scenes: [
			{
				createdAt,
				id: "scene-1",
				isMain: true,
				name: "Main",
				updatedAt: createdAt,
			},
		],
		thumbnail: "",
		updatedAt: createdAt,
	};
}

function createStorage({
	project = createProject(),
	tracks = [],
}: {
	project?: TProject | null;
	tracks?: TimelineTrack[] | null;
} = {}) {
	return {
		loadProject: vi.fn(async () => project),
		loadTimeline: vi.fn(async () => tracks),
	};
}

describe("persisted QCut Jianying project export", () => {
	it("returns a typed block when the persisted project is missing", async () => {
		const runExport = vi.fn();
		const result = await executePersistedQCutJianyingProjectExport({
			request: { projectId: "missing-project" },
			runExport,
			storage: createStorage({ project: null }),
		});

		expect(result).toMatchObject({
			outcome: "blocked",
			projectId: "missing-project",
			reason: "project-not-found",
		});
		expect(runExport).not.toHaveBeenCalled();
	});

	it("maps a registered-project writeback and rechecks the snapshot", async () => {
		const storage = createStorage();
		const runExport = vi.fn(async (request: RunExportRequest) => {
			expect(
				await request.deps?.verifySnapshotCurrent?.({
					project: request.project,
					snapshot: request.snapshot,
				})
			).toBe(true);
			return {
				changed: true,
				contentRelativePath: "subdraft/subdraft-1/draft_content.json",
				contentSha256: "c".repeat(64),
				ok: true as const,
				outcome: "exported" as const,
				patchCount: 4,
				projectDirectory: "/jianying/registered-project",
				subdraftId: "subdraft-1",
				transactionId: "transaction-1",
				warnings: [],
			};
		});

		const result = await executePersistedQCutJianyingProjectExport({
			request: { projectId: "project-1" },
			runExport,
			storage,
		});

		expect(result).toMatchObject({
			changed: true,
			contentSha256: "c".repeat(64),
			outcome: "exported",
			patchCount: 4,
			projectDirectory: "/jianying/registered-project",
			projectId: "project-1",
			transactionId: "transaction-1",
		});
		expect(storage.loadProject).toHaveBeenCalledTimes(2);
		expect(storage.loadTimeline).toHaveBeenCalledTimes(2);
	});

	it("detects persisted timeline changes before export commit", async () => {
		const storage = createStorage();
		storage.loadTimeline.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				elements: [],
				id: "new-track",
				name: "Video",
				order: 0,
				type: "media",
			},
		]);
		const runExport = vi.fn(async (request: RunExportRequest) => {
			const current = await request.deps?.verifySnapshotCurrent?.({
				project: request.project,
				snapshot: request.snapshot,
			});
			return current
				? ({ ok: true, outcome: "cancelled" } as const)
				: ({
						message: "The project changed.",
						ok: false,
						reason: "qcut-state-changed",
					} as const);
		});

		await expect(
			executePersistedQCutJianyingProjectExport({
				request: { projectId: "project-1" },
				runExport,
				storage,
			})
		).resolves.toMatchObject({
			outcome: "blocked",
			reason: "qcut-state-changed",
		});
	});

	it("maps writer failures with the selected registered project", async () => {
		const result = await executePersistedQCutJianyingProjectExport({
			request: { projectId: "project-1" },
			runExport: vi.fn(async () => ({
				message: "Jianying is running.",
				ok: false as const,
				projectDirectory: "/jianying/registered-project",
				reason: "export-failed" as const,
			})),
			storage: createStorage(),
		});

		expect(result).toMatchObject({
			outcome: "failed",
			projectDirectory: "/jianying/registered-project",
			projectId: "project-1",
			reason: "export-failed",
		});
	});
});
