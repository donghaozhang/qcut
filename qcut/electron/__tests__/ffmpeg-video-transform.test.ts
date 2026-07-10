import { describe, expect, it } from "vitest";
import {
	buildVideoKeyframeExpression,
	buildVideoTimelineFilters,
} from "../ffmpeg-video-transform";
import type { VideoSource, VideoVisual } from "../ffmpeg/types";

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
});
