import { describe, expect, it } from "vitest";
import { compareTransparentSticker } from "../capcut-e2e/visual-alpha.js";

const GEOMETRY = { height: 4, width: 5 };

function setPixel({
	alpha,
	blue,
	green,
	pixels,
	red,
	x,
	y,
}: {
	alpha: number;
	blue: number;
	green: number;
	pixels: Uint8Array;
	red: number;
	x: number;
	y: number;
}): void {
	const offset = (y * GEOMETRY.width + x) * 4;
	pixels.set([red, green, blue, alpha], offset);
}

function stickerPixels({
	opaqueBackground = false,
	xOffset = 0,
}: {
	opaqueBackground?: boolean;
	xOffset?: number;
} = {}): Uint8Array {
	const pixels = new Uint8Array(GEOMETRY.width * GEOMETRY.height * 4);
	if (opaqueBackground) {
		for (let offset = 3; offset < pixels.length; offset += 4)
			pixels[offset] = 255;
	}
	for (const [x, y] of [
		[1, 1],
		[2, 1],
		[1, 2],
		[2, 2],
	] as const) {
		setPixel({
			alpha: 255,
			blue: 200,
			green: 150,
			pixels,
			red: 100,
			x: x + xOffset,
			y,
		});
	}
	return pixels;
}

describe("CapCut E2E reopened sticker asset oracle", () => {
	it("passes an unchanged reopened RGBA asset", () => {
		const sourcePixels = stickerPixels();
		const comparison = compareTransparentSticker({
			reopenedAssetGeometry: GEOMETRY,
			reopenedAssetPixels: sourcePixels.slice(),
			sourceGeometry: GEOMETRY,
			sourcePixels,
		});
		expect(comparison.pass).toBe(true);
		expect(comparison.source).toEqual({
			bounds: { height: 2, maxX: 2, maxY: 2, minX: 1, minY: 1, width: 2 },
			coverageRatio: 0.2,
			visiblePixelCount: 4,
		});
		expect(comparison.reopenedAsset).toEqual(comparison.source);
		expect(comparison.alphaMae).toBe(0);
		expect(comparison.visibleRgb.pass).toBe(true);
	});

	it("fails when reopened visible bounds move by more than one pixel", () => {
		const comparison = compareTransparentSticker({
			reopenedAssetGeometry: GEOMETRY,
			reopenedAssetPixels: stickerPixels({ xOffset: 2 }),
			sourceGeometry: GEOMETRY,
			sourcePixels: stickerPixels(),
		});
		expect(comparison.boundsMaxDeltaPixels).toBe(2);
		expect(comparison.pass).toBe(false);
	});

	it("fails a flattened opaque background even when sticker pixels remain", () => {
		const comparison = compareTransparentSticker({
			reopenedAssetGeometry: GEOMETRY,
			reopenedAssetPixels: stickerPixels({ opaqueBackground: true }),
			sourceGeometry: GEOMETRY,
			sourcePixels: stickerPixels(),
		});
		expect(comparison.reopenedAsset.visiblePixelCount).toBe(20);
		expect(comparison.visiblePixelRelativeDelta).toBe(4);
		expect(comparison.pass).toBe(false);
	});

	it("rejects a source asset with no visible alpha", () => {
		expect(() =>
			compareTransparentSticker({
				reopenedAssetGeometry: GEOMETRY,
				reopenedAssetPixels: stickerPixels(),
				sourceGeometry: GEOMETRY,
				sourcePixels: new Uint8Array(GEOMETRY.width * GEOMETRY.height * 4),
			})
		).toThrow("Source sticker has no visible pixels");
	});
});
