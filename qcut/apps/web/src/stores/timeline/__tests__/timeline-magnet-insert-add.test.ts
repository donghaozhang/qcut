import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * QTL-005 / T3 of docs/task/timeline-rules-vs-jianying/TASKS.md: with the
 * main-track magnet on, adding visual media from the panel inserts AT the
 * playhead — splitting the occupant and pushing everything downstream —
 * matching Jianying's + button (experiment E-add). Magnet off keeps the
 * legacy free-lane placement.
 */

function mediaElement({
	id,
	startTime,
	duration = 5,
}: {
	id: string;
	startTime: number;
	duration?: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
	};
}

function videoItem({ id = "clip", duration = 5 } = {}): MediaItem {
	return {
		id,
		name: `${id}.mp4`,
		type: "video",
		url: "",
		duration,
	} as MediaItem;
}

function setTracks({
	tracks,
	magnet,
}: {
	tracks: TimelineTrack[];
	magnet: boolean;
}) {
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
		selectedTransition: null,
		rippleEditingEnabled: false,
		mainTrackMagnetEnabled: magnet,
		linkedRippleEnabled: true,
	});
}

function mainTrackLayout(): { name: string; start: number; end: number }[] {
	const track = useTimelineStore
		.getState()
		.tracks.find((candidate) => candidate.isMain);
	return (track?.elements ?? [])
		.map((element) => ({
			name: element.name,
			start: element.startTime,
			end:
				element.startTime +
				element.duration -
				element.trimStart -
				element.trimEnd,
		}))
		.sort((left, right) => left.start - right.start);
}

function baseMainTrack(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "a", startTime: 0 }),
				mediaElement({ id: "b", startTime: 5 }),
			],
		},
	];
}

describe("addMediaAtTime with the main-track magnet", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		clearAutoSaveTimer();
		vi.restoreAllMocks();
	});

	it("splits the occupant at the playhead and pushes downstream right", () => {
		setTracks({ tracks: baseMainTrack(), magnet: true });
		const added = useTimelineStore
			.getState()
			.addMediaAtTime(videoItem({ id: "new" }), 2);

		expect(added).toBe(true);
		const layout = mainTrackLayout();
		// a(0-2) | new(2-7) | a-tail(7-10) | b(10-15): seamless, nothing lost.
		expect(layout.map(({ start, end }) => [start, end])).toEqual([
			[0, 2],
			[2, 7],
			[7, 10],
			[10, 15],
		]);
		for (let index = 1; index < layout.length; index++) {
			expect(layout[index].start).toBeCloseTo(layout[index - 1].end, 6);
		}
	});

	it("clamps a playhead past the content end flush to the last clip", () => {
		setTracks({ tracks: baseMainTrack(), magnet: true });
		useTimelineStore.getState().addMediaAtTime(videoItem({ id: "new" }), 30);

		// No hole: the clip butts against b's end at 10 instead of landing at 30.
		expect(mainTrackLayout().map(({ name, start }) => [name, start])).toEqual([
			["a", 0],
			["b", 5],
			["new.mp4", 10],
		]);
	});

	it("keeps the legacy free-lane placement with the magnet off", () => {
		setTracks({ tracks: baseMainTrack(), magnet: false });
		useTimelineStore.getState().addMediaAtTime(videoItem({ id: "new" }), 2);

		// Occupied at 2 on the main lane → a new media track is stacked; the
		// main track keeps its original two clips.
		expect(mainTrackLayout().map(({ name }) => name)).toEqual(["a", "b"]);
		const tracks = useTimelineStore.getState().tracks;
		expect(tracks.filter((track) => track.type === "media")).toHaveLength(2);
	});

	it("routes audio to audio lanes even with the magnet on", () => {
		setTracks({ tracks: baseMainTrack(), magnet: true });
		useTimelineStore
			.getState()
			.addMediaAtTime(
				{ ...videoItem({ id: "sound" }), type: "audio" } as MediaItem,
				2
			);

		expect(mainTrackLayout().map(({ name }) => name)).toEqual(["a", "b"]);
		const audioTrack = useTimelineStore
			.getState()
			.tracks.find((track) => track.type === "audio");
		expect(audioTrack?.elements.map((element) => element.name)).toEqual([
			"sound.mp4",
		]);
	});

	it("falls back to the lane search when the main track is locked", () => {
		const tracks = baseMainTrack();
		tracks[0].locked = true;
		setTracks({ tracks, magnet: true });
		useTimelineStore.getState().addMediaAtTime(videoItem({ id: "new" }), 2);

		expect(mainTrackLayout().map(({ name }) => name)).toEqual(["a", "b"]);
		const mediaTracks = useTimelineStore
			.getState()
			.tracks.filter((track) => track.type === "media");
		expect(mediaTracks).toHaveLength(2);
	});
});
