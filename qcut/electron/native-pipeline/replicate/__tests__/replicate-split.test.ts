import { describe, it, expect } from "vitest";
import {
	computeReplicatePartCount,
	mergeVideoRecipes,
} from "../replicate-split";
import type { VideoRecipe } from "../replicate-types";

function makeRecipe(overrides: {
	shots: Array<{ startTime: number; endTime: number }>;
	genre?: string;
	mood?: string;
	pacing?: "fast" | "medium" | "slow";
	colorPalette?: string[];
	hasBGM?: boolean;
	hasVoiceover?: boolean;
	transcript?: string;
	bgmStyle?: string;
}): VideoRecipe {
	return {
		version: 1,
		source: {
			filename: "part.mp4",
			duration: 120,
			resolution: { width: 1920, height: 1080 },
			fps: 25,
		},
		style: {
			genre: overrides.genre ?? "vlog",
			mood: overrides.mood ?? "calm",
			colorPalette: overrides.colorPalette ?? [],
			pacing: overrides.pacing ?? "medium",
		},
		audio: {
			hasBGM: overrides.hasBGM ?? false,
			bgmStyle: overrides.bgmStyle,
			hasVoiceover: overrides.hasVoiceover ?? false,
			transcript: overrides.transcript,
		},
		shots: overrides.shots.map((shot, index) => ({
			index,
			startTime: shot.startTime,
			endTime: shot.endTime,
			duration: shot.endTime - shot.startTime,
			type: "wide" as const,
			camera: "static" as const,
			description: `shot ${index}`,
			prompt: `prompt ${index}`,
			transition: "cut" as const,
			hasText: false,
			hasSubtitle: false,
		})),
	};
}

describe("computeReplicatePartCount", () => {
	it("uses the payload-based count when it dominates", () => {
		expect(
			computeReplicatePartCount({
				estimatedPayloadChars: 26 * 1024 * 1024,
				maxPayloadChars: 8 * 1024 * 1024,
				durationSeconds: 90,
				maxPartSeconds: 120,
			})
		).toBe(4);
	});

	it("caps part length via the duration limit", () => {
		// 7-minute video slightly over the payload limit still splits into
		// ~2-minute parts, not two 3.5-minute halves.
		expect(
			computeReplicatePartCount({
				estimatedPayloadChars: 13 * 1024 * 1024,
				maxPayloadChars: 8 * 1024 * 1024,
				durationSeconds: 444,
				maxPartSeconds: 120,
			})
		).toBe(4);
	});

	it("never returns fewer than two parts", () => {
		expect(
			computeReplicatePartCount({
				estimatedPayloadChars: 1,
				maxPayloadChars: 100,
				durationSeconds: 10,
				maxPartSeconds: 120,
			})
		).toBe(2);
	});
});

describe("mergeVideoRecipes", () => {
	it("shifts shot times onto the original timeline and reindexes", () => {
		const merged = mergeVideoRecipes({
			parts: [
				{
					recipe: makeRecipe({
						shots: [
							{ startTime: 0, endTime: 3 },
							{ startTime: 3, endTime: 7 },
						],
					}),
					offsetSeconds: 0,
				},
				{
					recipe: makeRecipe({ shots: [{ startTime: 0, endTime: 5 }] }),
					offsetSeconds: 7,
				},
			],
			filename: "full.mp4",
			totalDuration: 12,
		});

		expect(merged.source.filename).toBe("full.mp4");
		expect(merged.source.duration).toBe(12);
		expect(merged.shots.map((shot) => shot.index)).toEqual([0, 1, 2]);
		expect(merged.shots.map((shot) => [shot.startTime, shot.endTime])).toEqual([
			[0, 3],
			[3, 7],
			[7, 12],
		]);
		expect(merged.shots[2].duration).toBe(5);
	});

	it("majority-votes style and unions audio across parts", () => {
		const merged = mergeVideoRecipes({
			parts: [
				{
					recipe: makeRecipe({
						shots: [{ startTime: 0, endTime: 2 }],
						genre: "vlog",
						pacing: "fast",
						colorPalette: ["#FFAA00", "#112233"],
						hasBGM: true,
						bgmStyle: "uplifting",
						transcript: "part one",
					}),
					offsetSeconds: 0,
				},
				{
					recipe: makeRecipe({
						shots: [{ startTime: 0, endTime: 2 }],
						genre: "cinematic",
						pacing: "fast",
						colorPalette: ["#ffaa00", "#445566"],
						hasVoiceover: true,
						transcript: "part two",
					}),
					offsetSeconds: 2,
				},
				{
					recipe: makeRecipe({
						shots: [{ startTime: 0, endTime: 2 }],
						genre: "vlog",
						pacing: "slow",
					}),
					offsetSeconds: 4,
				},
			],
			filename: "full.mp4",
			totalDuration: 6,
		});

		expect(merged.style.genre).toBe("vlog");
		expect(merged.style.pacing).toBe("fast");
		// Case-insensitive palette dedupe keeps first spelling
		expect(merged.style.colorPalette).toEqual([
			"#FFAA00",
			"#112233",
			"#445566",
		]);
		expect(merged.audio.hasBGM).toBe(true);
		expect(merged.audio.hasVoiceover).toBe(true);
		expect(merged.audio.bgmStyle).toBe("uplifting");
		expect(merged.audio.transcript).toBe("part one\npart two");
	});

	it("rejects an empty part list", () => {
		expect(() =>
			mergeVideoRecipes({ parts: [], filename: "x.mp4", totalDuration: 0 })
		).toThrow();
	});
});
