import { describe, expect, it } from "vitest";
import {
	computeShatterTiles,
	shatterNoise,
} from "../text-animation/shatter.js";
import type { TextAnimationShatterState } from "../text-animation/model.js";

function state(
	overrides: Partial<TextAnimationShatterState> = {}
): TextAnimationShatterState {
	return {
		progress: 0.5,
		tilePx: 4,
		distortionPx: 20,
		gravityPx: 30,
		gravityRotDeg: 0,
		front: "noise",
		frontRotDeg: 0,
		feather: 0.35,
		seed: 7,
		...overrides,
	};
}

describe("shatter tile math (LumiDust port)", () => {
	it("keeps every tile at rest before the sweep starts", () => {
		const tiles = computeShatterTiles({
			width: 40,
			height: 20,
			state: state({ progress: 0 }),
		});
		for (const tile of tiles) {
			expect(tile.dx).toBe(0);
			expect(tile.dy).toBe(0);
			expect(tile.alpha).toBe(1);
		}
	});

	it("releases every tile with faded residue at full sweep", () => {
		const tiles = computeShatterTiles({
			width: 40,
			height: 20,
			state: state({ progress: 1 }),
		});
		for (const tile of tiles) {
			expect(tile.alpha).toBeLessThan(0.05);
			expect(Math.hypot(tile.dx, tile.dy)).toBeGreaterThan(0);
		}
	});

	it("is deterministic and drifts released tiles apart", () => {
		const a = computeShatterTiles({ width: 40, height: 20, state: state() });
		const b = computeShatterTiles({ width: 40, height: 20, state: state() });
		expect(a).toEqual(b);
		const moved = a.filter((tile) => tile.dx !== 0 || tile.dy !== 0);
		expect(moved.length).toBeGreaterThan(0);
		expect(
			new Set(
				moved.map((tile) => `${tile.dx.toFixed(4)},${tile.dy.toFixed(4)}`)
			).size
		).toBe(moved.length);
	});

	it("advances the release front monotonically per tile", () => {
		const early = computeShatterTiles({
			width: 40,
			height: 20,
			state: state({ progress: 0.3 }),
		});
		const late = computeShatterTiles({
			width: 40,
			height: 20,
			state: state({ progress: 0.7 }),
		});
		for (const [index, tile] of early.entries()) {
			expect(late[index].alpha).toBeLessThanOrEqual(tile.alpha + 1e-9);
		}
	});

	it("sweeps a wipe front across the line by angle", () => {
		const tiles = computeShatterTiles({
			width: 40,
			height: 8,
			state: state({ front: "wipe", progress: 0.5, feather: 0.1 }),
		});
		// Left half released, right half still intact for a 0° wipe.
		const first = tiles[0];
		const last = tiles[tiles.length - 1];
		expect(first.alpha).toBeLessThan(last.alpha);
	});

	it("keeps a rotated wipe front inside the sweep range", () => {
		// An unnormalised projection overflows [0, 1] off-axis, which left the
		// text pre-shattered at progress 0 and never finished at progress 1.
		const rotated = state({ front: "wipe", frontRotDeg: 45, feather: 0.35 });
		const atStart = computeShatterTiles({
			width: 200,
			height: 100,
			state: { ...rotated, progress: 0 },
		});
		expect(atStart.every((tile) => tile.alpha === 1)).toBe(true);
		const atEnd = computeShatterTiles({
			width: 200,
			height: 100,
			state: { ...rotated, progress: 1 },
		});
		expect(atEnd.every((tile) => tile.alpha < 0.05)).toBe(true);
	});

	it("lifts released dust when gravity is rotated upward", () => {
		const tiles = computeShatterTiles({
			width: 40,
			height: 20,
			state: state({
				progress: 1,
				gravityRotDeg: 180,
				gravityPx: 40,
				distortionPx: 0,
			}),
		});
		expect(tiles.every((tile) => tile.dy < 0)).toBe(true);
		const down = computeShatterTiles({
			width: 40,
			height: 20,
			state: state({
				progress: 1,
				gravityRotDeg: 0,
				gravityPx: 40,
				distortionPx: 0,
			}),
		});
		expect(down.every((tile) => tile.dy > 0)).toBe(true);
	});

	it("caps tile count so a fine grid on a big raster stays affordable", () => {
		const tiles = computeShatterTiles({
			width: 1700,
			height: 600,
			state: state({ tilePx: 4 }),
		});
		expect(tiles.length).toBeLessThanOrEqual(8000);
		// Coverage is preserved: the grid still spans the whole raster.
		const maxRight = Math.max(...tiles.map((tile) => tile.sx + tile.size));
		const maxBottom = Math.max(...tiles.map((tile) => tile.sy + tile.size));
		expect(maxRight).toBeGreaterThanOrEqual(1700);
		expect(maxBottom).toBeGreaterThanOrEqual(600);
	});

	it("enforces the tile budget for extremely wide, short rasters", () => {
		const tiles = computeShatterTiles({
			width: 64_000,
			height: 2,
			state: state({ tilePx: 2 }),
		});
		expect(tiles.length).toBeLessThanOrEqual(8000);
		const maxRight = Math.max(...tiles.map((tile) => tile.sx + tile.size));
		const maxBottom = Math.max(...tiles.map((tile) => tile.sy + tile.size));
		expect(maxRight).toBeGreaterThanOrEqual(64_000);
		expect(maxBottom).toBeGreaterThanOrEqual(2);
	});

	it("hashes stable platform-independent noise", () => {
		expect(shatterNoise({ x: 3, y: 5, seed: 7, channel: 1 })).toBe(
			shatterNoise({ x: 3, y: 5, seed: 7, channel: 1 })
		);
		expect(shatterNoise({ x: 3, y: 5, seed: 7, channel: 1 })).not.toBe(
			shatterNoise({ x: 3, y: 5, seed: 8, channel: 1 })
		);
	});
});

describe("shatter persistence guards", () => {
	it("forces a container target for shatter and burst phases", async () => {
		const { normalizeTextAnimations } = await import(
			"../text-animation/index.js"
		);
		const { createElement } = await import("./text-animation-test-helpers.js");
		for (const effect of [
			{
				kind: "shatter" as const,
				tilePx: 4,
				distortion: 0.2,
				gravity: { value: 0.2, unit: "em" as const },
				gravityRotDeg: 180,
				front: "noise" as const,
				frontRotDeg: 0,
				feather: 0.5,
			},
			{
				kind: "burst" as const,
				shape: "coin" as const,
				count: 10,
				speed: { value: 3, unit: "em" as const },
				directionDeg: 0,
				spreadDeg: 360,
				gravity: { value: 1, unit: "em" as const },
				lifeRandom: 0.4,
				sizeEm: 0.4,
				sizeRandom: 0.3,
				palette: ["#fff"],
				flutter: 0.2,
				seed: 1,
			},
		]) {
			// A hand-edited or legacy project could persist a per-unit target,
			// which would drop the shatter or duplicate every particle.
			const element = createElement({
				overrides: {
					content: "AB",
					textAnimations: {
						schemaVersion: 1,
						exit: {
							timing: { duration: 1, delay: 0, easing: "linear" },
							sequence: {
								unit: "grapheme",
								order: "forward",
								staggerRatio: 0.5,
								seed: 1,
							},
							target: "text",
							effect,
						},
					},
				},
			});
			const exit = normalizeTextAnimations({ element }).animation?.exit;
			expect(exit?.target).toBe("textAndBackground");
			expect(exit?.sequence.unit).toBe("all");
		}
	});
});
