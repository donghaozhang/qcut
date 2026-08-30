import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene, TProject } from "@/types/project";
import { useProjectStore } from "../project-store";

const storageMocks = vi.hoisted(() => ({
	saveProject: vi.fn(),
	loadAllProjects: vi.fn(),
	loadAllProjectFolders: vi.fn(),
}));

const timelineMocks = vi.hoisted(() => ({
	saveProjectTimeline: vi.fn(),
}));

const stickerMocks = vi.hoisted(() => ({
	saveToProject: vi.fn(),
}));

const sceneMocks = vi.hoisted(() => ({
	getState: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: storageMocks,
}));

vi.mock("@/stores/timeline-store", () => ({
	useTimelineStore: {
		getState: () => timelineMocks,
	},
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => stickerMocks,
	},
}));

vi.mock("@/stores/timeline/scene-store", () => ({
	useSceneStore: {
		getState: sceneMocks.getState,
	},
}));

vi.mock("@/lib/debug/error-handler", () => ({
	handleError: vi.fn(),
	handleStorageError: vi.fn(),
	ErrorCategory: { VALIDATION: "validation" },
	ErrorSeverity: { MEDIUM: "medium" },
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugError: vi.fn(),
	debugLog: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

const PROJECT_SCENE: Scene = {
	id: "scene-project",
	name: "Project Scene",
	isMain: true,
	createdAt: new Date("2026-08-29T00:00:00.000Z"),
	updatedAt: new Date("2026-08-29T00:00:00.000Z"),
};

const ACTIVE_SCENE: Scene = {
	...PROJECT_SCENE,
	id: "scene-active",
	name: "Active Scene",
	isMain: false,
};

function createProject({
	currentSceneId = PROJECT_SCENE.id,
}: {
	currentSceneId?: string;
} = {}): TProject {
	return {
		id: "project-1",
		name: "Scene Save",
		thumbnail: "",
		createdAt: new Date("2026-08-29T00:00:00.000Z"),
		updatedAt: new Date("2026-08-29T00:00:00.000Z"),
		scenes: [PROJECT_SCENE, ACTIVE_SCENE],
		currentSceneId,
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
	};
}

describe("project store manual save", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storageMocks.saveProject.mockResolvedValue(undefined);
		storageMocks.loadAllProjects.mockResolvedValue([]);
		storageMocks.loadAllProjectFolders.mockResolvedValue([]);
		timelineMocks.saveProjectTimeline.mockResolvedValue(undefined);
		stickerMocks.saveToProject.mockResolvedValue(undefined);
		sceneMocks.getState.mockReturnValue({ currentScene: ACTIVE_SCENE });
		useProjectStore.setState({
			activeProject: createProject(),
			savedProjects: [],
			projectFolders: [],
			isLoading: false,
			isInitialized: true,
		});
	});

	it("writes the project current scene timeline", async () => {
		useProjectStore.setState({
			activeProject: createProject({ currentSceneId: ACTIVE_SCENE.id }),
		});

		await useProjectStore.getState().saveCurrentProject();

		expect(timelineMocks.saveProjectTimeline).toHaveBeenCalledWith({
			projectId: "project-1",
			sceneId: ACTIVE_SCENE.id,
		});
	});

	it("does not redirect a save to a stale non-current scene", async () => {
		useProjectStore.setState({ activeProject: createProject() });

		await useProjectStore.getState().saveCurrentProject();

		expect(timelineMocks.saveProjectTimeline).toHaveBeenCalledWith({
			projectId: "project-1",
			sceneId: PROJECT_SCENE.id,
		});
	});
});
