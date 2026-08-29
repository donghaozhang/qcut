import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	saveProject: vi.fn(),
	saveProjectTimeline: vi.fn(),
}));

const activeProject = {
	currentSceneId: "project-scene",
	id: "project-1",
};
const tracks = [
	{
		elements: [],
		id: "track-1",
		name: "Track",
		type: "media" as const,
	},
];

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveProject: mocks.saveProject,
		saveProjectTimeline: mocks.saveProjectTimeline,
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({ activeProject }),
	},
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({ _tracks: tracks }),
	},
}));

vi.mock("@/stores/timeline/scene-store", () => ({
	useSceneStore: {
		getState: () => ({ currentScene: { id: "stale-scene" } }),
	},
}));

import { useSaveOnVisibilityChange } from "../use-save-on-visibility-change";

describe("visibility save scene authority", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.saveProject.mockResolvedValue(undefined);
		mocks.saveProjectTimeline.mockResolvedValue(undefined);
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
		});
	});

	it("saves to the scene selected by the active project", async () => {
		renderHook(() => useSaveOnVisibilityChange());

		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		await waitFor(() => {
			expect(mocks.saveProjectTimeline).toHaveBeenCalledWith({
				projectId: "project-1",
				sceneId: "project-scene",
				tracks,
			});
		});
	});
});
