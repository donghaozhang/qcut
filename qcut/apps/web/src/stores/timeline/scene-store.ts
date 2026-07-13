/**
 * Scene Store
 *
 * Manages scenes within a project. Scenes allow organizing timeline content
 * into logical sections that can be switched and edited independently.
 *
 * @module stores/scene-store
 */

import { create } from "zustand";
import { Scene } from "@/types/project";
import { storageService } from "@/lib/storage/storage-service";
import { generateUUID } from "@/lib/utils";
import type { SerializedScene } from "@/lib/storage/types";

/**
 * Dynamically imports project store to avoid circular dependencies.
 * @returns The project store hook
 */
const getProjectStore = async () => {
	const { useProjectStore } = await import("../project-store");
	return useProjectStore;
};

/**
 * Dynamically imports timeline store to avoid circular dependencies.
 * @returns The timeline store hook
 */
const getTimelineStore = async () => {
	const { useTimelineStore } = await import("./timeline-store");
	return useTimelineStore;
};

/**
 * Gets the main scene from a list of scenes.
 * @param scenes - Array of scenes to search
 * @returns The main scene or null if not found
 */
export function getMainScene({ scenes }: { scenes: Scene[] }): Scene | null {
	return scenes.find((scene) => scene.isMain) || null;
}

/**
 * Ensures at least one main scene exists in the scenes array.
 * Creates a default main scene if none exists.
 * @param scenes - Array of scenes to check
 * @returns Updated scenes array with a guaranteed main scene
 */
