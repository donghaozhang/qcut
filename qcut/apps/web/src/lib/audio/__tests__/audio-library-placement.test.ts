import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	buildAudioLoopSegments,
	getAutomaticDuckingSourceTrackIds,
	getVisualTimelineEnd,
	snapTimeToAudioBeatGrid,
} from "../audio-library-placement";

function track({
	id,
	type,
	muted = false,
	elements,
}: {
	id: string;
	type: TimelineTrack["type"];
	muted?: boolean;
	elements: TimelineTrack["elements"];
}): TimelineTrack {
	return { id, name: id, type, muted, elements } as TimelineTrack;
}

describe("audio library placement", () => {
	it("snaps playhead times to a deterministic BPM grid", () => {
		expect(snapTimeToAudioBeatGrid({ time: 3.13, bpm: 120 })).toBe(3);
		expect(
			snapTimeToAudioBeatGrid({ time: 3.13, bpm: 120, alignment: "next" })
		).toBe(3.5);
		expect(snapTimeToAudioBeatGrid({ time: 2.18, bpm: 116 })).toBe(2.068966);
		expect(snapTimeToAudioBeatGrid({ time: 2.18, bpm: 0 })).toBe(2.18);
	});

	it("uses visual content, not existing audio, for the project end", () => {
		const tracks = [
			track({
				id: "video",
				type: "media",
				elements: [
					{
						id: "video-1",
						type: "media",
						mediaId: "media-1",
						name: "Video",
						duration: 10,
						startTime: 2,
						trimStart: 1,
						trimEnd: 2,
					},
				],
			}),
			track({
				id: "music",
				type: "audio",
				elements: [
					{
						id: "music-1",
						type: "media",
						mediaId: "audio-1",
						name: "Music",
						duration: 100,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			}),
		];

		expect(getVisualTimelineEnd({ tracks })).toBe(9);
	});

	it("loops to the target, trims the final segment, and adds one fade", () => {
		expect(
			buildAudioLoopSegments({
				sourceDuration: 4,
				targetEnd: 10.5,
				finalFadeOut: 1,
			})
		).toEqual([
			{ startTime: 0, trimEnd: 0, fadeOut: 0 },
			{ startTime: 4, trimEnd: 0, fadeOut: 0 },
			{ startTime: 8, trimEnd: 1.5, fadeOut: 1 },
		]);
	});

	it("rejects invalid or unbounded loop requests", () => {
		expect(
			buildAudioLoopSegments({ sourceDuration: 0, targetEnd: 10 })
		).toEqual([]);
		expect(
			buildAudioLoopSegments({ sourceDuration: 0.1, targetEnd: 101 })
		).toEqual([]);
	});

	it("uses every other audible media-bearing track as a ducking source", () => {
		const mediaElement = {
			id: "element",
			type: "media" as const,
			mediaId: "media",
			name: "Media",
			duration: 5,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
		};
		const tracks = [
			track({ id: "target", type: "audio", elements: [mediaElement] }),
			track({ id: "voice", type: "audio", elements: [mediaElement] }),
			track({ id: "video", type: "media", elements: [mediaElement] }),
			track({
				id: "muted",
				type: "audio",
				muted: true,
				elements: [mediaElement],
			}),
			track({ id: "empty", type: "media", elements: [] }),
		];

		expect(
			getAutomaticDuckingSourceTrackIds({ tracks, targetTrackId: "target" })
		).toEqual(["voice", "video"]);
	});
});
