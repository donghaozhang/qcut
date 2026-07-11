import { describe, expect, it } from "vitest";
import {
	buildVideoMaskExpression,
	buildVideoKeyframeExpression,
	buildVideoTimelineFilters,
} from "../ffmpeg-video-transform";
import type {
	VideoSource,
	VideoTransition,
	VideoVisual,
} from "../ffmpeg/types";
import { buildChromaKeyFilterGraph } from "../ffmpeg/chroma-key-filter";

const visual: VideoVisual = {
	x: 40,
	y: -20,
	rotation: 15,
	scaleX: 0.8,
	scaleY: 0.7,
	flipHorizontal: true,
	flipVertical: false,
	opacity: 0.75,
	blendMode: "screen",
	fitMode: "contain",
	crop: { top: 0.1, right: 0, bottom: 0, left: 0.05 },
	perspective: {
		topLeftX: 0.05,
		topLeftY: 0.1,
		topRightX: 0.95,
		topRightY: 0,
		bottomRightX: 1,
		bottomRightY: 0.95,
		bottomLeftX: 0,
		bottomLeftY: 1,
	},
	keyframes: {
		x: [
			{ id: "x0", frame: 0, value: 0, easing: "linear" },
			{ id: "x1", frame: 30, value: 100, easing: "easeOut" },
		],
	},
	keyframeFps: 30,
};

describe("FFmpeg video transform filters", () => {
	it("builds animated chroma refinement filters", () => {
		const result = buildChromaKeyFilterGraph({
			inputLabel: "source",
			labelPrefix: "clip_chroma",
			fps: 30,
			duration: 2,
			chromaKey: {
				enabled: true,
				color: "#00ff00",
				similarity: 0.2,
				blend: 0.1,
				shadow: 0.15,
				cleanup: 0.25,
				spill: 0.2,
				keyframes: {
					similarity: [
						{ id: "s0", frame: 0, value: 0.15, easing: "linear" },
						{ id: "s1", frame: 30, value: 0.3, easing: "easeInOut" },
					],
					cleanup: [
						{ id: "c0", frame: 0, value: 0, easing: "linear" },
						{ id: "c1", frame: 30, value: 0.5, easing: "linear" },
					],
				},
			},
		});
		const filter = result.filterSteps.join(";");
		expect(filter).toContain("sendcmd=");
		expect(filter).toContain("chromakey@clip_chroma_filter");
		expect(filter).toContain("erosion=");
		expect(filter).toContain("despill@clip_chroma_despill_filter");
		expect(result.outputLabel).toBe("clip_chroma_despilled");
	});

	it("builds local-time keyframe expressions", () => {
		const expression = buildVideoKeyframeExpression({
			visual,
			property: "x",
			fallback: visual.x,
		});
		expect(expression).toContain("lt(T,1)");
		expect(expression).toContain("1-pow");
	});

	it("builds transformed fixed-size segments and timeline gaps", () => {
		const sources: VideoSource[] = [
			{ path: "/one.mp4", startTime: 1, duration: 2, visual },
			{ path: "/two.mp4", startTime: 3, duration: 2 },
		];
		const result = buildVideoTimelineFilters({
			videoSources: sources,
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 5,
		});
		const filter = result.filterSteps.join(";");
		expect(filter).toContain("video_gap_0");
		expect(filter).toContain("perspective=");
		expect(filter).toContain("hflip");
		expect(filter).toContain("rotate=angle=");
		expect(filter).toContain("blend=all_mode=screen");
		expect(filter).toContain("concat=n=3:v=1:a=0");
	});

	it("composites ordered video tracks from bottom to top", () => {
		const sources: VideoSource[] = [
			{
				path: "/top.mp4",
				startTime: 0,
				duration: 3,
				trackOrder: 0,
				elementOrder: 0,
			},
			{
				path: "/bottom.mp4",
				startTime: 0,
				duration: 3,
				trackOrder: 1,
				elementOrder: 0,
			},
		];

		const result = buildVideoTimelineFilters({
			videoSources: sources,
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 3,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain("[1:v]trim=");
		expect(filter.indexOf("[1:v]trim=")).toBeLessThan(
			filter.indexOf("[0:v]trim=")
		);
		expect(filter).toContain("video_layer_composite_0");
		expect(filter).toContain("video_layer_composite_1");
		expect(filter).not.toContain("concat=");
	});

	it.each([
		{ type: "dissolve", expected: "fade" },
		{ type: "fade-black", expected: "fadeblack" },
		{ type: "slide", direction: "right", expected: "slideright" },
		{ type: "wipe", direction: "left", expected: "wipeleft" },
	] satisfies Array<{
		type: VideoTransition["type"];
		direction?: VideoTransition["direction"];
		expected: string;
	}>)(
		"builds centered $type transitions without shortening the timeline",
		({ type, direction, expected }) => {
			const sources: VideoSource[] = [
				{
					elementId: "clip-a",
					trackId: "track-1",
					path: "/one.mp4",
					startTime: 0,
					duration: 2,
					trackOrder: 0,
					elementOrder: 0,
				},
				{
					elementId: "clip-b",
					trackId: "track-1",
					path: "/two.mp4",
					startTime: 2,
					duration: 2,
					trackOrder: 0,
					elementOrder: 1,
				},
			];
			const transition: VideoTransition = {
				id: "transition-1",
				trackId: "track-1",
				fromElementId: "clip-a",
				toElementId: "clip-b",
				presetId: type,
				type,
				direction,
				easing: "linear",
				duration: 1,
			};

			const result = buildVideoTimelineFilters({
				videoSources: sources,
				videoTransitions: [transition],
				width: 640,
				height: 360,
				fps: 30,
				totalDuration: 4,
			});
			const filter = result.filterSteps.join(";");

			expect(filter).toContain("start_duration=0:stop_mode=clone:stop_duration=0.5");
			expect(filter).toContain("start_duration=0.5:stop_mode=clone:stop_duration=0");
			expect(filter).toContain(
				"xfade=transition=" + expected + ":duration=1:offset=1.5"
			);
			expect(filter).toContain("trim=duration=4");
			expect(result.segmentCount).toBe(2);
		}
	);

	it("combines animated masks with add, subtract, and intersect", () => {
		const expression = buildVideoMaskExpression({
			...visual,
			masks: [
				{
					id: "ellipse",
					type: "ellipse",
					centerX: 0.5,
					centerY: 0.5,
					width: 0.8,
					height: 0.8,
					rotation: 0,
					feather: 0,
					invert: false,
					keyframes: {
						centerX: [
							{ id: "x0", frame: 0, value: 0.25, easing: "linear" },
							{ id: "x1", frame: 30, value: 0.75, easing: "linear" },
						],
					},
				},
				{
					id: "cutout",
					type: "rectangle",
					blendMode: "subtract",
					centerX: 0.5,
					centerY: 0.5,
					width: 0.2,
					height: 0.2,
					rotation: 0,
					feather: 0,
					invert: false,
				},
				{
					id: "star",
					type: "star",
					blendMode: "intersect",
					centerX: 0.5,
					centerY: 0.5,
					width: 1,
					height: 1,
					rotation: 0,
					feather: 0,
					invert: false,
				},
			],
		});

		expect(expression).toContain("N/30");
		expect(expression).toContain("*(1-(");
		expect(expression).toContain("mod(");
		expect(expression).not.toContain("lt(T,");
	});
});
