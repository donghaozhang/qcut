import { TProject, Scene, BlurIntensity } from "@/types/project";
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
	isLoading: boolean;
	isInitialized: boolean;
	invalidProjectIds?: Set<string>;

	// Actions
	createNewProject: (
		name: string,
		options?: { canvasSize?: CanvasSize }
	) => Promise<string>;
	loadProject: (id: string) => Promise<void>;
	saveCurrentProject: () => Promise<void>;
	loadAllProjects: () => Promise<void>;
	deleteProject: (id: string) => Promise<void>;
	closeProject: () => Promise<void>;
	renameProject: (projectId: string, name: string) => Promise<void>;
	duplicateProject: (projectId: string) => Promise<string>;
	updateProjectBackground: (backgroundColor: string) => Promise<void>;
	updateBackgroundType: (
		type: "color" | "blur",
		options?: { backgroundColor?: string; blurIntensity?: BlurIntensity }
	) => Promise<void>;
	updateProjectFps: (fps: number) => Promise<void>;

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
		options?: { canvasSize?: CanvasSize }
	) => {
		const mainScene = createMainScene();

		const newProject: TProject = {
			id: generateUUID(),
			name,
			thumbnail: "",
			createdAt: new Date(),
			updatedAt: new Date(),
			scenes: [mainScene],
			currentSceneId: mainScene.id,
			backgroundColor: "#000000",
			backgroundType: "color",
			blurIntensity: 8,
			bookmarks: [],
			fps: DEFAULT_FPS,
			canvasSize: options?.canvasSize ?? DEFAULT_CANVAS_SIZE,
			canvasMode: "preset",
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
			set({ activeProject: project });

			// 4. Load remaining data with error handling
			debugLog(`[ProjectStore] Loading media for project: ${id}`);
			await mediaStore.loadProjectMedia(id);
			debugLog(
				"[ProjectStore] Media loading complete, now loading timeline and stickers"
			);

			// Initialize scenes for the project
			debugLog(`[ProjectStore] Initializing scenes for project: ${id}`);
			await sceneStore.initializeProjectScenes(project);

			// Load timeline and stickers in parallel (both may depend on media being loaded)
			await Promise.all([
				timelineStore.loadProjectTimeline({ projectId: id }),
				stickersStore.loadFromProject(id),
			]);

			syncProjectSkillsForClaude({ projectId: id });
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

			if (key !== "createdAt" && key !== "name") {
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
}));
