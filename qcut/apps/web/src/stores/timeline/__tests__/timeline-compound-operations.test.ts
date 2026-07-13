import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import {
	breakApartMediaContainer,
	createMediaContainer,
	selectMulticamClip,
} from "../timeline-compound-operations";

function clip({
	id,
	mediaId,
	startTime,
}: {
	id: string;
	mediaId: string;
	startTime: number;
}): MediaElement {
	return {
		id,
		mediaId,
		name: id,
		type: "media",
		startTime,
		duration: 3,
		trimStart: 0,
		trimEnd: 0,
	};
}

const tracks: TimelineTrack[] = [
	{
		id: "camera-a",
		name: "Camera A",
		type: "media",
		elements: [clip({ id: "a", mediaId: "media-a", startTime: 2 })],
	},
	{
		id: "camera-b",
		name: "Camera B",
		type: "media",
		elements: [clip({ id: "b", mediaId: "media-b", startTime: 3 })],
	},
];

const selectedElements = [
	{ trackId: "camera-a", elementId: "a" },
	{ trackId: "camera-b", elementId: "b" },
];

describe("timeline media containers", () => {
	it("replaces selected media with one persistent compound clip", () => {
		const result = createMediaContainer({
			tracks,
			selectedElements,
			containerId: "compound",
			kind: "compound",
		});

		expect(result.error).toBeUndefined();
		expect(result.container).toMatchObject({
			id: "compound",
			startTime: 2,
			duration: 4,
			compound: { kind: "compound" },
		});
		expect(result.tracks.flatMap((track) => track.elements)).toHaveLength(1);
		expect(result.container?.compound?.clips).toHaveLength(2);
	});

	it("switches the active multicam source and parent media identity", () => {
		const created = createMediaContainer({
			tracks,
			selectedElements,
			containerId: "multicam",
			kind: "multicam",
		});
		const switched = selectMulticamClip({
			tracks: created.tracks,
			trackId: created.trackId!,
			elementId: "multicam",
			clipId: "b",
		});
		const container = switched.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.id === "multicam");

		expect(switched.changed).toBe(true);
		expect(container).toMatchObject({
			type: "media",
			mediaId: "media-b",
			compound: { activeClipId: "b" },
		});
	});

	it("breaks a moved container back onto its source tracks", () => {
		const created = createMediaContainer({
			tracks,
			selectedElements,
			containerId: "compound",
			kind: "compound",
		});
		const moved = created.tracks.map((track) => ({
			...track,
			elements: track.elements.map((element) =>
				element.id === "compound" ? { ...element, startTime: 10 } : element
			),
		}));
		const restored = breakApartMediaContainer({
			tracks: moved,
			trackId: created.trackId!,
			elementId: "compound",
		});

		expect(restored.restoredCount).toBe(2);
		expect(
			restored.tracks.flatMap((track) =>
				track.elements.map((element) => [
					track.id,
					element.id,
					element.startTime,
				])
			)
		).toEqual([
			["camera-a", "a", 10],
			["camera-b", "b", 11],
		]);
	});
});
