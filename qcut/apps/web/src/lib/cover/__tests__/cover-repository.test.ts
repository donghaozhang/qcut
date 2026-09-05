// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverRepository } from "../cover-repository";
import type { CoverBlobStore } from "../cover-blob-store";
import type { CoverDesignV1 } from "@qcut/editor-core/cover";

const records = new Map<string, Blob>();
const store: CoverBlobStore = {
	read: vi.fn(
		async ({ projectId, relativePath }) =>
			records.get(`${projectId}/${relativePath}`) ?? null
	),
	write: vi.fn(async ({ projectId, relativePath, blob }) => {
		records.set(`${projectId}/${relativePath}`, blob);
	}),
	removeProject: async ({ projectId }) => {
		for (const key of records.keys()) {
			if (key.startsWith(`${projectId}/`)) records.delete(key);
		}
	},
};
const repository = new CoverRepository(store);

async function createDesign(): Promise<CoverDesignV1> {
	const asset = await repository.saveAsset({
		projectId: "p1",
		blob: new Blob(["source-image"], { type: "image/png" }),
		width: 1080,
		height: 1920,
	});
	return {
		schema: "qcut.cover-design",
		schemaVersion: 1,
		id: "d1",
		revision: 1,
		canvas: { width: 1080, height: 1920, backgroundColor: "#000000" },
		source: { kind: "local-image", originalName: "source.png" },
		layers: [{ id: "background", kind: "image", asset, fit: "contain" }],
		createdAt: "2026-09-05T00:00:00.000Z",
		updatedAt: "2026-09-05T00:00:00.000Z",
	};
}
function outputs() {
	return {
		render: new Blob(["final-image"], { type: "image/png" }),
		thumbnail: new Blob(["preview-image"], { type: "image/webp" }),
	};
}

describe("cover repository transactions", () => {
	beforeEach(() => {
		records.clear();
		vi.clearAllMocks();
	});
	it("saves assets before the design and round-trips source, output and preview", async () => {
		const design = await createDesign();
		const cover = await repository.saveRevision({
			projectId: "p1",
			design,
			...outputs(),
		});
		expect(await repository.loadDesign({ projectId: "p1", cover })).toEqual(
			design
		);
		expect(
			(await repository.readAsset({ projectId: "p1", asset: cover.render }))
				.type
		).toBe("image/png");
		expect(cover.thumbnail).toMatchObject({
			width: 640,
			height: 360,
			mimeType: "image/webp",
		});
		expect(vi.mocked(store.write).mock.calls.at(-1)?.[0].relativePath).toBe(
			cover.designPath
		);
	});
	it("refuses missing or corrupted source bytes", async () => {
		const design = await createDesign();
		records.set(
			`p1/${design.layers[0].asset.relativePath}`,
			new Blob(["wrong-source"])
		);
		await expect(
			repository.saveRevision({ projectId: "p1", design, ...outputs() })
		).rejects.toThrow("corrupt");
		expect([...records.keys()].some((key) => key.includes("/designs/"))).toBe(
			false
		);
	});
	it("does not write a design when output storage fails", async () => {
		const design = await createDesign();
		vi.mocked(store.write).mockRejectedValueOnce(new Error("quota exceeded"));
		await expect(
			repository.saveRevision({ projectId: "p1", design, ...outputs() })
		).rejects.toThrow("quota");
		expect([...records.keys()].some((key) => key.includes("/designs/"))).toBe(
			false
		);
	});
	it("keeps a revision immutable but allows an identical retry", async () => {
		const design = await createDesign();
		const cover = await repository.saveRevision({
			projectId: "p1",
			design,
			...outputs(),
		});
		await expect(
			repository.saveRevision({ projectId: "p1", design, ...outputs() })
		).resolves.toEqual(cover);
		await expect(
			repository.saveRevision({
				projectId: "p1",
				design: {
					...design,
					canvas: { ...design.canvas, backgroundColor: "#ffffff" },
				},
				...outputs(),
			})
		).rejects.toThrow("already exists");
		expect(await repository.loadDesign({ projectId: "p1", cover })).toEqual(
			design
		);
	});
	it("copies every referenced file so deleting the original cannot break the copy", async () => {
		const design = await createDesign();
		const cover = await repository.saveRevision({
			projectId: "p1",
			design,
			...outputs(),
		});
		await repository.copyProject({
			sourceProjectId: "p1",
			targetProjectId: "p2",
			cover,
		});
		await repository.removeProject({ projectId: "p1" });
		expect(await repository.loadDesign({ projectId: "p2", cover })).toEqual(
			design
		);
		for (const asset of [
			design.layers[0].asset,
			cover.render,
			cover.thumbnail,
		]) {
			await expect(
				repository.readAsset({ projectId: "p2", asset })
			).resolves.toBeInstanceOf(Blob);
		}
	});
	it("rejects a read-back belonging to a different revision", async () => {
		const design = await createDesign();
		const cover = await repository.saveRevision({
			projectId: "p1",
			design,
			...outputs(),
		});
		records.set(
			`p1/${cover.designPath}`,
			new Blob([JSON.stringify({ ...design, revision: 2 })])
		);
		await expect(
			repository.loadDesign({ projectId: "p1", cover })
		).rejects.toThrow("binding");
	});
});
