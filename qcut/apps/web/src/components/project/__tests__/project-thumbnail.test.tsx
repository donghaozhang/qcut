import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { CoverAssetRefV1 } from "@qcut/editor-core/cover";
import { ProjectThumbnail } from "../project-thumbnail";

const readAsset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cover/cover-repository", () => ({
	coverRepository: { readAsset },
}));

const hash = "a".repeat(64);
const asset: CoverAssetRefV1 = {
	assetId: hash,
	sha256: hash,
	relativePath: `cover/objects/${hash}.webp`,
	mimeType: "image/webp",
	width: 640,
	height: 360,
	byteLength: 10,
};
const project: TProject = {
	id: "p1",
	name: "Cover test",
	thumbnail: "legacy.jpg",
	createdAt: new Date(),
	updatedAt: new Date(),
	scenes: [],
	currentSceneId: "scene-1",
	canvasSize: { width: 640, height: 360 },
	canvasMode: "custom",
	cover: {
		schemaVersion: 1,
		designId: "d1",
		designRevision: 1,
		designPath: "cover/designs/d1/1.json",
		canvas: { width: 640, height: 360 },
		source: { kind: "local-image", originalName: "test.png" },
		updatedAt: "2026-09-05T00:00:00.000Z",
		render: {
			...asset,
			mimeType: "image/png",
			relativePath: `cover/objects/${hash}.png`,
		},
		thumbnail: asset,
	},
};
const getProjectThumbnail = vi.fn();

describe("ProjectThumbnail", () => {
	beforeEach(() => {
		readAsset.mockReset().mockResolvedValue(new Blob(["preview"]));
		getProjectThumbnail.mockReset().mockResolvedValue("regenerated.jpg");
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover-preview");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});
	it("prefers explicit cover bytes and releases the object URL", async () => {
		const { unmount } = render(
			<ProjectThumbnail
				project={project}
				getProjectThumbnail={getProjectThumbnail}
			/>
		);
		await waitFor(() =>
			expect(screen.getByAltText("Project thumbnail")).toHaveAttribute(
				"src",
				"blob:cover-preview"
			)
		);
		expect(getProjectThumbnail).not.toHaveBeenCalled();
		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cover-preview");
	});
	it("falls back to the normal thumbnail when cover bytes are missing", async () => {
		readAsset.mockRejectedValueOnce(new Error("missing"));
		render(
			<ProjectThumbnail
				project={project}
				getProjectThumbnail={getProjectThumbnail}
			/>
		);
		await waitFor(() =>
			expect(screen.getByAltText("Project thumbnail")).toHaveAttribute(
				"src",
				"legacy.jpg"
			)
		);
	});
	it("regenerates stale blob thumbnails and handles clearing the cover", async () => {
		const { rerender } = render(
			<ProjectThumbnail
				project={project}
				getProjectThumbnail={getProjectThumbnail}
			/>
		);
		await waitFor(() =>
			expect(screen.getByAltText("Project thumbnail")).toHaveAttribute(
				"src",
				"blob:cover-preview"
			)
		);
		rerender(
			<ProjectThumbnail
				project={{
					...project,
					cover: undefined,
					thumbnail: "blob:old-session",
				}}
				getProjectThumbnail={getProjectThumbnail}
			/>
		);
		await waitFor(() =>
			expect(screen.getByAltText("Project thumbnail")).toHaveAttribute(
				"src",
				"regenerated.jpg"
			)
		);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cover-preview");
	});
	it("does not allocate an object URL after unmount during a pending read", async () => {
		let resolveRead: (blob: Blob) => void = () => {};
		readAsset.mockImplementationOnce(
			() =>
				new Promise<Blob>((resolve) => {
					resolveRead = resolve;
				})
		);
		const { unmount } = render(
			<ProjectThumbnail
				project={project}
				getProjectThumbnail={getProjectThumbnail}
			/>
		);
		unmount();
		await act(async () => resolveRead(new Blob(["late preview"])));
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});
});
