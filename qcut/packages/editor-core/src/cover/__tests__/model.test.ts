import { describe, expect, it } from "vitest";
import { applyCoverTemplate, COVER_TEMPLATES } from "../templates";
import {
	createCoverText,
	reduceCoverHistory,
	updateCoverText,
} from "../editing";
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
	it.each(COVER_TEMPLATES)("creates valid editable $id templates", ({ id }) => {
		const next = applyCoverTemplate({ design, templateId: id });
		expect(() =>
			assertCoverDesign({ design: JSON.parse(JSON.stringify(next)) })
		).not.toThrow();
		expect(next.layers[0]).toBe(design.layers[0]);
		expect(next.layers.length).toBe(id === "none" ? 1 : 3);
	});
	it("switches only template-owned layers and preserves manual text", () => {
		const manual = createCoverText({
			canvas: design.canvas,
			content: "我的标题",
			id: "manual",
		});
		const custom: CoverDesignV1 = {
			...design,
			layers: [design.layers[0], manual],
		};
		const first = applyCoverTemplate({ design: custom, templateId: "travel" });
		const second = applyCoverTemplate({ design: first, templateId: "journal" });
		expect(second.layers).toHaveLength(4);
		expect(second.layers[1]).toEqual(manual);
		expect(
			applyCoverTemplate({ design: second, templateId: "none" }).layers
		).toEqual(custom.layers);
		expect(() =>
			applyCoverTemplate({ design, templateId: "remote-unknown" })
		).toThrow();
	});
	it.each([
		{ x: NaN },
		{ fontSize: 0 },
		{ height: -1 },
		{ rotation: Infinity },
		{ color: "url(secret)" },
		{ fontFamily: "unknown" },
		{ bold: 1 },
		{ content: "x".repeat(2001) },
	])("rejects malformed text %j", (changes) => {
		const layer = {
			...createCoverText({
				canvas: design.canvas,
				content: "Title",
				id: "text",
			}),
			...changes,
		};
		expect(() =>
			assertCoverDesign({
				design: {
					...design,
					layers: [design.layers[0], layer],
				} as CoverDesignV1,
			})
		).toThrow();
	});
	it("rejects invalid crop coordinates and excess layers", () => {
		expect(() =>
			assertCoverDesign({
				design: {
					...design,
					layers: [
						{ ...design.layers[0], position: { x: 2, y: 0.5, zoom: 1 } },
					],
				},
			})
		).toThrow();
		const texts = Array.from({ length: 21 }, (_, index) =>
			createCoverText({
				canvas: design.canvas,
				content: "Title",
				id: `text-${index}`,
			})
		);
		expect(() =>
			assertCoverDesign({
				design: { ...design, layers: [design.layers[0], ...texts] },
			})
		).toThrow();
	});
	it("undoes a whole template and invalidates redo on new edits", () => {
		const first = { past: [], present: design, future: [] };
		const next = applyCoverTemplate({ design, templateId: "travel" });
		const edited = reduceCoverHistory(first, { type: "edit", design: next });
		const undone = reduceCoverHistory(edited, { type: "undo" });
		expect(undone.present).toBe(design);
		expect(reduceCoverHistory(undone, { type: "redo" }).present).toBe(next);
		expect(
			reduceCoverHistory(undone, {
				type: "edit",
				design: applyCoverTemplate({ design, templateId: "journal" }),
			}).future
		).toEqual([]);
	});
	it("bounds history and preserves unrelated layers during text edits", () => {
		let state = {
			past: [] as CoverDesignV1[],
			present: design as CoverDesignV1 | null,
			future: [] as CoverDesignV1[],
		};
		for (let index = 0; index < 80; index += 1)
			state = reduceCoverHistory(state, {
				type: "edit",
				design: { ...design, updatedAt: new Date(index * 1000).toISOString() },
			});
		expect(state.past).toHaveLength(60);
		const template = applyCoverTemplate({ design, templateId: "travel" });
		const edited = updateCoverText({
			design: template,
			id: template.layers[1].id,
			changes: { color: "#00ff00", x: 0.7 },
		});
		expect(edited.layers[0]).toBe(template.layers[0]);
		expect(edited.layers[2]).toBe(template.layers[2]);
		expect(edited.layers[1]).toMatchObject({ color: "#00ff00", x: 0.7 });
	});
});
