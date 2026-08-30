import { describe, expect, it } from "vitest";
import { resolveNormalizedStickerEvidenceRegion } from "./sticker-lab-stratified-timeline-evidence";

describe("stratified Sticker Lab timeline evidence geometry", () => {
	it("normalizes canonical size against the short side on a landscape canvas", () => {
		expect(
			resolveNormalizedStickerEvidenceRegion({
				canvasSize: { height: 1080, width: 1920 },
				geometry: { height: 10, width: 20, x: 50, y: 50 },
			})
		).toEqual({
			height: 0.1,
			width: 0.1125,
			x: 0.44375,
			y: 0.45,
		});
	});

	it("normalizes the same canonical size against a portrait canvas", () => {
		expect(
			resolveNormalizedStickerEvidenceRegion({
				canvasSize: { height: 1920, width: 1080 },
				geometry: { height: 10, width: 20, x: 50, y: 50 },
			})
		).toEqual({
			height: 0.05625,
			width: 0.2,
			x: 0.4,
			y: 0.471875,
		});
	});

	it("preserves off-canvas bounds for edge-centered stickers", () => {
		expect(
			resolveNormalizedStickerEvidenceRegion({
				canvasSize: { height: 600, width: 800 },
				geometry: { height: 100, width: 100, x: 0, y: 100 },
			})
		).toEqual({
			height: 1,
			width: 0.75,
			x: -0.375,
			y: 0.5,
		});
	});
});
