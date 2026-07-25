import { describe, expect, it } from "vitest";
import { mediaIndexInternals } from "../media-index.js";
import type { FrameSample } from "../types.js";

function sample({
	time,
	sharpness,
	stabilityResidual = 0.05,
	motionX = 1,
}: {
	time: number;
	sharpness: number;
	stabilityResidual?: number;
	motionX?: number;
}): FrameSample {
	return {
		time,
		luma: 0.5,
		contrast: 0.6,
		sharpness,
		focus: {
			x: 0.5,
			y: 0.5,
			position: "center",
			confidence: 0.8,
		},
		motionX,
		motionY: 0,
		motionMagnitude: Math.abs(motionX),
		motionResidual: stabilityResidual,
	};
}

describe("editorial media index ranges", () => {
	it("includes the final legal candidate start without exceeding a scene", () => {
		expect(
			mediaIndexInternals.buildCandidateStarts({
				start: 2,
				end: 11.3,
				duration: 6,
				step: 0.5,
			})
		).toContain(5.3);
	});

	it("selects the sharper stable window rather than the first six seconds", () => {
		const samples = Array.from({ length: 25 }, (_, index) =>
			sample({
				time: index * 0.5,
				sharpness: index >= 10 && index <= 22 ? 0.9 : 0.15,
			})
		);
		const ranges = mediaIndexInternals.buildSceneRanges({
			sceneId: "scene-1",
			start: 0,
			end: 12,
			samples,
			candidateDuration: 6,
			sampleFps: 2,
		});
		const best = [...ranges.candidates].sort(
			(left, right) => right.score - left.score
		)[0];

		expect(best.start).toBeGreaterThan(0);
		expect(best.end).toBeLessThanOrEqual(12);
		expect(best.metrics.sharpness).toBeGreaterThan(0.7);
	});

	it("keeps semantic scene motion and subject position over local estimates", () => {
		const scenes = mediaIndexInternals.buildScenes({
			sourceId: "source",
			duration: 10,
			boundaries: [0, 5],
			samples: Array.from({ length: 21 }, (_, index) =>
				sample({ time: index * 0.5, sharpness: 0.8, motionX: 1 })
			),
			candidateDuration: 4,
			sampleFps: 2,
			semantics: {
				summary: "tram",
				tags: ["tram"],
				locations: ["Melbourne"],
				subjects: ["tram"],
				scenes: [
					{
						start: 0,
						end: 5,
						description: "A tram enters from the left",
						tags: ["tram"],
						motionDirection: "left",
						subjectPosition: "left",
					},
				],
			},
		});

		expect(scenes[0]).toMatchObject({
			description: "A tram enters from the left",
			tags: ["tram"],
			metrics: {
				motionDirection: "left",
				subjectPosition: "left",
			},
		});
	});
});
