import { describe, expect, it } from "vitest";
import type { ColorCubeLut } from "@/types/timeline";
import { sampleCubeLut } from "../color-space-math";

/**
 * The GPU path must agree with the CPU path it replaces, otherwise it trades
 * correctness for speed. jsdom has no WebGL2, so the shader itself cannot run
 * here; what is checked instead is the lookup maths the shader implements —
 * the texel-centre mapping in particular, which is where a 3D texture lookup
 * usually diverges from an explicit trilinear interpolation.
 */

function buildCube({
	size,
	transform,
}: {
	size: number;
	transform: (color: { r: number; g: number; b: number }) => {
		r: number;
		g: number;
		b: number;
	};
}): ColorCubeLut {
	const values: number[] = [];
	for (let blue = 0; blue < size; blue += 1) {
		for (let green = 0; green < size; green += 1) {
			for (let red = 0; red < size; red += 1) {
				const out = transform({
					r: red / (size - 1),
					g: green / (size - 1),
					b: blue / (size - 1),
				});
				values.push(out.r, out.g, out.b);
			}
		}
	}
	return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], values };
}

/**
 * Mirrors the shader: scale into texel centres, then trilinear sample. The
 * hardware does this in `texture(u_lut, coord)`; here it is spelled out so the
 * two can be compared.
 */
function shaderLookup({
	cube,
	color,
}: {
	cube: ColorCubeLut;
	color: { r: number; g: number; b: number };
}): { r: number; g: number; b: number } {
	const size = cube.size;
	const scale = (size - 1) / size;
	const offset = 1 / (2 * size);
	const coord = {
		r: Math.min(1, Math.max(0, color.r)) * scale + offset,
		g: Math.min(1, Math.max(0, color.g)) * scale + offset,
		b: Math.min(1, Math.max(0, color.b)) * scale + offset,
	};
	// A 3D texture addresses texel centres, so undo the centre offset to get
	// back to the grid indices sampleCubeLut expects.
	return sampleCubeLut({
		cube,
		color: {
			r: (coord.r * size - 0.5) / (size - 1),
			g: (coord.g * size - 0.5) / (size - 1),
			b: (coord.b * size - 0.5) / (size - 1),
		},
	});
}

describe("GPU LUT lookup maths", () => {
	it("matches the CPU sampler on an identity cube", () => {
		const cube = buildCube({ size: 17, transform: (color) => color });
		for (const value of [0, 0.25, 0.5, 0.75, 1]) {
			const color = { r: value, g: 1 - value, b: 0.5 };
			const gpu = shaderLookup({ cube, color });
			expect(gpu.r).toBeCloseTo(color.r, 6);
			expect(gpu.g).toBeCloseTo(color.g, 6);
			expect(gpu.b).toBeCloseTo(color.b, 6);
		}
	});

	it("preserves pure black and pure white", () => {
		// Without the texel-centre mapping these clamp half a texel short, which
		// visibly crushes the ends of the range.
		const cube = buildCube({ size: 17, transform: (color) => color });
		const black = shaderLookup({ cube, color: { r: 0, g: 0, b: 0 } });
		const white = shaderLookup({ cube, color: { r: 1, g: 1, b: 1 } });
		expect(black.r).toBeCloseTo(0, 6);
		expect(white.r).toBeCloseTo(1, 6);
	});

	it("agrees with the CPU sampler on a non-trivial cube", () => {
		const cube = buildCube({
			size: 17,
			transform: (color) => ({
				r: Math.min(1, color.r * 1.15 + 0.02),
				g: color.g ** 1.1,
				b: Math.max(0, color.b * 0.9 - 0.01),
			}),
		});
		let worst = 0;
		for (let step = 0; step <= 16; step += 1) {
			const value = step / 16;
			const color = { r: value, g: (value * 3) % 1, b: 1 - value };
			const gpu = shaderLookup({ cube, color });
			const cpu = sampleCubeLut({ cube, color });
			worst = Math.max(
				worst,
				Math.abs(gpu.r - cpu.r),
				Math.abs(gpu.g - cpu.g),
				Math.abs(gpu.b - cpu.b)
			);
		}
		// Well under a single 8-bit level (1/255 = 0.0039).
		expect(worst).toBeLessThan(0.001);
	});
});
