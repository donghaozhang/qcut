import { describe, expect, it } from "vitest";
import {
	buildLutMaskExpectedArgs,
	compareLutMaskProbes,
	LUT_MASK_PROBES,
} from "../capcut-e2e/visual-lut-mask.js";

const GEOMETRY = { height: 20, width: 20 };

function setRgba({
	pixels,
	rgba,
	x,
	y,
}: {
	pixels: Uint8Array;
	rgba: readonly [number, number, number, number];
	x: number;
	y: number;
}): void {
	const offset = (y * GEOMETRY.width + x) * 4;
	pixels.set(rgba, offset);
}

function expectedPixels(): Uint8Array {
	const pixels = new Uint8Array(GEOMETRY.width * GEOMETRY.height * 4);
	for (const definition of LUT_MASK_PROBES) {
		const x = Math.round(definition.x * (GEOMETRY.width - 1));
		const y = Math.round(definition.y * (GEOMETRY.height - 1));
		setRgba({
			pixels,
			rgba:
				definition.region === "inside" ? [200, 150, 100, 255] : [30, 20, 10, 0],
			x,
			y,
		});
	}
	return pixels;
}

describe("CapCut E2E LUT/mask visual probes", () => {
	it("builds a lossless RGBA invert-LUT plus ellipse-mask command", () => {
		const args = buildLutMaskExpectedArgs({
			outputPath: "/output/expected.png",
			sourcePath: "/fixtures/frame-a.png",
		});
		const filterIndex = args.indexOf("-vf");
		const filter = args[filterIndex + 1];
		expect(args).toContain("/fixtures/frame-a.png");
		expect(args.at(-1)).toBe("/output/expected.png");
		expect(filter).toContain("lutrgb=r=negval:g=negval:b=negval");
		expect(filter).toContain("geq=");
		expect(args).toContain("rgba");
	});

	it("passes all four independent inside/outside probes", () => {
		const expected = expectedPixels();
		const comparison = compareLutMaskProbes({
			candidateGeometry: GEOMETRY,
			candidatePixels: expected.slice(),
			expectedGeometry: GEOMETRY,
			expectedPixels: expected,
		});
		expect(comparison.pass).toBe(true);
		expect(comparison.probes).toHaveLength(4);
		expect(comparison.probes.every(({ pass }) => pass)).toBe(true);
	});

	it("fails an incorrect inside LUT pixel independently", () => {
		const expected = expectedPixels();
		const candidate = expected.slice();
		setRgba({ pixels: candidate, rgba: [0, 0, 0, 255], x: 10, y: 10 });
		const comparison = compareLutMaskProbes({
			candidateGeometry: GEOMETRY,
			candidatePixels: candidate,
			expectedGeometry: GEOMETRY,
			expectedPixels: expected,
		});
		expect(comparison.pass).toBe(false);
		expect(comparison.probes.find(({ id }) => id === "center")?.pass).toBe(
			false
		);
	});

	it("fails an opaque non-black outside-mask pixel", () => {
		const expected = expectedPixels();
		const candidate = expected.slice();
		setRgba({ pixels: candidate, rgba: [50, 50, 50, 255], x: 17, y: 10 });
		const comparison = compareLutMaskProbes({
			candidateGeometry: GEOMETRY,
			candidatePixels: candidate,
			expectedGeometry: GEOMETRY,
			expectedPixels: expected,
		});
		expect(comparison.pass).toBe(false);
		expect(
			comparison.probes.find(({ id }) => id === "outside-right")?.pass
		).toBe(false);
	});

	it("retains all four locked probes when dimensions mismatch", () => {
		const expected = expectedPixels();
		const candidateGeometry = { height: 20, width: 19 };
		const comparison = compareLutMaskProbes({
			candidateGeometry,
			candidatePixels: new Uint8Array(
				candidateGeometry.width * candidateGeometry.height * 4
			),
			expectedGeometry: GEOMETRY,
			expectedPixels: expected,
		});
		expect(comparison.dimensionsMatch).toBe(false);
		expect(comparison.pass).toBe(false);
		expect(comparison.probes.map(({ id }) => id)).toEqual(
			LUT_MASK_PROBES.map(({ id }) => id)
		);
	});
});
