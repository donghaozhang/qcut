/**
 * Decides when a frame's colour work can run on the GPU, and bakes the
 * per-pixel part of the settings into a cube the shader can sample.
 *
 * `transformColorPixel` is a pure function of the input colour — LUT, curves,
 * HSL, smart tone — so it can be baked into a 3D lookup once per settings
 * change and then applied by the hardware. Vignette, grain, sharpness and
 * masks are spatial and stay on the CPU path.
 *
 * @module lib/color/gpu-color-path
 */

import type { ColorCubeLut, MediaColorSettings } from "@/types/timeline";
import { transformColorPixel } from "./color-pixel-processor";
import { createGpuLutRenderer, type GpuLutRenderer } from "./gpu-lut-renderer";

/**
 * 33 keeps the bake under ~36k lookups — a few milliseconds — while staying
 * fine enough that the hardware's trilinear blend is well inside a single
 * 8-bit level for the smooth transforms these settings produce.
 */
const BAKE_SIZE = 33;

/** True when every enabled effect is a per-pixel colour transform. */
export function isGpuEligible({
	settings,
}: {
	settings: MediaColorSettings;
}): boolean {
	const basic = settings.basic;
	if (!basic?.enabled) return true;
	// These three read neighbouring pixels or the pixel's position, so a colour
	// cube cannot express them.
	return (
		(basic.vignette ?? 0) === 0 &&
		(basic.grain ?? 0) === 0 &&
		(basic.sharpness ?? 0) === 0
	);
}

function settingsFingerprint({
	settings,
}: {
	settings: MediaColorSettings;
}): string {
	return JSON.stringify(settings);
}

let cachedCube: { key: string; cube: ColorCubeLut } | null = null;

/**
 * Bakes the per-pixel transform into a cube, reusing the last one when the
 * settings have not changed — rebaking every frame would cost more than the
 * CPU path it replaces.
 */
export function bakeColorCube({
	settings,
}: {
	settings: MediaColorSettings;
}): ColorCubeLut {
	const key = settingsFingerprint({ settings });
	if (cachedCube?.key === key) return cachedCube.cube;

	const values: number[] = [];
	for (let blue = 0; blue < BAKE_SIZE; blue += 1) {
		for (let green = 0; green < BAKE_SIZE; green += 1) {
			for (let red = 0; red < BAKE_SIZE; red += 1) {
				const graded = transformColorPixel({
					color: {
						r: red / (BAKE_SIZE - 1),
						g: green / (BAKE_SIZE - 1),
						b: blue / (BAKE_SIZE - 1),
					},
					settings,
				});
				values.push(graded.r, graded.g, graded.b);
			}
		}
	}
	const cube: ColorCubeLut = {
		size: BAKE_SIZE,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values,
	};
	cachedCube = { key, cube };
	return cube;
}

let renderer: GpuLutRenderer | null = null;
let rendererTried = false;

/** Shared renderer; a WebGL2 context per frame would undo the speed-up. */
function sharedRenderer(): GpuLutRenderer | null {
	if (!rendererTried) {
		rendererTried = true;
		try {
			renderer = createGpuLutRenderer();
		} catch {
			renderer = null;
		}
	}
	return renderer;
}

/**
 * Grades a frame on the GPU, or returns null when the caller should stay on
 * the CPU path (spatial effects present, or no WebGL2).
 */
export function gradeFrameOnGpu({
	source,
	width,
	height,
	settings,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
	settings: MediaColorSettings;
}): HTMLCanvasElement | null {
	if (!isGpuEligible({ settings })) return null;
	const gpu = sharedRenderer();
	if (!gpu) return null;
	try {
		return gpu.render({
			source,
			width,
			height,
			cube: bakeColorCube({ settings }),
			// The bake already carries intensity, so the shader mixes fully.
			intensity: 1,
		});
	} catch {
		return null;
	}
}

/** Test seam: drops the cached renderer and cube. */
export function resetGpuColorPath(): void {
	renderer?.dispose();
	renderer = null;
	rendererTried = false;
	cachedCube = null;
}
