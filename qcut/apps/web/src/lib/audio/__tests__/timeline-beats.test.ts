import type { BeatDetectionResult } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { collectTimelineBeats } from "../timeline-beats";

function result({ timestamps }: { timestamps: number[] }): BeatDetectionResult {
	return {
		beats: timestamps.map((timestamp, index) => ({
			index,
			isDownbeat: index === 0,
			strength: 0.8,
			timestamp,
		})),
		bpm: 120,
		confidence: 0.9,
		downbeats: timestamps.slice(0, 1),
		duration: 20,
	};
}

function mediaElement({
	id,
	startTime,
	trimStart,
	duration,
}: {
	duration: number;
	id: string;
	startTime: number;
	trimStart: number;
}): MediaElement {
	return {
		duration,
		id,
		mediaId: `media-${id}`,
		name: id,
		startTime,
		trimEnd: 0,
		trimStart,
		type: "media",
	};
}

describe("timeline beats", () => {
	it("maps source beats through trim offsets and excludes trimmed content", () => {
		const element = mediaElement({
			id: "clip",
			startTime: 10,
			trimStart: 3,
			duration: 7,
		});
		const track: TimelineTrack = {
			elements: [element],
			id: "track",
			isMain: true,
			name: "Media",
			type: "media",
		};

		expect(
			collectTimelineBeats({
				beatCache: new Map([
					[element.id, result({ timestamps: [2, 3, 5, 7, 8] })],
				]),
				tracks: [track],
			})
		).toEqual([
			expect.objectContaining({ elementId: "clip", timestamp: 10 }),
			expect.objectContaining({ elementId: "clip", timestamp: 12 }),
			expect.objectContaining({ elementId: "clip", timestamp: 14 }),
		]);
	});

	it("sorts beats from multiple tracks by timeline time", () => {
		const later = mediaElement({
			id: "later",
			startTime: 8,
			trimStart: 0,
			duration: 2,
		});
		const earlier = mediaElement({
			id: "earlier",
			startTime: 2,
			trimStart: 0,
			duration: 2,
		});
		const tracks: TimelineTrack[] = [later, earlier].map((element) => ({
			elements: [element],
			id: `track-${element.id}`,
			name: element.id,
			type: "media",
		}));
		const beatCache = new Map([
			[later.id, result({ timestamps: [1] })],
			[earlier.id, result({ timestamps: [1] })],
		]);

		expect(
			collectTimelineBeats({ beatCache, tracks }).map((beat) => beat.timestamp)
		).toEqual([3, 9]);
	});

	it("maps beats through constant and variable playback speeds", () => {
		const constant = mediaElement({
			id: "constant",
			startTime: 10,
			trimStart: 0,
			duration: 6,
		});
		const variable = mediaElement({
			id: "variable",
			startTime: 20,
			trimStart: 0,
			duration: 6,
		});
		const elements: MediaElement[] = [
			{ ...constant, playbackRate: 2 },
			{
				...variable,
				speedKeyframes: [
					{ id: "a", frame: 0, value: 1, easing: "linear" },
					{ id: "b", frame: 180, value: 3, easing: "linear" },
				],
			},
		];
		const tracks: TimelineTrack[] = elements.map((element) => ({
			elements: [element],
			id: `track-${element.id}`,
			name: element.id,
			type: "media",
		}));

		const beats = collectTimelineBeats({
			beatCache: new Map([
				[constant.id, result({ timestamps: [4] })],
				[variable.id, result({ timestamps: [4] })],
			]),
			tracks,
		});

		expect(beats[0].timestamp).toBeCloseTo(12);
		expect(beats[1].timestamp).toBeGreaterThan(22);
		expect(beats[1].timestamp).toBeLessThan(24);
	});

	it("maps reverse beats from the opposite source edge", () => {
		const element = {
			...mediaElement({
				id: "reverse",
				startTime: 5,
				trimStart: 1,
				duration: 7,
			}),
			trimEnd: 1,
			reverse: true,
		};
		const track: TimelineTrack = {
			elements: [element],
			id: "track",
			name: "Reverse",
			type: "media",
		};

		expect(
			collectTimelineBeats({
				beatCache: new Map([
					[element.id, result({ timestamps: [1, 2, 5, 6] })],
				]),
				tracks: [track],
			}).map((beat) => beat.timestamp)
		).toEqual([5, 6, 9, 10]);
	});
});