function ensureMainScene(scenes: Scene[]): Scene[] {
	const hasMain = scenes.some((scene) => scene.isMain);
	if (!hasMain) {
		const mainScene: Scene = {
			id: generateUUID(),
			name: "主场景",
			isMain: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		return [mainScene, ...scenes];
	}
	return scenes;
}

interface SceneStore {
	// Current scene state
	currentScene: Scene | null;
	scenes: Scene[];

	// Scene management
	createScene: ({
		name,
		isMain,
	}: {
		name: string;
		isMain: boolean;
	}) => Promise<string>;
	deleteScene: ({ sceneId }: { sceneId: string }) => Promise<void>;
	renameScene: ({
		sceneId,
		name,
	}: {
		sceneId: string;
		name: string;
	}) => Promise<void>;
	switchToScene: ({ sceneId }: { sceneId: string }) => Promise<void>;

	// Scene utilities
	getMainScene: () => Scene | null;
	getCurrentScene: () => Scene | null;

	// Project integration
	loadProjectScenes: ({ projectId }: { projectId: string }) => Promise<void>;
	initializeScenes: ({
		scenes,
		currentSceneId,
	}: {
		scenes: Scene[];
		currentSceneId?: string;
	}) => Promise<void>;
	clearScenes: () => void;
	initializeProjectScenes: (project: {
		scenes: Scene[];
		currentSceneId: string;
	}) => Promise<void>;
}

export const useSceneStore = create<SceneStore>((set, get) => ({
	currentScene: null,
	scenes: [],

	createScene: async ({ name, isMain = false }) => {
		const { scenes } = get();

		const newScene = {
			id: generateUUID(),
			name,
			isMain,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const updatedScenes = [...scenes, newScene];

		const useProjectStore = await getProjectStore();
		const projectStore = useProjectStore.getState();
		const { activeProject } = projectStore;

		if (!activeProject) {
			throw new Error("No active project");
		}

		const updatedProject = {
			...activeProject,
			scenes: updatedScenes,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			useProjectStore.setState({ activeProject: updatedProject });
			set({ scenes: updatedScenes });
			return newScene.id;
		} catch (error) {
			console.error("Failed to create scene:", error);
			throw error;
		}
	},

	deleteScene: async ({ sceneId }: { sceneId: string }) => {
		const { scenes, currentScene } = get();
		const sceneToDelete = scenes.find((s) => s.id === sceneId);

		if (!sceneToDelete) {
			throw new Error("Scene not found");
		}

		if (sceneToDelete.isMain) {
			throw new Error("Cannot delete main scene");
		}

		const updatedScenes = scenes.filter((s) => s.id !== sceneId);

		// Determine new current scene if we're deleting the current one
		let newCurrentScene = currentScene;
		if (currentScene?.id === sceneId) {
			newCurrentScene = getMainScene({ scenes: updatedScenes });
		}

		// Update project
		const useProjectStore = await getProjectStore();
		const projectStore = useProjectStore.getState();
		const { activeProject } = projectStore;

		if (!activeProject) {
			throw new Error("No active project");
		}

		const updatedProject = {
			...activeProject,
			scenes: updatedScenes,
			currentSceneId: newCurrentScene?.id ?? activeProject.currentSceneId,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			// TODO: Add scene-specific timeline cleanup when storageService supports it
			// Note: Scene timeline data will remain in storage but won't affect functionality

			useProjectStore.setState({ activeProject: updatedProject });
			set({
				scenes: updatedScenes,
				currentScene: newCurrentScene,
			});

			// If we switched scenes, load the new scene's timeline
			if (newCurrentScene && newCurrentScene.id !== currentScene?.id) {
				const useTimelineStore = await getTimelineStore();
				const timelineStore = useTimelineStore.getState();
				await timelineStore.loadProjectTimeline({
					projectId: activeProject.id,
					sceneId: newCurrentScene.id,
				});
			}
		} catch (error) {
			console.error("Failed to delete scene:", error);
			throw error;
		}
	},

	renameScene: async ({ sceneId, name }: { sceneId: string; name: string }) => {
		const { scenes } = get();
		const updatedScenes = scenes.map((scene) =>
			scene.id === sceneId ? { ...scene, name, updatedAt: new Date() } : scene
		);

		// Update project
		const useProjectStore = await getProjectStore();
		const projectStore = useProjectStore.getState();
		const { activeProject } = projectStore;

		if (!activeProject) {
			throw new Error("No active project");
		}

		const updatedProject = {
			...activeProject,
			scenes: updatedScenes,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			useProjectStore.setState({ activeProject: updatedProject });
			set({
				scenes: updatedScenes,
				currentScene: updatedScenes.find((s) => s.id === sceneId) || null,
			});
		} catch (error) {
			console.error("Failed to rename scene:", error);
			throw error;
		}
	},

	switchToScene: async ({ sceneId }: { sceneId: string }) => {
		const { scenes } = get();
		const targetScene = scenes.find((s) => s.id === sceneId);

		if (!targetScene) {
			throw new Error("Scene not found");
		}

		const useTimelineStore = await getTimelineStore();
		const useProjectStore = await getProjectStore();
		const timelineStore = useTimelineStore.getState();
		const projectStore = useProjectStore.getState();
		const { activeProject } = projectStore;
		const { currentScene } = get();

		if (activeProject && currentScene) {
			await timelineStore.saveProjectTimeline({
				projectId: activeProject.id,
				sceneId: currentScene.id,
			});
		}

		if (activeProject) {
			await timelineStore.loadProjectTimeline({
				projectId: activeProject.id,
				sceneId,
			});

			const updatedProject = {
				...activeProject,
				currentSceneId: sceneId,
				updatedAt: new Date(),
			};

			await storageService.saveProject({ project: updatedProject });
			useProjectStore.setState({ activeProject: updatedProject });
		}

		set({ currentScene: targetScene });
	},

	getMainScene: () => {
		const { scenes } = get();
		return scenes.find((scene) => scene.isMain) || null;
	},

	getCurrentScene: () => {
		return get().currentScene;
	},

	loadProjectScenes: async ({ projectId }: { projectId: string }) => {
		try {
			const project = await storageService.loadProject({ id: projectId });
			if (project?.scenes) {
				const ensuredScenes = project.scenes.map((scene) => ({
					...scene,
					isMain: scene.isMain || false,
					createdAt:
						typeof (scene as any).createdAt === "string"
							? new Date((scene as any).createdAt)
							: scene.createdAt,
					updatedAt:
						typeof (scene as any).updatedAt === "string"
							? new Date((scene as any).updatedAt)
							: scene.updatedAt,
				}));
				const selectedScene =
					ensuredScenes.find((s) => s.id === project.currentSceneId) ||
					ensuredScenes[0] ||
					null;

				set({
					scenes: ensuredScenes,
					currentScene: selectedScene,
				});

				// Persist corrected currentSceneId if needed
				if (selectedScene && project.currentSceneId !== selectedScene.id) {
					try {
						await storageService.saveProject({
							project: {
								...project,
								scenes: ensuredScenes,
								currentSceneId: selectedScene.id,
								updatedAt: new Date(),
							},
						});
					} catch (saveError) {
						console.error(
							"Failed to persist corrected currentSceneId:",
							saveError
						);
					}
				}
			}
		} catch (error) {
			console.error("Failed to load project scenes:", error);
			set({ scenes: [], currentScene: null });
		}
	},

	initializeScenes: async ({
		scenes,
		currentSceneId,
	}: {
		scenes: Scene[];
		currentSceneId?: string;
	}) => {
		const ensuredScenes = ensureMainScene(scenes);
		const currentScene = currentSceneId
			? ensuredScenes.find((s) => s.id === currentSceneId)
			: null;

		const fallbackScene = getMainScene({ scenes: ensuredScenes });

		set({
			scenes: ensuredScenes,
			currentScene: currentScene || fallbackScene,
		});

		if (ensuredScenes.length > scenes.length) {
			const useProjectStore = await getProjectStore();
			const projectStore = useProjectStore.getState();
			const { activeProject } = projectStore;

			if (activeProject) {
				const updatedProject = {
					...activeProject,
					scenes: ensuredScenes,
					updatedAt: new Date(),
				};

				try {
					await storageService.saveProject({ project: updatedProject });
					useProjectStore.setState({ activeProject: updatedProject });
				} catch (error) {
					console.error("Failed to save project with main scene:", error);
				}
			}
		}
	},

	clearScenes: () => {
		set({
			scenes: [],
			currentScene: null,
		});
	},

	initializeProjectScenes: async (project: {
		scenes: Scene[];
		currentSceneId: string;
	}) => {
		const ensuredScenes = ensureMainScene(project.scenes || []);
		const currentScene = project.currentSceneId
			? ensuredScenes.find((s) => s.id === project.currentSceneId)
			: null;

		const fallbackScene = getMainScene({ scenes: ensuredScenes });

		set({
			scenes: ensuredScenes,
			currentScene: currentScene || fallbackScene,
		});
	},
}));
