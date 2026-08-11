import { afterEach, describe, expect, it } from "vitest";
import type { ColorCubeLut } from "@/types/timeline";
import { sampleCubeLut } from "../color-space-math";
import { createGpuLutRenderer } from "../gpu-lut-renderer";

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

/**
 * jsdom has no WebGL2, so the texture-cache behaviour is exercised against a
 * recording stub: only creations, uploads (texImage3D), 3D binds and deletions
 * matter to the cache contract, everything else is a no-op.
 */
interface FakeGlState {
	createdTextures: object[];
	deletedTextures: object[];
	lutUploads: number;
}

const TEXTURE_3D_TARGET = 11;

function createFakeGl(): {
	context: WebGL2RenderingContext;
	state: FakeGlState;
} {
	const state: FakeGlState = {
		createdTextures: [],
		deletedTextures: [],
		lutUploads: 0,
	};
	const noop = () => {};
	const fake = {
		VERTEX_SHADER: 1,
		FRAGMENT_SHADER: 2,
		COMPILE_STATUS: 3,
		LINK_STATUS: 4,
		ARRAY_BUFFER: 5,
		STATIC_DRAW: 6,
		FLOAT: 7,
		TEXTURE0: 8,
		TEXTURE1: 9,
		TEXTURE_2D: 10,
		TEXTURE_3D: TEXTURE_3D_TARGET,
		RGB8: 12,
		RGB: 13,
		RGBA: 14,
		UNSIGNED_BYTE: 15,
		TEXTURE_MIN_FILTER: 16,
		TEXTURE_MAG_FILTER: 17,
		TEXTURE_WRAP_S: 18,
		TEXTURE_WRAP_T: 19,
		TEXTURE_WRAP_R: 20,
		LINEAR: 21,
		CLAMP_TO_EDGE: 22,
		UNPACK_ALIGNMENT: 23,
		UNPACK_FLIP_Y_WEBGL: 24,
		TRIANGLES: 25,
		createShader: () => ({}),
		shaderSource: noop,
		compileShader: noop,
		getShaderParameter: () => true,
		deleteShader: noop,
		createProgram: () => ({}),
		attachShader: noop,
		linkProgram: noop,
		getProgramParameter: () => true,
		deleteProgram: noop,
		createBuffer: () => ({}),
		bindBuffer: noop,
		bufferData: noop,
		deleteBuffer: noop,
		getAttribLocation: () => 0,
		enableVertexAttribArray: noop,
		vertexAttribPointer: noop,
		createTexture: () => {
			const texture = {};
			state.createdTextures.push(texture);
			return texture;
		},
		deleteTexture: (texture: object) => {
			state.deletedTextures.push(texture);
		},
		getUniformLocation: () => ({}),
		viewport: noop,
		useProgram: noop,
		activeTexture: noop,
		bindTexture: noop,
		pixelStorei: noop,
		texImage2D: noop,
		texImage3D: () => {
			state.lutUploads += 1;
		},
		texParameteri: noop,
		uniform1i: noop,
		uniform1f: noop,
		drawArrays: noop,
	};
	return { context: fake as unknown as WebGL2RenderingContext, state };
}

function smallCube(): ColorCubeLut {
	return {
		size: 2,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values: Array.from({ length: 24 }, () => 0.5),
	};
}

describe("GPU LUT texture cache", () => {
	const originalGetContext = HTMLCanvasElement.prototype.getContext;

	afterEach(() => {
		HTMLCanvasElement.prototype.getContext = originalGetContext;
	});

	function rendererWithFakeGl() {
		const fake = createFakeGl();
		HTMLCanvasElement.prototype.getContext = ((kind: string) =>
			kind === "webgl2"
				? fake.context
				: null) as unknown as (typeof HTMLCanvasElement.prototype)["getContext"];
		const renderer = createGpuLutRenderer();
		if (!renderer) throw new Error("Fake WebGL2 context was not picked up");
		return { renderer, state: fake.state };
	}

	function renderCube(
		renderer: NonNullable<ReturnType<typeof createGpuLutRenderer>>,
		cube: ColorCubeLut
	) {
		renderer.render({
			source: {} as unknown as CanvasImageSource,
			width: 4,
			height: 4,
			cube,
			intensity: 1,
		});
	}

	it("uploads a cube once and reuses its texture across frames", () => {
		const { renderer, state } = rendererWithFakeGl();
		const cube = smallCube();
		renderCube(renderer, cube);
		renderCube(renderer, cube);
		renderCube(renderer, cube);
		expect(state.lutUploads).toBe(1);
	});

	it("keeps textures warm while two cubes alternate", () => {
		// Two visible elements with different grades alternate every frame; a
		// single uploaded-cube slot would re-upload on each call.
		const { renderer, state } = rendererWithFakeGl();
		const first = smallCube();
		const second = smallCube();
		renderCube(renderer, first);
		renderCube(renderer, second);
		renderCube(renderer, first);
		renderCube(renderer, second);
		expect(state.lutUploads).toBe(2);
		expect(state.deletedTextures).toHaveLength(0);
	});

	it("evicts the least recently used texture at capacity", () => {
		const { renderer, state } = rendererWithFakeGl();
		const cubes = Array.from({ length: 5 }, () => smallCube());
		for (const cube of cubes.slice(0, 4)) {
			renderCube(renderer, cube);
		}
		expect(state.lutUploads).toBe(4);
		expect(state.deletedTextures).toHaveLength(0);

		// Touch the oldest so recency — not insertion — decides the eviction.
		renderCube(renderer, cubes[0]);
		expect(state.lutUploads).toBe(4);

		renderCube(renderer, cubes[4]);
		expect(state.lutUploads).toBe(5);
		expect(state.deletedTextures).toHaveLength(1);

		// The refreshed cube survived; the second-oldest was re-uploaded.
		renderCube(renderer, cubes[0]);
		expect(state.lutUploads).toBe(5);
		renderCube(renderer, cubes[1]);
		expect(state.lutUploads).toBe(6);
	});

	it("deletes every texture on dispose", () => {
		const { renderer, state } = rendererWithFakeGl();
		renderCube(renderer, smallCube());
		renderCube(renderer, smallCube());
		renderer.dispose();
		// Frame texture plus both cached LUT textures.
		expect(state.deletedTextures).toHaveLength(state.createdTextures.length);
		for (const texture of state.createdTextures) {
			expect(state.deletedTextures).toContain(texture);
		}
	});
});
