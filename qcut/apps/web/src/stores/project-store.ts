import { platform } from "@qcut/platform-core";
import { TProject, Scene, BlurIntensity, ProjectFolder } from "@/types/project";
import { CanvasSize, CanvasMode } from "@/types/editor";
import { create } from "zustand";
import { storageService } from "@/lib/storage/storage-service";
import { toast } from "sonner";
import { getMediaStore } from "./media/media-store-loader";
// Dynamic import to break circular dependency
// import { useTimelineStore } from "./timeline-store";
// Dynamic import to break circular dependency
// import { useStickersOverlayStore } from "./stickers-overlay-store";
import { generateUUID } from "@/lib/utils";
import { debugError, debugLog } from "@/lib/debug/debug-config";
import { syncProjectSkillsForClaude } from "@/lib/claude-bridge/project-skills-sync";
import {
	createDefaultProjectAudioMixSettings,
	normalizeProjectAudioMixSettings,
} from "@/lib/audio/audio-mix-settings";
import type { ProjectAudioMixSettings } from "@/types/timeline";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
	handleStorageError,
} from "@/lib/debug/error-handler";

export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1920, height: 1080 };
export const DEFAULT_FPS = 30;

export function createMainScene(): Scene {
	return {
		id: generateUUID(),
		name: "Main Scene",
		isMain: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/**
 * Thrown when a requested project cannot be found in storage.
 * Includes a stable code for programmatic detection.
 */
export class NotFoundError extends Error {
	readonly code = "PROJECT_NOT_FOUND";

	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}

interface ProjectStore {
	activeProject: TProject | null;
	savedProjects: TProject[];
	projectFolders: ProjectFolder[];
	isLoading: boolean;
	isInitialized: boolean;
	invalidProjectIds?: Set<string>;

	// Actions
	createNewProject: (
		name: string,
		options?: { canvasSize?: CanvasSize; folderId?: string | null }
	) => Promise<string>;
	loadProject: (id: string) => Promise<void>;
	saveCurrentProject: () => Promise<void>;
	loadAllProjects: () => Promise<void>;
	deleteProject: (id: string) => Promise<void>;
	closeProject: () => Promise<void>;
	renameProject: (projectId: string, name: string) => Promise<void>;
	duplicateProject: (projectId: string) => Promise<string>;
	updateProjectBackground: (backgroundColor: string) => Promise<void>;
	updateProjectCanvasSize: (
		canvasSize: CanvasSize,
		canvasMode?: CanvasMode
	) => Promise<void>;
	updateBackgroundType: (
		type: "color" | "blur",
		options?: { backgroundColor?: string; blurIntensity?: BlurIntensity }
	) => Promise<void>;
	updateProjectFps: (fps: number) => Promise<void>;
	updateProjectAudioMix: (audioMix: ProjectAudioMixSettings) => Promise<void>;

	// Studio-page folder methods
	createProjectFolder: (name: string) => Promise<string>;
	renameProjectFolder: (folderId: string, name: string) => Promise<void>;
	deleteProjectFolder: (folderId: string) => Promise<boolean>;
	moveProjectToFolder: (
		projectId: string,
		folderId: string | null
	) => Promise<boolean>;

	// Bookmark methods
	toggleBookmark: (time: number) => Promise<void>;
	isBookmarked: (time: number) => boolean;
	removeBookmark: (time: number) => Promise<void>;

	getFilteredAndSortedProjects: (
		searchQuery: string,
		sortOption: string
	) => TProject[];

	// Global invalid project ID tracking
	isInvalidProjectId: (id: string) => boolean;
	markProjectIdAsInvalid: (id: string) => void;
	clearInvalidProjectIds: () => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
	activeProject: null,
	savedProjects: [],
	projectFolders: [],
	isLoading: true,
	isInitialized: false,
	invalidProjectIds: new Set<string>(),

	// Implementation of bookmark methods
	toggleBookmark: async (time: number) => {
		const { activeProject } = get();
		if (!activeProject) return;

		// Round time to the nearest frame
		const fps = activeProject.fps || 30;
		const frameTime = Math.round(time * fps) / fps;

		const bookmarks = activeProject.bookmarks || [];
		let updatedBookmarks: number[];

		// Check if already bookmarked
		const bookmarkIndex = bookmarks.findIndex(
			(bookmark) => Math.abs(bookmark - frameTime) < 0.001
		);

		if (bookmarkIndex !== -1) {
			// Remove bookmark
			updatedBookmarks = bookmarks.filter((_, i) => i !== bookmarkIndex);
		} else {
			// Add bookmark
			updatedBookmarks = [...bookmarks, frameTime].sort((a, b) => a - b);
		}

		const updatedProject = {
			...activeProject,
			bookmarks: updatedBookmarks,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			set({ activeProject: updatedProject });
			await get().loadAllProjects(); // Refresh the list
		} catch (error) {
			handleStorageError(error, "Update project bookmarks", {
				projectId: updatedProject.id,
				projectName: updatedProject.name,
				bookmarkTime: frameTime,
				operation: "updateBookmarks",
			});
		}
	},

	isBookmarked: (time: number) => {
		const { activeProject } = get();
		if (!activeProject || !activeProject.bookmarks) return false;

		// Round time to the nearest frame
		const fps = activeProject.fps || 30;
		const frameTime = Math.round(time * fps) / fps;

		return activeProject.bookmarks.some(
			(bookmark) => Math.abs(bookmark - frameTime) < 0.001
		);
	},

	removeBookmark: async (time: number) => {
		const { activeProject } = get();
		if (!activeProject || !activeProject.bookmarks) return;

		// Round time to the nearest frame
		const fps = activeProject.fps || 30;
		const frameTime = Math.round(time * fps) / fps;

		const updatedBookmarks = activeProject.bookmarks.filter(
			(bookmark) => Math.abs(bookmark - frameTime) >= 0.001
		);

		if (updatedBookmarks.length === activeProject.bookmarks.length) {
			// No bookmark found to remove
			return;
		}

		const updatedProject = {
			...activeProject,
			bookmarks: updatedBookmarks,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			set({ activeProject: updatedProject });
			await get().loadAllProjects(); // Refresh the list
		} catch (error) {
			handleStorageError(error, "Remove project bookmark", {
				projectId: updatedProject.id,
				projectName: updatedProject.name,
				bookmarkTime: frameTime,
				operation: "removeBookmark",
			});
		}
	},

	createNewProject: async (
		name: string,
		options?: { canvasSize?: CanvasSize; folderId?: string | null }
	) => {
		const mainScene = createMainScene();

		const newProject: TProject = {
			id: generateUUID(),
			name,
			thumbnail: "",
			createdAt: new Date(),
			updatedAt: new Date(),
			folderId: options?.folderId ?? null,
			scenes: [mainScene],
			currentSceneId: mainScene.id,
			backgroundColor: "#000000",
			backgroundType: "color",
			blurIntensity: 8,
			bookmarks: [],
			fps: DEFAULT_FPS,
			canvasSize: options?.canvasSize ?? DEFAULT_CANVAS_SIZE,
			canvasMode: "preset",
			audioMix: createDefaultProjectAudioMixSettings(),
		};

		set({ activeProject: newProject });

		try {
			await storageService.saveProject({ project: newProject });
			// Reload all projects to update the list
			await get().loadAllProjects();
			return newProject.id;
		} catch (error) {
			handleStorageError(error, "Create new project", {
				projectId: newProject.id,
				projectName: newProject.name,
				operation: "createProject",
			});
			throw error;
		}
	},

	loadProject: async (id: string) => {
		if (!get().isInitialized) {
			set({ isLoading: true });
		}

		// Get store references (no clearing yet - load before clear pattern)
		const mediaStore = (await getMediaStore()).useMediaStore.getState();
		const { useTimelineStore } = await import("./timeline-store");
		const timelineStore = useTimelineStore.getState();
		const { useStickersOverlayStore } = await import(
			"./stickers-overlay-store"
		);
		const { useSceneStore } = await import("./timeline/scene-store");
		const stickersStore = useStickersOverlayStore.getState();
		const sceneStore = useSceneStore.getState();

		// Backup current state for rollback on failure
		const backup = {
			media: [...mediaStore.mediaItems],
			timeline: [...timelineStore._tracks],
			activeProject: get().activeProject,
		};

		try {
			// 1. LOAD FROM STORAGE FIRST - verify project exists and is accessible
			debugLog(`[ProjectStore] Loading project from storage: ${id}`);
			const project = await storageService.loadProject({ id });
			if (!project) {
				throw new NotFoundError(`Project ${id} not found`);
			}

			// 2. ONLY NOW clear state (after successful load verification)
			// This prevents data loss if storage is inaccessible
			debugLog("[ProjectStore] Project verified, clearing previous state");
			mediaStore.clearAllMedia();
			timelineStore.clearTimeline();
			stickersStore.clearAllStickers();
			sceneStore.clearScenes();

			// 3. Apply new project state
			const normalizedProject = {
				...project,
				audioMix: normalizeProjectAudioMixSettings({
					audioMix: project.audioMix,
				}),
			};
			set({ activeProject: normalizedProject });

			// 4. Load remaining data with error handling
			debugLog(`[ProjectStore] Loading media for project: ${id}`);
			await mediaStore.loadProjectMedia(id);
			debugLog(
				"[ProjectStore] Media loading complete, now loading timeline and stickers"
			);

			// Initialize scenes for the project
			debugLog(`[ProjectStore] Initializing scenes for project: ${id}`);
			await sceneStore.initializeProjectScenes(normalizedProject);

			// Timeline owns sticker timing and visual state; legacy overlay data migrates after it loads.
			const currentSceneId =
				useSceneStore.getState().currentScene?.id ?? project.currentSceneId;
			await timelineStore.loadProjectTimeline({
				projectId: id,
				sceneId: currentSceneId,
			});
			await stickersStore.loadFromProject(id);

			syncProjectSkillsForClaude({ projectId: id });

			// Regenerate project.json on every load to ensure freshness
			platform().projectJson?.write(id);

			debugLog(`[ProjectStore] Project loading complete: ${id}`);
		} catch (error) {
			// Rollback to previous state if we had a project open
			debugLog("[ProjectStore] Load failed, attempting rollback");
			if (backup.activeProject) {
				debugLog("[ProjectStore] Restoring backup state");
				// Restore previous project
				set({ activeProject: backup.activeProject });
				// Restore timeline tracks
				if (backup.timeline.length > 0) {
					timelineStore.restoreTracks(backup.timeline);
				}
				// Restore media items
				if (backup.media.length > 0) {
					mediaStore.restoreMediaItems(backup.media);
				}
			}
			handleStorageError(error, "Load project", {
				projectId: id,
				operation: "loadProject",
			});
			throw error; // Re-throw so the editor page can handle it
		} finally {
			set({ isLoading: false });
		}
	},

	saveCurrentProject: async () => {
		const { activeProject } = get();
		if (!activeProject) return;

		try {
			// Save project metadata, timeline data, and stickers in parallel
			const { useTimelineStore } = await import("./timeline-store");
			const timelineStore = useTimelineStore.getState();
			const { useStickersOverlayStore } = await import(
				"./stickers-overlay-store"
			);
			const stickersStore = useStickersOverlayStore.getState();
			await Promise.all([
				storageService.saveProject({ project: activeProject }),
				timelineStore.saveProjectTimeline({ projectId: activeProject.id }),
				stickersStore.saveToProject(activeProject.id),
			]);
			await get().loadAllProjects(); // Refresh the list
		} catch (error) {
			handleStorageError(error, "Save current project", {
				projectId: activeProject.id,
				projectName: activeProject.name,
				operation: "saveCurrentProject",
			});
		}
	},

	loadAllProjects: async () => {
		if (!get().isInitialized) {
			set({ isLoading: true });
		}

		try {
			const projects = await storageService.loadAllProjects();
			set({ savedProjects: projects });
		} catch (error) {
			handleStorageError(error, "Load all projects", {
				operation: "loadAllProjects",
			});
		} finally {
			set({ isLoading: false, isInitialized: true });
		}

		// Folder list failures shouldn't block the projects list
		try {
			const folders = await storageService.loadAllProjectFolders();
			set({ projectFolders: folders });
		} catch (error) {
			handleStorageError(error, "Load project folders", {
				operation: "loadAllProjects",
			});
		}
	},

	createProjectFolder: async (name: string) => {
		const folder: ProjectFolder = {
			id: generateUUID(),
			name: name.trim(),
			createdAt: new Date(),
		};
		try {
			await storageService.saveProjectFolder(folder);
			set((state) => ({ projectFolders: [...state.projectFolders, folder] }));
		} catch (error) {
			handleStorageError(error, "Create project folder", {
				operation: "createProjectFolder",
			});
		}
		return folder.id;
	},

	renameProjectFolder: async (folderId: string, name: string) => {
		const folder = get().projectFolders.find((f) => f.id === folderId);
		if (!folder) return;
		const updated = { ...folder, name: name.trim() };
		try {
			await storageService.saveProjectFolder(updated);
			set((state) => ({
				projectFolders: state.projectFolders.map((f) =>
					f.id === folderId ? updated : f
				),
			}));
		} catch (error) {
			handleStorageError(error, "Rename project folder", {
				operation: "renameProjectFolder",
				folderId,
			});
		}
	},

	deleteProjectFolder: async (folderId: string) => {
		try {
			const members = get().savedProjects.filter(
				(p) => p.folderId === folderId
			);
			const moveResults = await Promise.all(
				members.map((project) => get().moveProjectToFolder(project.id, null))
			);
			if (moveResults.some((wasMoved) => !wasMoved)) return false;

			await storageService.deleteProjectFolder(folderId);
			set((state) => ({
				projectFolders: state.projectFolders.filter((f) => f.id !== folderId),
			}));
			return true;
		} catch (error) {
			handleStorageError(error, "Delete project folder", {
				operation: "deleteProjectFolder",
				folderId,
			});
			return false;
		}
	},

	moveProjectToFolder: async (projectId: string, folderId: string | null) => {
		try {
			const project =
				get().savedProjects.find((item) => item.id === projectId) ??
				(await storageService.loadProject({ id: projectId }));
			if (!project) return false;
			if ((project.folderId ?? null) === folderId) return true;

			const updatedProject: TProject = { ...project, folderId };
			await storageService.saveProject({ project: updatedProject });
			set((state) => ({
				savedProjects: state.savedProjects.map((p) =>
					p.id === projectId ? updatedProject : p
				),
				activeProject:
					state.activeProject?.id === projectId
						? updatedProject
						: state.activeProject,
			}));
			return true;
		} catch (error) {
			handleStorageError(error, "Move project to folder", {
				operation: "moveProjectToFolder",
				projectId,
			});
			return false;
		}
	},

	deleteProject: async (id: string) => {
		try {
			// Delete project data in parallel
			await Promise.all([
				storageService.deleteProjectMedia(id),
				storageService.deleteProjectTimeline({ projectId: id }),
				storageService.deleteProject(id),
			]);
			await get().loadAllProjects(); // Refresh the list

			// If we deleted the active project, close it and clear data
			const { activeProject } = get();
			if (activeProject?.id === id) {
				set({ activeProject: null });
				const mediaStore = (await getMediaStore()).useMediaStore.getState();
				const { useTimelineStore } = await import("./timeline-store");
				const timelineStore = useTimelineStore.getState();
				mediaStore.clearAllMedia();
				timelineStore.clearTimeline();
			}
		} catch (error) {
			handleStorageError(error, "Delete project", {
				projectId: id,
				operation: "deleteProject",
			});
		}
	},

	closeProject: async () => {
		set({ activeProject: null });

		// Clear data from stores when closing project
		const mediaStore = (await getMediaStore()).useMediaStore.getState();
		const { useTimelineStore } = await import("./timeline-store");
		const timelineStore = useTimelineStore.getState();
		mediaStore.clearAllMedia();
		timelineStore.clearTimeline();
	},

	renameProject: async (id: string, name: string) => {
		const { savedProjects } = get();

		// Find the project to rename
		const projectToRename = savedProjects.find((p) => p.id === id);
		if (!projectToRename) {
			handleError(new Error(`Project ${id} not found`), {
				operation: "Find project to rename",
				category: ErrorCategory.VALIDATION,
				severity: ErrorSeverity.MEDIUM,
				metadata: { projectId: id },
			});
			return;
		}

		const updatedProject = {
			...projectToRename,
			name,
			updatedAt: new Date(),
		};

		try {
			// Save to storage
			await storageService.saveProject({ project: updatedProject });

			await get().loadAllProjects();

			// Update activeProject if it's the same project
			const { activeProject } = get();
			if (activeProject?.id === id) {
				set({ activeProject: updatedProject });
			}
		} catch (error) {
			handleStorageError(error, "Rename project", {
				projectId: id,
				oldName: projectToRename.name,
				newName: name,
				operation: "renameProject",
			});
		}
	},

	duplicateProject: async (projectId: string) => {
		try {
			const project = await storageService.loadProject({ id: projectId });
			if (!project) {
				const error = new NotFoundError(`Project ${projectId} not found`);
				handleError(error, {
					operation: "Load project for duplication",
					category: ErrorCategory.VALIDATION,
					severity: ErrorSeverity.MEDIUM,
					metadata: { projectId },
				});
				throw error;
			}

			const { savedProjects } = get();

			// Extract the base name (remove any existing numbering)
			const numberMatch = project.name.match(/^\((\d+)\)\s+(.+)$/);
			const baseName = numberMatch ? numberMatch[2] : project.name;
			const existingNumbers: number[] = [];

			// Check for pattern "(number) baseName" in existing projects
			savedProjects.forEach((p) => {
				const match = p.name.match(/^\((\d+)\)\s+(.+)$/);
				if (match && match[2] === baseName) {
					existingNumbers.push(parseInt(match[1], 10));
				}
			});

			const nextNumber =
				existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

			const newProject: TProject = {
				...project, // Copy all properties from the original project
				id: generateUUID(),
				name: `(${nextNumber}) ${baseName}`,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await storageService.saveProject({ project: newProject });
			await get().loadAllProjects();
			return newProject.id;
		} catch (error) {
			// Only handle storage errors, not NotFoundError which was already handled above
			if (!(error instanceof NotFoundError)) {
				handleStorageError(error, "Duplicate project", {
					projectId,
					operation: "duplicateProject",
				});
			}
			throw error;
		}
	},

	updateProjectBackground: async (backgroundColor: string) => {
		const { activeProject } = get();
		if (!activeProject) return;

		const updatedProject = {
			...activeProject,
			backgroundColor,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			set({ activeProject: updatedProject });
			await get().loadAllProjects(); // Refresh the list
		} catch (error) {
			handleStorageError(error, "Update project background", {
				projectId: activeProject.id,
				projectName: activeProject.name,
				backgroundColor,
				operation: "updateProjectBackground",
			});
		}
	},

	updateProjectCanvasSize: async (
		canvasSize: CanvasSize,
		canvasMode: CanvasMode = "custom"
	) => {
		const { activeProject } = get();
		if (!activeProject) return;

		const width = Math.max(1, Math.round(canvasSize.width));
		const height = Math.max(1, Math.round(canvasSize.height));
		if (!Number.isFinite(width) || !Number.isFinite(height)) {
			debugError(
				`[ProjectStore] Ignoring invalid canvas size: ${canvasSize.width}x${canvasSize.height}`
			);
			return;
		}

		const updatedProject = {
			...activeProject,
			canvasSize: { width, height },
			canvasMode,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			set({ activeProject: updatedProject });
			await get().loadAllProjects();
		} catch (error) {
			handleStorageError(error, "Update project canvas size", {
				projectId: activeProject.id,
				projectName: activeProject.name,
				canvasWidth: width,
				canvasHeight: height,
				canvasMode,
				operation: "updateProjectCanvasSize",
			});
		}
	},

	updateBackgroundType: async (
		type: "color" | "blur",
		options?: { backgroundColor?: string; blurIntensity?: BlurIntensity }
	) => {
		const { activeProject } = get();
		if (!activeProject) return;

		const updatedProject = {
			...activeProject,
			backgroundType: type,
			...(options?.backgroundColor && {
				backgroundColor: options.backgroundColor,
			}),
			...(options?.blurIntensity && { blurIntensity: options.blurIntensity }),
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			set({ activeProject: updatedProject });
			await get().loadAllProjects(); // Refresh the list
		} catch (error) {
			handleStorageError(error, "Update project background type", {
				projectId: activeProject.id,
				projectName: activeProject.name,
				backgroundType: type,
				operation: "updateBackgroundType",
			});
		}
	},

	updateProjectFps: async (fps: number) => {
		const { activeProject } = get();
		if (!activeProject) return;

		const updatedProject = {
			...activeProject,
			fps,
			updatedAt: new Date(),
		};

		try {
			await storageService.saveProject({ project: updatedProject });
			set({ activeProject: updatedProject });
			await get().loadAllProjects(); // Refresh the list
		} catch (error) {
			handleStorageError(error, "Update project FPS", {
				projectId: activeProject.id,
				projectName: activeProject.name,
				fps,
				operation: "updateProjectFps",
			});
		}
	},

	getFilteredAndSortedProjects: (searchQuery: string, sortOption: string) => {
		const { savedProjects } = get();

		// Filter projects by search query
		const filteredProjects = savedProjects.filter((project) =>
			project.name.toLowerCase().includes(searchQuery.toLowerCase())
		);

		// Sort filtered projects
		const sortedProjects = [...filteredProjects].sort((a, b) => {
			const [key, order] = sortOption.split("-");

			if (key !== "createdAt" && key !== "updatedAt" && key !== "name") {
				// Invalid sort key
				return 0;
			}

			const aValue = a[key];
			const bValue = b[key];

			if (aValue === undefined || bValue === undefined) return 0;

			if (order === "asc") {
				if (aValue < bValue) return -1;
				if (aValue > bValue) return 1;
				return 0;
			}
			if (aValue > bValue) return -1;
			if (aValue < bValue) return 1;
			return 0;
		});

		return sortedProjects;
	},

	// Global invalid project ID tracking implementation
	isInvalidProjectId: (id: string) => {
		const invalidIds = get().invalidProjectIds || new Set();
		return invalidIds.has(id);
	},

	markProjectIdAsInvalid: (id: string) => {
		set((state) => ({
			invalidProjectIds: new Set([
				...(state.invalidProjectIds || new Set()),
				id,
			]),
		}));
	},

	clearInvalidProjectIds: () => {
		set({ invalidProjectIds: new Set() });
	},

	updateProjectAudioMix: async (audioMix) => {
		const { activeProject } = get();
		if (!activeProject) return;
		const updatedProject: TProject = {
			...activeProject,
			audioMix: normalizeProjectAudioMixSettings({ audioMix }),
			updatedAt: new Date(),
		};
		set({ activeProject: updatedProject });
		try {
			await storageService.saveProject({ project: updatedProject });
		} catch (error) {
			handleStorageError(error, "Update project audio mix", {
				projectId: activeProject.id,
				projectName: activeProject.name,
				operation: "updateProjectAudioMix",
			});
		}
	},
}));

// Expose for iPad CLI debugging (qcut://eval)
(window as any).__projectStore = useProjectStore;
