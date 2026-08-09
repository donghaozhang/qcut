import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		getPath: () => "/tmp/qcut-test-user-data",
	},
}));

import { jianyingTimelinePreviewCacheTestUtils } from "../jianying-transition/timeline-preview-cache";

const videoSource = {
	inputPath: "/private/source.mp4",
	kind: "video" as const,
	sourceStart: 1.5,
	sourceDuration: 0.5,
	playbackRate: 1,
	reverse: false,
};

describe("Jianying timeline preview cache", () => {
	it("builds normalized forward and reverse source filters", () => {
		const forward = jianyingTimelinePreviewCacheTestUtils.buildSourceFilter({
			source: videoSource,
			duration: 0.5,
			fps: 30,
			width: 960,
			height: 540,
		});
		const reverse = jianyingTimelinePreviewCacheTestUtils.buildSourceFilter({
			source: { ...videoSource, playbackRate: 2, reverse: true },
			duration: 0.5,
			fps: 30,
			width: 960,
			height: 540,
		});

		expect(forward).toContain("setpts=(PTS-STARTPTS)/1");
		expect(forward).toContain("trim=duration=0.5");
		expect(reverse).toContain("reverse,setpts=(PTS-STARTPTS)/2");
		expect(reverse).toContain("scale=960:540");
	});

	it("normalizes dimensions and rejects invalid source ranges", () => {
		expect(
			jianyingTimelinePreviewCacheTestUtils.requireEvenDimension({
				value: 639,
				label: "Width",
			})
		).toBe(640);
		expect(() =>
			jianyingTimelinePreviewCacheTestUtils.validateSource({
				source: { ...videoSource, playbackRate: 0 },
				label: "Input A",
			})
		).toThrow("playback rate");
		expect(() =>
			jianyingTimelinePreviewCacheTestUtils.validateSource({
				source: { ...videoSource, sourceDuration: 0 },
				label: "Input A",
			})
		).toThrow("duration");
	});
});
