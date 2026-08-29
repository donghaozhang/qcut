import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene, TProject } from "@/types/project";

const mocks = vi.hoisted(() => ({
	activeProject: null as TProject | null,
	saveProject: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveProject: mocks.saveProject,
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({ activeProject: mocks.activeProject }),
		setState: ({ activeProject }: { activeProject?: TProject }) => {
			if (activeProject) mocks.activeProject = activeProject;
		},
	},
}));

import { useSceneStore } from "../scene-store";

function createScene({ id, isMain }: { id: string; isMain: boolean }): Scene {
	const timestamp = new Date("2026-08-29T00:00:00.000Z");
	return {
		createdAt: timestamp,
		id,
		isMain,
		name: id,
		updatedAt: timestamp,
	};
}

function createProject({
	currentSceneId,
	scenes,
}: {
	currentSceneId?: string;
	scenes: Scene[];
}): TProject {
	const timestamp = new Date("2026-08-29T00:00:00.000Z");
	return {
		canvasMode: "preset",
		canvasSize: { height: 1080, width: 1920 },
		createdAt: timestamp,
		currentSceneId: currentSceneId ?? scenes[0].id,
		id: "project-1",
		name: "Project",
		scenes,
		thumbnail: "",
		updatedAt: timestamp,
	};
}

describe("scene store project synchronization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const currentScene = createScene({ id: "current-scene", isMain: true });
		const otherScene = createScene({ id: "other-scene", isMain: false });
		mocks.activeProject = createProject({ scenes: [currentScene, otherScene] });
		useSceneStore.setState({
			currentScene,
			scenes: [currentScene, otherScene],
		});
		mocks.saveProject.mockResolvedValue(undefined);
	});

	it("keeps the active scene selected when a different scene is renamed", async () => {
		await useSceneStore.getState().renameScene({
			name: "Renamed other scene",
			sceneId: "other-scene",
		});

		expect(useSceneStore.getState().currentScene?.id).toBe("current-scene");
		expect(
			useSceneStore
				.getState()
				.scenes.find((scene) => scene.id === "other-scene")?.name
		).toBe("Renamed other scene");
		expect(mocks.activeProject?.currentSceneId).toBe("current-scene");
	});

	it("synchronizes an invalid stored scene ID to the main scene", async () => {
		const mainScene = createScene({ id: "main-scene", isMain: true });
		const otherScene = createScene({ id: "other-scene", isMain: false });
		mocks.activeProject = createProject({
			currentSceneId: "missing-scene",
			scenes: [mainScene, otherScene],
		});

		await useSceneStore.getState().initializeProjectScenes({
			currentSceneId: "missing-scene",
			scenes: [mainScene, otherScene],
		});

		expect(useSceneStore.getState().currentScene?.id).toBe("main-scene");
		expect(mocks.activeProject?.currentSceneId).toBe("main-scene");
		expect(mocks.saveProject).toHaveBeenCalledWith({
			project: expect.objectContaining({
				currentSceneId: "main-scene",
				scenes: [mainScene, otherScene],
			}),
		});
	});
});
