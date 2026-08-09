import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	buildTimelineDurationByElementId,
	createCapCut81WritebackTimingSnapshot,
} from "../capcut-same-profile-writeback-snapshot";

function tracks(): TimelineTrack[] {
	return [
		{
			id: "video-track",
			name: "Video",
			type: "media",
			elements: [
				{
					id: "video-element",
					type: "media",
					mediaId: "video-resource",
					name: "clip.mp4",
					duration: 10,
					startTime: 2,
					trimStart: 1,
					trimEnd: 2,
					playbackRate: 2,
				},
			],
		},
		{
			id: "text-track",
			name: "Text",
			type: "text",
			elements: [
				{
					id: "text-element",
					type: "text",
					name: "Title",
					content: "Title",
					duration: 4,
					startTime: 0,
					trimStart: 0.5,
					trimEnd: 0.5,
					fontSize: 48,
					fontFamily: "Arial",
					color: "#ffffff",
					backgroundColor: "transparent",
					textAlign: "center",
					fontWeight: "normal",
					fontStyle: "normal",
					textDecoration: "none",
					x: 0,
					y: 0,
					rotation: 0,
					opacity: 1,
				},
			],
		},
	];
}

describe("CapCut same-profile writeback timing snapshot", () => {
	it("captures playback-aware durations without media filesystem paths", () => {
		const result = createCapCut81WritebackTimingSnapshot({
			fps: 30,
			tracks: tracks(),
		});

		expect(result.timelineDurationByElementId).toEqual({
			"text-element": 3,
			"video-element": 3.5,
		});
		expect(Object.keys(result)).toEqual([
			"tracks",
			"timelineDurationByElementId",
		]);
	});

	it("isolates the captured tracks from later store mutations", () => {
		const sourceTracks = tracks();
		const result = createCapCut81WritebackTimingSnapshot({
			fps: 30,
			tracks: sourceTracks,
		});
		sourceTracks[0].elements[0].startTime = 99;

		expect(result.tracks[0]?.elements[0]?.startTime).toBe(2);
	});

	it("rejects invalid FPS before computing timing evidence", () => {
		expect(() =>
			buildTimelineDurationByElementId({ fps: 0, tracks: tracks() })
		).toThrow("positive finite number");
	});
});
