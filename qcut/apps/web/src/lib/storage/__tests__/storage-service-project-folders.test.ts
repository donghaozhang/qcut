import { beforeEach, describe, expect, it } from "vitest";
import type { ProjectFolder, TProject } from "@/types/project";
import { storageService } from "../storage-service";
import type {
	SerializedProject,
	SerializedProjectFolder,
	StorageAdapter,
} from "../types";

function createMemoryAdapter<T>(): StorageAdapter<T> & {
	records: Map<string, T>;
} {
	const records = new Map<string, T>();
	return {
		records,
		get: async (key) => records.get(key) ?? null,
		set: async (key, value) => {
			records.set(key, value);
		},
		remove: async (key) => {
			records.delete(key);
		},
		list: async () => [...records.keys()],
		clear: async () => {
			records.clear();
		},
	};
}

function createProject({ folderId }: { folderId: string | null }): TProject {
	const timestamp = new Date("2026-07-18T00:00:00.000Z");
	return {
		id: "project-1",
		name: "Project",
		thumbnail: "",
		createdAt: timestamp,
		updatedAt: timestamp,
		folderId,
		scenes: [
			{
				id: "scene-1",
				name: "Main Scene",
				isMain: true,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
	};
}

describe("storage service project folders", () => {
	let projectsAdapter: ReturnType<
		typeof createMemoryAdapter<SerializedProject>
	>;
	let foldersAdapter: ReturnType<
		typeof createMemoryAdapter<SerializedProjectFolder>
	>;

	beforeEach(() => {
		projectsAdapter = createMemoryAdapter<SerializedProject>();
		foldersAdapter = createMemoryAdapter<SerializedProjectFolder>();
		const internals = storageService as unknown as {
			projectsAdapter: StorageAdapter<SerializedProject>;
			projectFoldersAdapter: StorageAdapter<SerializedProjectFolder> | null;
			isInitialized: boolean;
		};
		internals.projectsAdapter = projectsAdapter;
		internals.projectFoldersAdapter = foldersAdapter;
		internals.isInitialized = true;
	});

	it("round-trips a project's folder assignment", async () => {
		const project = createProject({ folderId: "folder-1" });

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(projectsAdapter.records.get(project.id)?.folderId).toBe("folder-1");
		expect(loaded?.folderId).toBe("folder-1");
	});

	it("round-trips folder dates and returns folders in creation order", async () => {
		const later: ProjectFolder = {
			id: "folder-later",
			name: "Later",
			createdAt: new Date("2026-07-18T02:00:00.000Z"),
		};
		const earlier: ProjectFolder = {
			id: "folder-earlier",
			name: "Earlier",
			createdAt: new Date("2026-07-18T01:00:00.000Z"),
		};

		await storageService.saveProjectFolder(later);
		await storageService.saveProjectFolder(earlier);

		await expect(storageService.loadAllProjectFolders()).resolves.toEqual([
			earlier,
			later,
		]);
	});
});
