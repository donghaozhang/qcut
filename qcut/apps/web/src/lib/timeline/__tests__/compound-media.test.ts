import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { expandCompoundMediaTracks } from "../compound-media";

function mediaElement({
	id,
	mediaId,
	startTime,
	duration,
}: {
	id: string;
	mediaId: string;
	startTime: number;
	duration: number;
}): MediaElement {
	return {
		id,
		mediaId,
		name: id,
		type: "media",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

describe("compound media expansion", () => {
	it("materializes every compound child at its container-relative time", () => {
		const first = mediaElement({
			id: "first",
			mediaId: "media-1",
			startTime: 0,
			duration: 2,
		});
		const second = mediaElement({
			id: "second",
			mediaId: "media-2",
			startTime: 0,
			duration: 3,
		});
		const container: MediaElement = {
			...first,
			id: "container",
			startTime: 10,
			duration: 5,
			compound: {
				kind: "compound",
				clips: [
					{
						id: "first",
						offset: 0,
						layer: 0,
						sourceTrackId: "track",
						element: first,
					},
					{
						id: "second",
						offset: 2,
						layer: 1,
						sourceTrackId: "track",
						element: second,
					},
				],
			},
		};
		const tracks: TimelineTrack[] = [
			{ id: "track", name: "Video", type: "media", elements: [container] },
		];

		const expanded = expandCompoundMediaTracks({ tracks });

		expect(expanded[0].elements.map((element) => element.startTime)).toEqual([
			10, 12,
		]);
		expect(
			expanded[0].elements.map((element) =>
				element.type === "media" ? element.mediaId : null
			)
		).toEqual(["media-1", "media-2"]);
	});

	it("renders only the active multicam angle", () => {
		const first = mediaElement({
			id: "angle-a",
			mediaId: "media-a",
			startTime: 0,
			duration: 4,
		});
		const second = mediaElement({
			id: "angle-b",
			mediaId: "media-b",
			startTime: 0,
			duration: 4,
		});
		const container: MediaElement = {
			...first,
			id: "multicam",
			duration: 4,
			compound: {
				kind: "multicam",
				activeClipId: "angle-b",
				clips: [
					{
						id: "angle-a",
						offset: 0,
						layer: 0,
						sourceTrackId: "a",
						element: first,
					},
					{
						id: "angle-b",
						offset: 0,
						layer: 1,
						sourceTrackId: "b",
						element: second,
					},
				],
			},
		};

		const expanded = expandCompoundMediaTracks({
			tracks: [
				{ id: "a", name: "Video", type: "media", elements: [container] },
			],
		});

		expect(expanded[0].elements).toHaveLength(1);
		expect(expanded[0].elements[0]).toMatchObject({
			type: "media",
			mediaId: "media-b",
		});
	});

	it("clips children to a trimmed container window", () => {
		const child = mediaElement({
			id: "child",
			mediaId: "media",
			startTime: 0,
			duration: 6,
		});
		const container: MediaElement = {
			...child,
			id: "container",
			startTime: 8,
			duration: 6,
			trimStart: 2,
			trimEnd: 1,
			compound: {
				kind: "compound",
				clips: [
					{
						id: "child",
						offset: 0,
						layer: 0,
						sourceTrackId: "track",
						element: child,
					},
				],
			},
		};

		const [expanded] = expandCompoundMediaTracks({
			tracks: [
				{ id: "track", name: "Video", type: "media", elements: [container] },
			],
		})[0].elements;

		expect(expanded).toMatchObject({ startTime: 8, trimStart: 2, trimEnd: 1 });
	});
});
