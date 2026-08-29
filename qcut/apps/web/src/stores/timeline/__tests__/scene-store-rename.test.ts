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
	id = "project-1",
	scenes,
}: {
	currentSceneId?: string;
	id?: string;
	scenes: Scene[];
}): TProject {
	const timestamp = new Date("2026-08-29T00:00:00.000Z");
	return {
		canvasMode: "preset",
		canvasSize: { height: 1080, width: 1920 },
		createdAt: timestamp,
		currentSceneId: currentSceneId ?? scenes[0].id,
		id,
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
			id: "project-1",
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

	it("persists a generated main scene while keeping a valid current scene", async () => {
		const currentScene = createScene({
			id: "current-non-main-scene",
			isMain: false,
		});
		mocks.activeProject = createProject({
			currentSceneId: currentScene.id,
			scenes: [currentScene],
		});

		await useSceneStore.getState().initializeProjectScenes({
			currentSceneId: currentScene.id,
			id: "project-1",
			scenes: [currentScene],
		});

		expect(useSceneStore.getState().currentScene?.id).toBe(currentScene.id);
		expect(mocks.saveProject).toHaveBeenCalledWith({
			project: expect.objectContaining({
				currentSceneId: currentScene.id,
				scenes: [expect.objectContaining({ isMain: true }), currentScene],
			}),
		});
		expect(mocks.activeProject?.scenes).toEqual([
			expect.objectContaining({ isMain: true }),
			currentScene,
		]);
	});

	it("does not persist an already valid scene list and selection", async () => {
		const mainScene = createScene({ id: "main-scene", isMain: true });
		const currentScene = createScene({ id: "current-scene", isMain: false });
		mocks.activeProject = createProject({
			currentSceneId: currentScene.id,
			scenes: [mainScene, currentScene],
		});

		await useSceneStore.getState().initializeProjectScenes({
			currentSceneId: currentScene.id,
			id: "project-1",
			scenes: [mainScene, currentScene],
		});

		expect(useSceneStore.getState().currentScene?.id).toBe(currentScene.id);
		expect(mocks.saveProject).not.toHaveBeenCalled();
	});

	it("rejects scene initialization after the active project switches", async () => {
		const activeScene = createScene({ id: "project-b-scene", isMain: true });
		const staleScene = createScene({ id: "project-a-scene", isMain: false });
		mocks.activeProject = createProject({
			id: "project-b",
			scenes: [activeScene],
		});
		useSceneStore.setState({
			currentScene: activeScene,
			scenes: [activeScene],
		});

		await useSceneStore.getState().initializeProjectScenes({
			currentSceneId: staleScene.id,
			id: "project-a",
			scenes: [staleScene],
		});

		expect(useSceneStore.getState()).toMatchObject({
			currentScene: activeScene,
			scenes: [activeScene],
		});
		expect(mocks.activeProject?.id).toBe("project-b");
		expect(mocks.saveProject).not.toHaveBeenCalled();
	});

	it("does not restore a project that switches while its repair is saving", async () => {
		let finishSave: (() => void) | undefined;
		mocks.saveProject.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishSave = resolve;
				})
		);
		const staleScene = createScene({ id: "project-a-scene", isMain: false });
		mocks.activeProject = createProject({
			currentSceneId: staleScene.id,
			id: "project-a",
			scenes: [staleScene],
		});

		const initialization = useSceneStore.getState().initializeProjectScenes({
			currentSceneId: staleScene.id,
			id: "project-a",
			scenes: [staleScene],
		});
		await vi.waitFor(() => expect(mocks.saveProject).toHaveBeenCalledOnce());

		const activeScene = createScene({ id: "project-b-scene", isMain: true });
		mocks.activeProject = createProject({
			id: "project-b",
			scenes: [activeScene],
		});
		useSceneStore.setState({
			currentScene: activeScene,
			scenes: [activeScene],
		});
		if (!finishSave) throw new Error("Save completion callback missing");
		finishSave();
		await initialization;

		expect(mocks.activeProject?.id).toBe("project-b");
		expect(useSceneStore.getState()).toMatchObject({
			currentScene: activeScene,
			scenes: [activeScene],
		});
	});
});
