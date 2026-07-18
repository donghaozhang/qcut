import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import { createPersistenceOperations } from "../timeline-store-persistence";
import type { StoreGet, StoreSet } from "../timeline-store-operations";

const storageMocks = vi.hoisted(() => ({
	loadProject: vi.fn(),
	loadTimeline: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: storageMocks,
}));

vi.mock("@/lib/debug/error-handler", () => ({
	handleError: vi.fn(),
	ErrorCategory: { STORAGE: "storage", MEDIA_PROCESSING: "media_processing" },
	ErrorSeverity: { LOW: "low" },
}));

function createProject({ sceneIds }: { sceneIds: string[] }): TProject {
	const timestamp = new Date("2026-07-18T00:00:00.000Z");
	return {
		id: "project-1",
		name: "Project",
		thumbnail: "",
		createdAt: timestamp,
		updatedAt: timestamp,
		scenes: sceneIds.map((id, index) => ({
			id,
			name: `Scene ${index + 1}`,
			isMain: index === 0,
			createdAt: timestamp,
			updatedAt: timestamp,
		})),
		currentSceneId: sceneIds[0] ?? "",
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
	};
}

function createTrack({
	id,
	startTime,
	duration,
	trimStart = 0,
	trimEnd = 0,
}: {
	id: string;
	startTime: number;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
}): TimelineTrack {
	const element: TextElement = {
		id: `${id}-element`,
		name: "Text",
		type: "text",
		content: "Text",
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		startTime,
		duration,
		trimStart,
		trimEnd,
	};
	return {
		id,
		name: id,
		type: "text",
		elements: [element],
	};
}

function createOperations() {
	const get = (() => ({ _tracks: [], redoStack: [] })) as unknown as StoreGet;
	const set = vi.fn() as unknown as StoreSet;
	return createPersistenceOperations(get, set, {
		updateTracks: vi.fn(),
		updateTracksAndSave: vi.fn(),
	});
}

describe("timeline project duration persistence", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("adds the duration of every scene", async () => {
		storageMocks.loadProject.mockResolvedValue(
			createProject({ sceneIds: ["scene-1", "scene-2"] })
		);
		storageMocks.loadTimeline.mockImplementation(
			async ({ sceneId }: { sceneId?: string }) => {
				if (sceneId === "scene-1") {
					return [
						createTrack({
							id: "track-1",
							startTime: 2,
							duration: 6,
							trimStart: 1,
							trimEnd: 1,
						}),
					];
				}
				return [createTrack({ id: "track-2", startTime: 0, duration: 3 })];
			}
		);

		await expect(
			createOperations().getProjectDuration?.("project-1")
		).resolves.toBe(9);
		expect(storageMocks.loadTimeline).toHaveBeenCalledTimes(2);
	});

	it("falls back to the legacy project timeline when scenes are empty", async () => {
		storageMocks.loadProject.mockResolvedValue(
			createProject({ sceneIds: ["scene-1"] })
		);
		storageMocks.loadTimeline.mockImplementation(
			async ({ sceneId }: { sceneId?: string }) =>
				sceneId
					? null
					: [createTrack({ id: "legacy", startTime: 1, duration: 4 })]
		);

		await expect(
			createOperations().getProjectDuration?.("project-1")
		).resolves.toBe(5);
		expect(storageMocks.loadTimeline).toHaveBeenLastCalledWith({
			projectId: "project-1",
		});
	});
});
