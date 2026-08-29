import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import type { StoreGet, StoreSet } from "../timeline-store-operations";

const mocks = vi.hoisted(() => ({
	saveProjectTimeline: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveProjectTimeline: mocks.saveProjectTimeline,
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({
			activeProject: {
				currentSceneId: "project-scene",
				id: "project-1",
			},
		}),
	},
}));

vi.mock("@/stores/timeline/scene-store", () => ({
	useSceneStore: {
		getState: () => ({ currentScene: { id: "stale-scene" } }),
	},
}));

import { createAutoSaveHelpers } from "../timeline-store-autosave";

describe("timeline autosave scene authority", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.saveProjectTimeline.mockResolvedValue(undefined);
	});

	it("saves to the scene selected by the active project", async () => {
		const tracks: TimelineTrack[] = [];
		const get = (() => ({
			_tracks: tracks,
			selectedTransition: null,
		})) as unknown as StoreGet;
		const set = vi.fn() as unknown as StoreSet;
		const helpers = createAutoSaveHelpers(get, set);

		await helpers.autoSaveTimeline();

		expect(mocks.saveProjectTimeline).toHaveBeenCalledWith({
			projectId: "project-1",
			sceneId: "project-scene",
			tracks,
		});
	});
});
