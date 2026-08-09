import { describe, expect, it } from "vitest";
import {
	buildFrameSamplePlan,
	type FrameSample,
} from "../capcut-e2e/frame-sample-plan.js";

function fixtureDocument({
	durationUs = 6_000_000,
}: {
	durationUs?: number;
} = {}) {
	return {
		project: { durationUs, fps: 30 },
		timelines: [
			{
				isRoot: true,
				tracks: [
					{
						segments: [
							{
								id: "clip-a",
								kind: "video",
								targetRange: { durationUs: 3_000_000, startUs: 0 },
							},
							{
								id: "clip-b",
								kind: "video",
								targetRange: {
									durationUs: 3_000_000,
									startUs: 3_000_000,
								},
							},
						],
						transitions: [
							{
								durationUs: 466_666,
								fromSegmentId: "clip-a",
								id: "transition-a-b",
								toSegmentId: "clip-b",
							},
						],
					},
					{
						segments: [
							{
								id: "title",
								kind: "text",
								targetRange: {
									durationUs: 1_000_000,
									startUs: 1_000_000,
								},
							},
						],
					},
				],
			},
		],
	};
}

function sampleAt({
	frameIndex,
	samples,
}: {
	frameIndex: number;
	samples: FrameSample[];
}) {
	const sample = samples.find(
		(candidate) => candidate.frameIndex === frameIndex
	);
	if (!sample) throw new Error(`Missing frame ${frameIndex}.`);
	return sample;
}

describe("CapCut E2E frame sample plan", () => {
	it("covers project, segment, text, transition, and stable boundaries", () => {
		const plan = buildFrameSamplePlan({
			document: fixtureDocument(),
			randomSampleCount: 0,
		});
		expect(plan).toMatchObject({
			coverage: {
				keyframes: "unsupported-by-interop-v1",
				transitionInterval: "semantic-seam-candidate",
			},
			durationUs: 6_000_000,
			fps: 30,
			frameCount: 180,
			randomSampleCount: 0,
			requestedRandomSampleCount: 0,
		});
		expect(sampleAt({ frameIndex: 0, samples: plan.samples }).reasons).toEqual(
			expect.arrayContaining([
				{ kind: "project-first" },
				{ kind: "segment-start", subjectId: "clip-a" },
			])
		);
		expect(
			sampleAt({ frameIndex: 89, samples: plan.samples }).reasons
		).toContainEqual({ kind: "segment-end-before", subjectId: "clip-a" });
		expect(sampleAt({ frameIndex: 90, samples: plan.samples }).reasons).toEqual(
			expect.arrayContaining([
				{ kind: "segment-end-after", subjectId: "clip-a" },
				{ kind: "segment-start", subjectId: "clip-b" },
				{ kind: "transition-middle", subjectId: "transition-a-b" },
			])
		);
		expect(
			sampleAt({ frameIndex: 30, samples: plan.samples }).reasons
		).toContainEqual({ kind: "text-start", subjectId: "title" });
		expect(
			sampleAt({ frameIndex: 59, samples: plan.samples }).reasons
		).toContainEqual({ kind: "text-end-before", subjectId: "title" });
		expect(
			sampleAt({ frameIndex: 60, samples: plan.samples }).reasons
		).toContainEqual({ kind: "text-end-after", subjectId: "title" });
		expect(
			sampleAt({ frameIndex: 83, samples: plan.samples }).reasons
		).toContainEqual({
			kind: "transition-before",
			subjectId: "transition-a-b",
		});
		expect(
			sampleAt({ frameIndex: 97, samples: plan.samples }).reasons
		).toContainEqual({ kind: "transition-after", subjectId: "transition-a-b" });
		expect(
			sampleAt({ frameIndex: 138, samples: plan.samples }).reasons
		).toContainEqual({ kind: "longest-stable-middle" });
		expect(
			sampleAt({ frameIndex: 179, samples: plan.samples }).reasons
		).toEqual(
			expect.arrayContaining([
				{ kind: "project-last" },
				{ kind: "segment-end-before", subjectId: "clip-b" },
			])
		);
	});

	it("adds deterministic unique random samples", () => {
		const options = {
			document: fixtureDocument(),
			randomSampleCount: 8,
			seed: 12_345,
		};
		const first = buildFrameSamplePlan(options);
		const second = buildFrameSamplePlan(options);
		expect(first).toEqual(second);
		const randomFrames = first.samples
			.filter(({ reasons }) =>
				reasons.some(({ kind }) => kind === "seeded-random")
			)
			.map(({ frameIndex }) => frameIndex);
		expect(new Set(randomFrames).size).toBe(8);
		expect(first.randomSampleCount).toBe(8);
	});

	it("derives duration and fails closed on unsupported plan shapes", () => {
		const withoutDuration = {
			...fixtureDocument(),
			project: { fps: 30 },
		};
		expect(
			buildFrameSamplePlan({
				document: withoutDuration,
				randomSampleCount: 0,
			})
		).toMatchObject({ durationUs: 6_000_000, frameCount: 180 });
		expect(() =>
			buildFrameSamplePlan({
				document: { project: { fps: 30 }, timelines: [] },
			})
		).toThrow("exactly one root timeline");
		expect(() =>
			buildFrameSamplePlan({
				document: fixtureDocument(),
				randomSampleCount: 65,
			})
		).toThrow("random sample count is invalid");
	});
});
