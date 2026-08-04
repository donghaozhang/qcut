import { describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { CAPCUT_8_1_PROFILE_ID } from "@qcut/editor-core/jianying-draft";
import { executePersistedQCutSameProfileWriteback } from "../qcut-same-profile-writeback-bridge";

type ExecuteOptions = Parameters<
	typeof executePersistedQCutSameProfileWriteback
>[0];
type RunWriteback = NonNullable<ExecuteOptions["runWriteback"]>;
type RunWritebackRequest = Parameters<RunWriteback>[0];

const createdAt = new Date("2026-08-05T00:00:00.000Z");

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
			profileId: CAPCUT_8_1_PROFILE_ID,
			schemaVersion: 1,
			sourceFileSha256: ["a".repeat(64)],
			writeback: { status: "ready" },
		},
		fps: 30,
		id: "project-1",
		name: "Imported CapCut project",
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

describe("persisted QCut same-profile writeback", () => {
	it("returns a typed block when the persisted project is missing", async () => {
		const runWriteback = vi.fn();
		const result = await executePersistedQCutSameProfileWriteback({
			request: { action: "writeback", projectId: "missing-project" },
			runWriteback,
			storage: createStorage({ project: null }),
		});

		expect(result).toMatchObject({
			operation: "writeback",
			outcome: "blocked",
			projectId: "missing-project",
			reason: "project-not-found",
		});
		expect(runWriteback).not.toHaveBeenCalled();
	});

	it("maps a written result without exposing the selected directory", async () => {
		const storage = createStorage();
		const runWriteback = vi.fn(async (request: RunWritebackRequest) => {
			expect(
				await request.deps?.verifySnapshotCurrent?.({
					project: request.project,
					snapshot: request.snapshot,
				})
			).toBe(true);
			return {
				contentSha256: "c".repeat(64),
				draftDirectory: "/private/selected-draft",
				ok: true as const,
				outcome: "written" as const,
				replacedMirrorCount: 4 as const,
				transactionId: "transaction-1",
				warnings: [],
			};
		});

		const result = await executePersistedQCutSameProfileWriteback({
			request: { action: "writeback", projectId: "project-1" },
			runWriteback,
			storage,
		});

		expect(result).toMatchObject({
			contentSha256: "c".repeat(64),
			operation: "writeback",
			outcome: "written",
			projectId: "project-1",
			replacedMirrorCount: 4,
			transactionId: "transaction-1",
		});
		expect(JSON.stringify(result)).not.toContain("/private/");
		expect(storage.loadProject).toHaveBeenCalledTimes(2);
		expect(storage.loadTimeline).toHaveBeenCalledTimes(2);
	});

	it("detects persisted timeline changes before mapping a client block", async () => {
		const storage = createStorage();
		storage.loadTimeline.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				elements: [],
				id: "new-track",
				name: "Video",
				type: "media",
			},
		]);
		const runWriteback = vi.fn(async (request: RunWritebackRequest) => {
			const current = await request.deps?.verifySnapshotCurrent?.({
				project: request.project,
				snapshot: request.snapshot,
			});
			return current
				? ({ ok: true, outcome: "cancelled" } as const)
				: ({
						ok: false,
						reason: "qcut-state-changed",
						message: "The project changed.",
					} as const);
		});

		await expect(
			executePersistedQCutSameProfileWriteback({
				request: { action: "writeback", projectId: "project-1" },
				runWriteback,
				storage,
			})
		).resolves.toMatchObject({
			operation: "writeback",
			outcome: "blocked",
			reason: "qcut-state-changed",
		});
	});

	it("keeps only the opaque recovery token from writer failures", async () => {
		const runWriteback = vi.fn(async () => ({
			draftDirectory: "/private/selected-draft",
			message: "Recovery is required.",
			ok: false as const,
			reason: "writeback-failed" as const,
			selectionToken: "selection-1",
		}));
		const result = await executePersistedQCutSameProfileWriteback({
			request: { action: "writeback", projectId: "project-1" },
			runWriteback,
			storage: createStorage(),
		});

		expect(result).toMatchObject({
			operation: "writeback",
			outcome: "failed",
			reason: "writeback-failed",
			recoveryToken: "selection-1",
		});
		expect(JSON.stringify(result)).not.toContain("/private/");
	});

	it("maps recovery through the existing renderer writeback client", async () => {
		const recoverWriteback = vi.fn(async () => ({
			ok: true as const,
			value: {
				action: "rolled-back" as const,
				transactionId: "transaction-1",
				warnings: [],
			},
		}));

		await expect(
			executePersistedQCutSameProfileWriteback({
				recoverWriteback,
				request: { action: "recover", recoveryToken: "selection-1" },
			})
		).resolves.toMatchObject({
			operation: "recover",
			outcome: "recovered",
			recoveryAction: "rolled-back",
			transactionId: "transaction-1",
		});
		expect(recoverWriteback).toHaveBeenCalledWith({
			selectionToken: "selection-1",
		});
	});
});
