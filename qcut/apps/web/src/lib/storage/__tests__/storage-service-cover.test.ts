import { describe, expect, it } from "vitest";
import type { TProject } from "@/types/project";
import { storageService } from "../storage-service";
import type { SerializedProject, StorageAdapter } from "../types";
import { createMapStorageAdapter } from "./support/map-storage-adapter";

describe("cover project serialization", () => {
	it("round-trips the cover independently of a volatile legacy thumbnail", async () => {
		const adapter = createMapStorageAdapter<SerializedProject>();
		const internals = storageService as unknown as {
			projectsAdapter: StorageAdapter<SerializedProject>;
			isInitialized: boolean;
		};
		internals.projectsAdapter = adapter;
		internals.isInitialized = true;
		const hash = "a".repeat(64);
		const asset = {
			assetId: hash,
			sha256: hash,
			byteLength: 100,
		};
		const project: TProject = {
			id: "p1",
			name: "Cover",
			thumbnail: "blob:volatile",
			canvasSize: { width: 1920, height: 1080 },
			canvasMode: "preset",
			createdAt: new Date(),
			updatedAt: new Date(),
			scenes: [],
			currentSceneId: "scene-1",
			cover: {
				schemaVersion: 1,
				designId: "d1",
				designRevision: 1,
				designPath: "cover/designs/d1/1.json",
				canvas: { width: 1920, height: 1080 },
				source: { kind: "local-image", originalName: "cover.png" },
				updatedAt: "2026-09-05T00:00:00.000Z",
				render: {
					...asset,
					mimeType: "image/png",
					relativePath: `cover/objects/${hash}.png`,
					width: 1920,
					height: 1080,
				},
				thumbnail: {
					...asset,
					mimeType: "image/webp",
					relativePath: `cover/objects/${hash}.webp`,
					width: 640,
					height: 360,
				},
			},
		};
		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });
		expect(loaded?.cover).toEqual(project.cover);
		expect(loaded?.thumbnail).toBe("");
		await storageService.saveProject({
			project: { ...project, cover: undefined },
		});
		expect(
			(await storageService.loadProject({ id: project.id }))?.cover
		).toBeUndefined();
	});
});
