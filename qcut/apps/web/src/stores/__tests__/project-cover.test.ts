import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { ProjectCoverBindingV1 } from "@qcut/editor-core/cover";
import { useProjectStore } from "../project-store";

const storage = vi.hoisted(() => ({
	saveProject: vi.fn(),
	loadProject: vi.fn(),
	loadAllProjects: vi.fn(),
	loadAllProjectFolders: vi.fn(),
}));
const repository = vi.hoisted(() => ({
	copyProject: vi.fn(),
	removeProject: vi.fn(),
}));
vi.mock("@/lib/storage/storage-service", () => ({ storageService: storage }));
vi.mock("@/lib/cover/cover-repository", () => ({
	coverRepository: repository,
}));

const hash = "a".repeat(64);
const cover: ProjectCoverBindingV1 = {
	schemaVersion: 1,
	designId: "d1",
	designRevision: 1,
	designPath: "cover/designs/d1/1.json",
	canvas: { width: 1080, height: 1920 },
	source: { kind: "local-image", originalName: "portrait.png" },
	updatedAt: "2026-09-05T00:00:00.000Z",
	render: {
		assetId: hash,
		sha256: hash,
		relativePath: `cover/objects/${hash}.png`,
		mimeType: "image/png",
		width: 1080,
		height: 1920,
		byteLength: 100,
	},
	thumbnail: {
		assetId: hash,
		sha256: hash,
		relativePath: `cover/objects/${hash}.webp`,
		mimeType: "image/webp",
		width: 640,
		height: 360,
		byteLength: 50,
	},
};
const project: TProject = {
	id: "p1",
	name: "Cover test",
	thumbnail: "legacy.jpg",
	createdAt: new Date(),
	updatedAt: new Date(),
	scenes: [],
	currentSceneId: "scene-1",
	canvasSize: cover.canvas,
	canvasMode: "custom",
};

describe("project cover publication", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useProjectStore.setState({
			activeProject: { ...project },
			savedProjects: [{ ...project }],
			isInitialized: true,
		});
		storage.saveProject.mockImplementation(
			async ({ project: saved }: { project: TProject }) => {
				storage.loadProject.mockResolvedValue(saved);
			}
		);
		storage.loadAllProjects.mockResolvedValue([]);
		storage.loadAllProjectFolders.mockResolvedValue([]);
	});
	it("saves a cover and preserves the legacy thumbnail for clear fallback", async () => {
		await useProjectStore
			.getState()
			.setProjectCover({ projectId: "p1", cover });
		expect(useProjectStore.getState().activeProject?.cover).toEqual(cover);
		expect(useProjectStore.getState().savedProjects[0].cover).toEqual(cover);
		expect(useProjectStore.getState().activeProject?.thumbnail).toBe(
			"legacy.jpg"
		);
		await useProjectStore
			.getState()
			.setProjectCover({ projectId: "p1", expectedCover: cover });
		expect(useProjectStore.getState().activeProject?.cover).toBeUndefined();
		expect(repository.removeProject).not.toHaveBeenCalled();
	});
	it("rejects a different active project, stale cover or changed canvas before saving", async () => {
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p2", cover })
		).rejects.toThrow("active project changed");
		await expect(
			useProjectStore
				.getState()
				.setProjectCover({ projectId: "p1", cover, expectedCover: cover })
		).rejects.toThrow("cover changed");
		useProjectStore.setState({
			activeProject: { ...project, canvasSize: { width: 1920, height: 1080 } },
		});
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p1", cover })
		).rejects.toThrow("canvas changed");
		expect(storage.saveProject).not.toHaveBeenCalled();
	});
	it("rolls back the binding if project storage fails without discarding other current edits", async () => {
		storage.saveProject.mockImplementationOnce(async () => {
			const active = useProjectStore.getState().activeProject as TProject;
			useProjectStore.setState({
				activeProject: { ...active, name: "Edited while saving" },
			});
			throw new Error("disk full");
		});
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p1", cover })
		).rejects.toThrow("disk full");
		expect(useProjectStore.getState().activeProject).toMatchObject({
			name: "Edited while saving",
			cover: undefined,
		});
		expect(useProjectStore.getState().savedProjects[0].cover).toBeUndefined();
		expect(storage.saveProject).toHaveBeenCalledTimes(1);
	});
	it("does not overwrite the new active project when a late save fails", async () => {
		storage.saveProject.mockImplementationOnce(async () => {
			useProjectStore.setState({ activeProject: { ...project, id: "p2" } });
			throw new Error("disk full");
		});
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p1", cover })
		).rejects.toThrow("disk full");
		expect(useProjectStore.getState().activeProject?.id).toBe("p2");
		expect(useProjectStore.getState().savedProjects[0].cover).toBeUndefined();
	});
	it("does not report a clear as saved when the project disappeared", async () => {
		storage.saveProject.mockResolvedValueOnce(undefined);
		storage.loadProject.mockResolvedValueOnce(null);
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p1" })
		).rejects.toThrow("read-back");
	});
	it("detects a failed read-back instead of claiming publication succeeded", async () => {
		storage.saveProject.mockResolvedValueOnce(undefined);
		storage.loadProject.mockResolvedValueOnce(project);
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p1", cover })
		).rejects.toThrow("read-back");
	});
	it("restores storage when a persisted publish fails read-back", async () => {
		storage.saveProject.mockResolvedValueOnce(undefined);
		storage.loadProject.mockResolvedValueOnce(project);
		await expect(
			useProjectStore.getState().setProjectCover({ projectId: "p1", cover })
		).rejects.toThrow("read-back");
		expect(storage.saveProject).toHaveBeenCalledTimes(2);
		expect(storage.saveProject.mock.calls[1][0].project).toMatchObject({
			id: "p1",
			cover: undefined,
		});
	});
	it("copies cover assets before publishing the duplicated project", async () => {
		storage.loadProject.mockResolvedValue({ ...project, cover });
		await useProjectStore.getState().duplicateProject("p1");
		expect(repository.copyProject).toHaveBeenCalledWith({
			sourceProjectId: "p1",
			targetProjectId: expect.any(String),
			cover,
		});
		expect(repository.copyProject.mock.invocationCallOrder[0]).toBeLessThan(
			storage.saveProject.mock.invocationCallOrder[0]
		);
	});
});
