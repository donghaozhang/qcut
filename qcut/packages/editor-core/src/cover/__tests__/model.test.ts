import { describe, expect, it } from "vitest";
import {
	assertCoverAsset,
	assertCoverCanvas,
	assertCoverDesign,
	assertCoverSource,
	assertProjectCover,
	type CoverAssetRefV1,
	type CoverDesignV1,
	type ProjectCoverBindingV1,
} from "../model";

const hash = "a".repeat(64);
const asset: CoverAssetRefV1 = {
	assetId: hash,
	sha256: hash,
	relativePath: `cover/objects/${hash}.png`,
	mimeType: "image/png",
	width: 1080,
	height: 1920,
	byteLength: 100,
};
const design: CoverDesignV1 = {
	schema: "qcut.cover-design",
	schemaVersion: 1,
	id: "design-1",
	revision: 1,
	canvas: { width: 1080, height: 1920, backgroundColor: "#000000" },
	source: {
		kind: "timeline-frame",
		sceneId: "scene-1",
		frame: 75,
		fps: 30,
		timeSeconds: 2.5,
	},
	layers: [{ id: "image-1", kind: "image", asset, fit: "contain" }],
	createdAt: "2026-09-05T00:00:00.000Z",
	updatedAt: "2026-09-05T00:00:00.000Z",
};
const binding: ProjectCoverBindingV1 = {
	schemaVersion: 1,
	designId: design.id,
	designRevision: 1,
	designPath: "cover/designs/design-1/1.json",
	render: asset,
	thumbnail: {
		...asset,
		relativePath: `cover/objects/${hash}.webp`,
		mimeType: "image/webp",
		width: 640,
		height: 360,
	},
	source: design.source,
	canvas: design.canvas,
	updatedAt: design.updatedAt,
};

describe("cover domain", () => {
	it("round-trips an image design and its explicit project binding", () => {
		expect(() =>
			assertCoverDesign({ design: JSON.parse(JSON.stringify(design)) })
		).not.toThrow();
		expect(() => assertProjectCover({ cover: binding })).not.toThrow();
	});
	it.each([
		NaN,
		Infinity,
		-2,
		0,
		1,
		1.5,
		8193,
	])("rejects invalid canvas dimension %s", (width) => {
		expect(() => assertCoverCanvas({ width, height: 1080 })).toThrow();
	});
	it("bounds total pixels separately from each edge", () => {
		expect(() => assertCoverCanvas({ width: 8192, height: 8192 })).toThrow();
	});
	it.each([
		"../image.png",
		"cover/../image.png",
		"/cover/image.png",
		"cover\\objects\\image.png",
		"https://example.com/image.png",
	])("rejects unsafe path %s", (relativePath) => {
		expect(() =>
			assertCoverAsset({ asset: { ...asset, relativePath } })
		).toThrow();
	});
	it("rejects mismatched digest, extension and output sizes", () => {
		expect(() =>
			assertCoverAsset({ asset: { ...asset, sha256: "b".repeat(64) } })
		).toThrow();
		expect(() =>
			assertCoverAsset({ asset: { ...asset, mimeType: "image/webp" } })
		).toThrow();
		expect(() =>
			assertProjectCover({
				cover: { ...binding, canvas: { width: 1920, height: 1080 } },
			})
		).toThrow();
		expect(() =>
			assertProjectCover({
				cover: { ...binding, thumbnail: { ...binding.thumbnail, width: 320 } },
			})
		).toThrow();
	});
	it("rejects unsupported schemas and layers rather than silently losing edits", () => {
		expect(() =>
			assertCoverDesign({
				design: { ...design, schemaVersion: 2 } as unknown as CoverDesignV1,
			})
		).toThrow();
		expect(() =>
			assertCoverDesign({ design: { ...design, layers: [] } })
		).toThrow();
		expect(() =>
			assertCoverDesign({
				design: { ...design, layers: [...design.layers, ...design.layers] },
			})
		).toThrow();
	});
	it("requires exact frame provenance", () => {
		expect(() =>
			assertCoverSource({
				source: {
					kind: "timeline-frame",
					sceneId: "s",
					frame: 75,
					fps: 30,
					timeSeconds: 3,
				},
			})
		).toThrow();
		expect(() =>
			assertCoverSource({
				source: {
					kind: "timeline-frame",
					sceneId: "s",
					frame: 1,
					fps: 0,
					timeSeconds: 0,
				},
			})
		).toThrow();
	});
});
