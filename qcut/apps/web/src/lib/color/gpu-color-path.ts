/**
 * Decides when a frame's colour work can run on the GPU, and bakes the
 * per-pixel part of the settings into a cube the shader can sample.
 *
 * `transformColorPixel` is a pure function of the input colour — LUT, curves,
 * HSL, smart tone — so it can be baked into a 3D lookup once per settings
 * change and then applied by the hardware. Vignette, grain and sharpness run
 * as shader stages, and grade masks arrive as an alpha texture; only
 * multi-pass long-tail operations still force the CPU path.
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

/** True when the shader path can express every enabled effect. */
export function isGpuEligible({
	settings,
}: {
	settings: MediaColorSettings;
}): boolean {
	// Multi-pass long-tail operations mix temporal and iterative work the
	// single-draw shader cannot express.
	return !settings.multiPass?.enabled;
}

/**
 * A Filter-Lab LUT stores its cube inline in settings (65^3 x 3 values), so the
 * fingerprint swaps the cube for an identity token instead of serialising it.
 * Cube objects live in the zustand store and are referentially stable, which
 * makes identity a correct — and O(1) — proxy for their contents.
 */
const cubeTokens = new WeakMap<object, number>();
let nextCubeToken = 1;

function cubeToken({ cube }: { cube: object }): number {
	let token = cubeTokens.get(cube);
	if (token === undefined) {
		token = nextCubeToken;
		nextCubeToken += 1;
		cubeTokens.set(cube, token);
	}
	return token;
}

function settingsFingerprint({
	settings,
}: {
	settings: MediaColorSettings;
}): string {
	const cube = settings.lut?.cube;
	// The bake only captures the per-pixel colour transform; spatial stages
	// (vignette/grain/sharpness, grade masks, multi-pass) run outside the
	// cube, so normalising them out keeps the cache warm while their sliders
	// move.
	const normalizedSettings: MediaColorSettings = {
		...settings,
		multiPass: undefined,
		mask: { ...settings.mask, enabled: false, maskIds: [] },
		basic: settings.basic
			? { ...settings.basic, vignette: 0, grain: 0, sharpness: 0 }
			: settings.basic,
	};
	if (!cube) return JSON.stringify(normalizedSettings);
	const skinCube = settings.lut.dual?.skinCube;
	return JSON.stringify({
		...normalizedSettings,
		lut: {
			...settings.lut,
			cube: cubeToken({ cube }),
			...(settings.lut.dual
				? {
						dual: {
							...settings.lut.dual,
							skinCube: skinCube ? cubeToken({ cube: skinCube }) : undefined,
						},
					}
				: {}),
		},
	});
}

/** Two visible elements alternating per frame must each keep a warm entry. */
const BAKE_CACHE_LIMIT = 8;
const bakedCubes = new Map<string, ColorCubeLut>();
let bakeCount = 0;

/** Test seam: full bakes performed since the last {@link resetGpuColorPath}. */
export function __bakeCountForTests(): number {
	return bakeCount;
}

/**
 * Bakes the per-pixel transform into a cube, reusing a cached one when the
 * settings have not changed — rebaking every frame would cost more than the
 * CPU path it replaces.
 */
export function bakeColorCube({
	settings,
}: {
	settings: MediaColorSettings;
}): ColorCubeLut {
	const key = settingsFingerprint({ settings });
	const cached = bakedCubes.get(key);
	if (cached) {
		// Re-insert so the Map's insertion order tracks recency of use.
		bakedCubes.delete(key);
		bakedCubes.set(key, cached);
		return cached;
	}

	bakeCount += 1;
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
	if (bakedCubes.size >= BAKE_CACHE_LIMIT) {
		const oldest = bakedCubes.keys().next().value;
		if (oldest !== undefined) bakedCubes.delete(oldest);
	}
	bakedCubes.set(key, cube);
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
 * the CPU path (multi-pass operations present, no WebGL2, or a grade mask
 * whose pixels do not match the frame dimensions).
 */
export function gradeFrameOnGpu({
	source,
	width,
	height,
	settings,
	frameSeed = 0,
	gradeMask,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
	settings: MediaColorSettings;
	frameSeed?: number;
	/** RGBA pixels (width x height) whose alpha weights the grade. */
	gradeMask?: Uint8ClampedArray;
}): HTMLCanvasElement | null {
	if (!isGpuEligible({ settings })) return null;
	if (gradeMask && gradeMask.length !== width * height * 4) return null;
	const gpu = sharedRenderer();
	if (!gpu) return null;
	const basic = settings.basic?.enabled ? settings.basic : null;
	const sharpness = basic?.sharpness ?? 0;
	try {
		return gpu.render({
			source,
			width,
			height,
			cube: bakeColorCube({ settings }),
			// The bake already carries intensity, so the shader mixes fully.
			intensity: 1,
			spatial: {
				vignette: (basic?.vignette ?? 0) / 100,
				grain: (basic?.grain ?? 0) / 100,
				grainSeed: frameSeed,
				// The CPU kernel needs at least a 3x3 frame to sharpen.
				sharpness:
					sharpness > 0 && width >= 3 && height >= 3
						? Math.min(2, sharpness / 50)
						: 0,
				mask: gradeMask,
			},
		});
	} catch {
		return null;
	}
}

/** Test seam: drops the cached renderer, baked cubes and bake counter. */
export function resetGpuColorPath(): void {
	renderer?.dispose();
	renderer = null;
	rendererTried = false;
	bakedCubes.clear();
	bakeCount = 0;
}
