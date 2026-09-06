import { describe, expect, it } from "vitest";
import {
	createCoverText,
	assertCoverText,
	type CoverDesignV1,
} from "@qcut/editor-core/cover";
import { applyPrivateCoverTextLayout } from "../private-cover-layout";
import {
	parseCoverTextLayout,
	type CoverTextLayout,
} from "../../../../../../electron/jianying-cover-layout";
import { coverLayoutFixture } from "../../../../../../electron/__tests__/fixtures/cover-layout";

const canvas = { width: 1280, height: 720, backgroundColor: "#000000" };
const hash = "a".repeat(64);
const design: CoverDesignV1 = {
	schema: "qcut.cover-design",
	schemaVersion: 1,
	id: "test",
	revision: 1,
	canvas,
	source: { kind: "local-image", originalName: "fixture.png" },
	layers: [
		{
			kind: "image",
			id: "image",
			asset: {
				assetId: hash,
				sha256: hash,
				relativePath: `cover/objects/${hash}.png`,
				width: 1280,
				height: 720,
				byteLength: 12,
				mimeType: "image/png",
			},
			fit: "cover",
			position: { x: 0.2, y: 0.7, zoom: 1.5 },
		},
	],
	createdAt: "2026-09-06T00:00:00Z",
	updatedAt: "2026-09-06T00:00:00Z",
};
function fixture() {
	const source = coverLayoutFixture();
	const parsed = parseCoverTextLayout({ definition: source.definition });
	const layout: CoverTextLayout = {
		packageHash: "b".repeat(32),
		...parsed,
		wordArt: {},
		fonts: {
			[source.fontReference]: {
				fontId: `sha256:${hash}`,
				cssFamily: `QCutLocal_${hash.slice(0, 20)}`,
				familyName: "Fixture",
				fullName: "Fixture Regular",
				postscriptName: "Fixture-Regular",
				subfamilyName: "Regular",
				format: "ttf",
				size: 12,
				sourceKinds: ["qcut-cache"],
			},
		},
	};
	const ctx = {
		font: "",
		measureText: (text: string) => ({ width: text.length * 40 }),
	} as unknown as CanvasRenderingContext2D;
	return { layout, ctx, source };
}
describe("private cover layout application", () => {
	it.each([
		[-180, -90],
		[0, 90],
		[90, 180],
		[100, -170],
		[180, -90],
	])("maps sideways text rotation %s to %s without changing its source", (rotation, expected) => {
		const { layout, ctx } = fixture();
		layout.texts[0].text.typesetting = 1;
		layout.texts[0].text.content = "TRAVEL\nWITH FRIENDS";
		layout.texts[0].segment.clip.rotation = rotation;
		const next = applyPrivateCoverTextLayout({ design, layout, ctx });
		expect(next.layers[1]).toMatchObject({
			rotation: expected,
			content: "TRAVEL\nWITH FRIENDS",
			x: 0.25,
			y: 0.25,
			fontSize: 80,
		});
		expect(layout.texts[0].segment.clip.rotation).toBe(rotation);
		const restored = JSON.parse(JSON.stringify(next));
		expect(restored.layers[1]).toMatchObject({
			rotation: expected,
			content: "TRAVEL\nWITH FRIENDS",
			x: 0.25,
			y: 0.25,
			fontSize: 80,
		});
	});
	it("preserves background, crop and manual text while replacing the previous template", () => {
		const { layout, ctx } = fixture();
		const manual = createCoverText({
			canvas,
			content: "Keep me",
			id: "manual",
		});
		const old = { ...manual, id: "old-template", templateId: "old" };
		const result = applyPrivateCoverTextLayout({
			design: { ...design, layers: [design.layers[0], manual, old] },
			layout,
			ctx,
		});
		expect(result.layers[0]).toBe(design.layers[0]);
		expect(result.layers[1]).toBe(manual);
		expect(result.layers).toHaveLength(3);
		expect(result.layers[2]).toMatchObject({
			content: "Hello",
			x: 0.25,
			y: 0.25,
			fontSize: 80,
			opacity: 0.4,
			templateId: `jianying:${layout.packageHash}`,
		});
		expect(
			result.layers[2].kind === "text" && result.layers[2].fontAsset?.assetId
		).toBe(`sha256:${hash}`);
		expect(design.layers).toHaveLength(1);
	});
	it("preserves relative anchors and short-edge text scale on a portrait canvas", () => {
		const { layout, ctx } = fixture();
		const result = applyPrivateCoverTextLayout({
			design: { ...design, canvas: { ...canvas, width: 720, height: 1280 } },
			layout,
			ctx,
		});
		expect(result.layers[1]).toMatchObject({ fontSize: 80, x: 0.25 });
		expect(result.layers[1].kind === "text" && result.layers[1].y).toBeCloseTo(
			0.25
		);
	});
	it("retains the lab runtime identity and rejects missing effects instead of flattening", () => {
		const { layout, ctx, source } = fixture();
		layout.texts[0].text.use_effect_default_color = false;
		layout.texts[0].effect = { ...source.effect, type: "text_effect" };
		expect(() => applyPrivateCoverTextLayout({ design, layout, ctx })).toThrow(
			"word-art unavailable"
		);
		layout.wordArt[source.effectReference] = {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "InfoSticker",
			resourceId: "123",
			packageHash: "c".repeat(32),
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		};
		const result = applyPrivateCoverTextLayout({ design, layout, ctx });
		expect(result.layers[1]).toMatchObject({
			jianyingTextStyle: layout.wordArt[source.effectReference],
			nativeUseEffectDefaultColor: false,
		});
	});
	it("rejects missing font references and too many layers", () => {
		const { layout, ctx } = fixture();
		expect(() =>
			applyPrivateCoverTextLayout({
				design,
				layout: { ...layout, fonts: {} },
				ctx,
			})
		).toThrow("font unavailable");
		const manual = Array.from({ length: 20 }, (_, index) =>
			createCoverText({ canvas, content: "Manual", id: `m-${index}` })
		);
		expect(() =>
			applyPrivateCoverTextLayout({
				design: { ...design, layers: [design.layers[0], ...manual] },
				layout,
				ctx,
			})
		).toThrow("20 text");
	});
	it("validates persisted opacity including NaN and retains the old default", () => {
		const layer = createCoverText({ canvas, content: "Text", id: "opacity" });
		expect(() => assertCoverText({ layer })).not.toThrow();
		for (const opacity of [-1, 1.1, Number.NaN])
			expect(() => assertCoverText({ layer: { ...layer, opacity } })).toThrow();
		expect(() =>
			assertCoverText({ layer: { ...layer, opacity: 0 } })
		).not.toThrow();
	});
});
