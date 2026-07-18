import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFolder, TProject } from "@/types/project";
import { useProjectStore } from "../project-store";

const storageMocks = vi.hoisted(() => ({
	saveProject: vi.fn(),
	loadProject: vi.fn(),
	deleteProjectFolder: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: storageMocks,
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

const FOLDER: ProjectFolder = {
	id: "folder-1",
	name: "Campaign",
	createdAt: new Date("2026-07-18T00:00:00.000Z"),
};

function createProject({
	id,
	folderId = FOLDER.id,
}: {
	id: string;
	folderId?: string | null;
}): TProject {
	const sceneId = `${id}-scene`;
	return {
		id,
		name: id,
		thumbnail: "",
		createdAt: new Date("2026-07-18T00:00:00.000Z"),
		updatedAt: new Date("2026-07-18T00:00:00.000Z"),
		folderId,
		scenes: [
			{
				id: sceneId,
				name: "Main Scene",
				isMain: true,
				createdAt: new Date("2026-07-18T00:00:00.000Z"),
				updatedAt: new Date("2026-07-18T00:00:00.000Z"),
			},
		],
		currentSceneId: sceneId,
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
	};
}

describe("project folder store", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storageMocks.saveProject.mockResolvedValue(undefined);
		storageMocks.loadProject.mockResolvedValue(null);
		storageMocks.deleteProjectFolder.mockResolvedValue(undefined);
		useProjectStore.setState({
			activeProject: null,
			savedProjects: [],
			projectFolders: [FOLDER],
			isLoading: false,
			isInitialized: true,
		});
	});

	it("persists a project move before updating store state", async () => {
		const project = createProject({ id: "project-1", folderId: null });
		useProjectStore.setState({ savedProjects: [project] });

		await useProjectStore.getState().moveProjectToFolder(project.id, FOLDER.id);

		expect(storageMocks.saveProject).toHaveBeenCalledWith({
			project: expect.objectContaining({ id: project.id, folderId: FOLDER.id }),
		});
		expect(useProjectStore.getState().savedProjects[0]?.folderId).toBe(
			FOLDER.id
		);
	});

	it("keeps a folder when any member cannot be moved to root", async () => {
		const movable = createProject({ id: "project-movable" });
		const blocked = createProject({ id: "project-blocked" });
		useProjectStore.setState({ savedProjects: [movable, blocked] });
		storageMocks.saveProject.mockImplementation(
			async ({ project }: { project: TProject }) => {
				if (project.id === blocked.id) {
					throw new Error("disk full");
				}
			}
		);

		await useProjectStore.getState().deleteProjectFolder(FOLDER.id);

		expect(storageMocks.deleteProjectFolder).not.toHaveBeenCalled();
		expect(useProjectStore.getState().projectFolders).toContainEqual(FOLDER);
		expect(
			useProjectStore
				.getState()
				.savedProjects.find((item) => item.id === movable.id)?.folderId
		).toBeNull();
		expect(
			useProjectStore
				.getState()
				.savedProjects.find((item) => item.id === blocked.id)?.folderId
		).toBe(FOLDER.id);
	});

	it("deletes a folder only after every member is moved to root", async () => {
		const projects = [
			createProject({ id: "project-1" }),
			createProject({ id: "project-2" }),
		];
		useProjectStore.setState({ savedProjects: projects });

		await useProjectStore.getState().deleteProjectFolder(FOLDER.id);

		expect(storageMocks.saveProject).toHaveBeenCalledTimes(2);
		expect(storageMocks.deleteProjectFolder).toHaveBeenCalledWith(FOLDER.id);
		expect(useProjectStore.getState().projectFolders).toEqual([]);
		expect(
			useProjectStore
				.getState()
				.savedProjects.every((project) => project.folderId === null)
		).toBe(true);
	});
});
