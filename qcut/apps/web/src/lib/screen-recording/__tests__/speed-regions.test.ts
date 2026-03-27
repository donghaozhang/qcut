import { describe, it, expect } from "vitest";
import {
	hasOverlap,
	getSpeedAtTime,
	realTimeToPlaybackTime,
	playbackTimeToRealTime,
	calculateSpeedAdjustedDuration,
	clampSpeed,
	type SpeedRegion,
} from "../speed-regions";

function makeRegion(
	id: string,
	startMs: number,
	endMs: number,
	speed: number,
): SpeedRegion {
	return { id, startMs, endMs, speed };
}

describe("speed-regions", () => {
	describe("hasOverlap", () => {
		it("returns false for non-overlapping regions", () => {
			const regions = [makeRegion("a", 0, 100, 2)];
			expect(hasOverlap(regions, makeRegion("b", 200, 300, 2))).toBe(
				false,
			);
		});

		it("returns true for overlapping regions", () => {
			const regions = [makeRegion("a", 0, 200, 2)];
			expect(hasOverlap(regions, makeRegion("b", 100, 300, 2))).toBe(
				true,
			);
		});

		it("returns false for adjacent regions (no gap)", () => {
			const regions = [makeRegion("a", 0, 100, 2)];
			expect(hasOverlap(regions, makeRegion("b", 100, 200, 2))).toBe(
				false,
			);
		});

		it("skips self when checking overlap", () => {
			const regions = [makeRegion("a", 0, 100, 2)];
			expect(hasOverlap(regions, makeRegion("a", 0, 100, 2))).toBe(
				false,
			);
		});

		it("detects overlap with contained region", () => {
			const regions = [makeRegion("a", 0, 500, 2)];
			expect(hasOverlap(regions, makeRegion("b", 100, 200, 2))).toBe(
				true,
			);
		});
	});

	describe("getSpeedAtTime", () => {
		const regions = [
			makeRegion("a", 100, 300, 2),
			makeRegion("b", 500, 800, 0.5),
		];

		it("returns 1.0 outside any region", () => {
			expect(getSpeedAtTime(regions, 0)).toBe(1.0);
			expect(getSpeedAtTime(regions, 400)).toBe(1.0);
			expect(getSpeedAtTime(regions, 900)).toBe(1.0);
		});

		it("returns region speed inside a region", () => {
			expect(getSpeedAtTime(regions, 200)).toBe(2);
			expect(getSpeedAtTime(regions, 600)).toBe(0.5);
		});

		it("includes start boundary, excludes end boundary", () => {
			expect(getSpeedAtTime(regions, 100)).toBe(2);
			expect(getSpeedAtTime(regions, 300)).toBe(1.0);
		});

		it("returns 1.0 for empty regions", () => {
			expect(getSpeedAtTime([], 500)).toBe(1.0);
		});
	});

	describe("realTimeToPlaybackTime", () => {
		it("returns identity with no speed regions", () => {
			expect(realTimeToPlaybackTime([], 500)).toBe(500);
		});

		it("2x speed halves the playback time in that region", () => {
			const regions = [makeRegion("a", 100, 300, 2)];
			// At 200ms real: 100ms normal + (200-100)/2 = 100 + 50 = 150ms playback
			expect(realTimeToPlaybackTime(regions, 200)).toBe(150);
		});

		it("0.5x speed doubles the playback time in that region", () => {
			const regions = [makeRegion("a", 100, 300, 0.5)];
			// At 200ms real: 100ms normal + (200-100)/0.5 = 100 + 200 = 300ms playback
			expect(realTimeToPlaybackTime(regions, 200)).toBe(300);
		});

		it("after a 2x region, remaining time shifts earlier", () => {
			const regions = [makeRegion("a", 100, 300, 2)];
			// At 400ms: 100ms normal + 200ms/2 + 100ms normal = 300ms playback
			expect(realTimeToPlaybackTime(regions, 400)).toBe(300);
		});
	});

	describe("playbackTimeToRealTime", () => {
		it("returns identity with no speed regions", () => {
			expect(playbackTimeToRealTime([], 500)).toBe(500);
		});

		it("inverts realTimeToPlaybackTime", () => {
			const regions = [
				makeRegion("a", 100, 300, 2),
				makeRegion("b", 500, 800, 0.5),
			];
			// Round-trip test at various real times
			for (const realMs of [0, 50, 150, 250, 350, 600, 900]) {
				const playbackMs = realTimeToPlaybackTime(regions, realMs);
				const recovered = playbackTimeToRealTime(regions, playbackMs);
				expect(recovered).toBeCloseTo(realMs, 5);
			}
		});
	});

	describe("calculateSpeedAdjustedDuration", () => {
		it("returns original duration with no regions", () => {
			expect(calculateSpeedAdjustedDuration(1000, [])).toBe(1000);
		});

		it("2x speed region reduces total duration", () => {
			const regions = [makeRegion("a", 200, 400, 2)];
			// 200ms normal + 200ms/2 + 600ms normal = 900ms
			expect(calculateSpeedAdjustedDuration(1000, regions)).toBe(900);
		});

		it("0.5x speed region increases total duration", () => {
			const regions = [makeRegion("a", 200, 400, 0.5)];
			// 200ms normal + 200ms/0.5 + 600ms normal = 1200ms
			expect(calculateSpeedAdjustedDuration(1000, regions)).toBe(1200);
		});

		it("clamps regions to total duration", () => {
			const regions = [makeRegion("a", 800, 2000, 2)];
			// 800ms normal + 200ms/2 = 900ms (region clamped to 1000)
			expect(calculateSpeedAdjustedDuration(1000, regions)).toBe(900);
		});

		it("handles multiple regions", () => {
			const regions = [
				makeRegion("a", 0, 200, 2),
				makeRegion("b", 400, 600, 0.5),
			];
			// 200/2 + 200normal + 200/0.5 + 400normal = 100+200+400+400 = 1100
			expect(calculateSpeedAdjustedDuration(1000, regions)).toBe(1100);
		});
	});

	describe("clampSpeed", () => {
		it("clamps below minimum", () => {
			expect(clampSpeed(0.1)).toBe(0.25);
		});

		it("clamps above maximum", () => {
			expect(clampSpeed(10)).toBe(4);
		});

		it("passes through valid values", () => {
			expect(clampSpeed(1.5)).toBe(1.5);
		});
	});
});
