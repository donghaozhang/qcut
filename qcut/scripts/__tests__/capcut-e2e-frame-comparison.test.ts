import { describe, expect, it } from "vitest";
import {
	buildFrameComparisonChecks,
	buildVideoFrameProbeArgs,
	parseVideoProbeEvidence,
} from "../capcut-e2e/frame-comparison.js";
import type { FrameSamplePlan } from "../capcut-e2e/frame-sample-plan.js";

function probeReport({
	fps = "30/1",
	frameCount = "180",
	height = 720,
	width = 1280,
}: {
	fps?: string;
	frameCount?: string;
	height?: number;
	width?: number;
} = {}) {
	return {
		streams: [
			{
				avg_frame_rate: fps,
				codec_type: "video",
				height,
				nb_read_frames: frameCount,
				width,
			},
		],
	};
}

function samplePlan(): FrameSamplePlan {
	return {
		coverage: {
			keyframes: "unsupported-by-interop-v1",
			transitionInterval: "semantic-seam-candidate",
		},
		durationUs: 6_000_000,
		fps: 30,
		frameCount: 180,
		randomSampleCount: 0,
		requestedRandomSampleCount: 0,
		samples: [
			{
				frameIndex: 0,
				reasons: [{ kind: "project-first" }],
				timestampUs: 0,
			},
			{
				frameIndex: 179,
				reasons: [{ kind: "project-last" }],
				timestampUs: 5_966_667,
			},
		],
		seed: 1,
	};
}

describe("CapCut E2E frame comparison", () => {
	it("builds a shell-free decoded-frame probe", () => {
		const args = buildVideoFrameProbeArgs({
			mediaPath: "/exports/native output.mp4",
		});
		expect(args).toContain("/exports/native output.mp4");
		expect(args).toContain("-count_frames");
		expect(args).toContain("v:0");
		expect(args.join(" ")).toContain("nb_read_frames");
	});

	it("parses CFR geometry and decoded frame count", () => {
		expect(parseVideoProbeEvidence({ value: probeReport() })).toEqual({
			fps: 30,
			frameCount: 180,
			height: 720,
			width: 1280,
		});
		expect(
			parseVideoProbeEvidence({
				value: probeReport({ fps: "30000/1001" }),
			})
		).toMatchObject({ fps: 29.97003 });
	});

	it("distinguishes no video from malformed multi-stream output", () => {
		expect(parseVideoProbeEvidence({ value: { streams: [] } })).toBeNull();
		expect(() =>
			parseVideoProbeEvidence({
				value: {
					streams: [probeReport().streams[0], probeReport().streams[0]],
				},
			})
		).toThrow("exactly one selected stream");
		expect(() =>
			parseVideoProbeEvidence({
				value: probeReport({ frameCount: "unknown" }),
			})
		).toThrow("positive integer");
	});

	it("gates comparison on FPS, frame count, geometry, and plan coverage", () => {
		const plan = samplePlan();
		const video = parseVideoProbeEvidence({ value: probeReport() });
		if (!video) throw new Error("Fixture video probe is missing.");
		expect(
			buildFrameComparisonChecks({ left: video, plan, right: video })
		).toEqual({
			fpsMatch: true,
			frameCountMatch: true,
			geometryMatch: true,
			planCoverage: true,
		});
		expect(
			buildFrameComparisonChecks({
				left: video,
				plan,
				right: {
					...video,
					fps: 25,
					frameCount: 179,
					width: 1920,
				},
			})
		).toEqual({
			fpsMatch: false,
			frameCountMatch: false,
			geometryMatch: false,
			planCoverage: false,
		});
	});
});
