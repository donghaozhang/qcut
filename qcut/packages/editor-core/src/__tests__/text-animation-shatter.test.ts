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

	it("hashes stable platform-independent noise", () => {
		expect(shatterNoise({ x: 3, y: 5, seed: 7, channel: 1 })).toBe(
			shatterNoise({ x: 3, y: 5, seed: 7, channel: 1 })
		);
		expect(shatterNoise({ x: 3, y: 5, seed: 7, channel: 1 })).not.toBe(
			shatterNoise({ x: 3, y: 5, seed: 8, channel: 1 })
		);
	});
});
