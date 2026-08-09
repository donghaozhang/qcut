import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

function mediaElement({
	id,
	startTime,
	duration = 2,
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

function rippleTracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "a", startTime: 0 }),
				mediaElement({ id: "b", startTime: 2 }),
				mediaElement({ id: "c", startTime: 4 }),
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [mediaElement({ id: "overlay-a", startTime: 4 })],
		},
	];
}

function elementStartTimes({ trackId }: { trackId: string }): number[] {
	return (
		useTimelineStore
			.getState()
			.tracks.find((track) => track.id === trackId)
			?.elements.map((element) => element.startTime) ?? []
	);
}

describe("timeline ripple operations", () => {
	beforeEach(() => {
		const tracks = rippleTracks();
		useTimelineStore.setState({
			_tracks: tracks,
			tracks,
			history: [],
			redoStack: [],
			rippleEditingEnabled: true,
			selectedElements: [{ trackId: "main", elementId: "b" }],
		});
	});

	afterEach(() => clearAutoSaveTimer());

	it("removes a clip, closes only its track gap, and clears stale selection", () => {
		useTimelineStore.getState().removeElementFromTrackWithRipple("main", "b");

		expect(
			useTimelineStore
				.getState()
				.tracks[0].elements.map((element) => element.id)
		).toEqual(["a", "c"]);
		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2]);
		expect(elementStartTimes({ trackId: "overlay" })).toEqual([4]);
		expect(useTimelineStore.getState().selectedElements).toEqual([]);
		expect(useTimelineStore.getState().history).toHaveLength(1);

		useTimelineStore.getState().undo();
		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 4]);
	});

	it("moves later clips by the same delta without changing other tracks", () => {
		useTimelineStore
			.getState()
			.updateElementStartTimeWithRipple("main", "b", 3);

		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 3, 5]);
		expect(elementStartTimes({ trackId: "overlay" })).toEqual([4]);
		expect(useTimelineStore.getState().history).toHaveLength(1);

		useTimelineStore.getState().undo();
		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 4]);
	});

	it("ripples every non-excluded track across a deleted time range", () => {
		const tracks = rippleTracks().map((track) =>
			track.id === "main"
				? {
						...track,
						elements: track.elements.map((element) =>
							element.id === "c" ? { ...element, startTime: 8 } : element
						),
					}
				: track
		);
		useTimelineStore.setState({ _tracks: tracks, tracks });
		useTimelineStore.getState().rippleDeleteAcrossTracks(6, 8, ["overlay"]);

		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 6]);
		expect(elementStartTimes({ trackId: "overlay" })).toEqual([4]);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("deletes a selected batch and ripples every linked track once", () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					mediaElement({ id: "a", startTime: 0 }),
					mediaElement({ id: "b", startTime: 2 }),
					mediaElement({ id: "c", startTime: 6 }),
				],
			},
			{
				id: "overlay",
				name: "Overlay",
				type: "media",
				elements: [
					mediaElement({ id: "overlay-a", startTime: 2 }),
					mediaElement({ id: "overlay-b", startTime: 6 }),
				],
			},
		];
		useTimelineStore.setState({
			_tracks: tracks,
			tracks,
			history: [],
			redoStack: [],
			selectedElements: [
				{ trackId: "main", elementId: "b" },
				{ trackId: "overlay", elementId: "overlay-a" },
			],
		});

		const result = useTimelineStore
			.getState()
			.deleteSelectedElementsWithRipple();

		expect(result).toMatchObject({
			deletedElements: 2,
			splitElements: 0,
			totalRemovedDuration: 2,
		});
		expect(
			useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "main")
				?.elements.map((element) => element.id)
		).toEqual(["a", "c"]);
		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 4]);
		expect(elementStartTimes({ trackId: "overlay" })).toEqual([4]);
		expect(useTimelineStore.getState().selectedElements).toEqual([]);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("keeps unrelated tracks fixed and preserves empty tracks", () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					mediaElement({ id: "a", startTime: 0 }),
					mediaElement({ id: "b", startTime: 2 }),
					mediaElement({ id: "c", startTime: 6 }),
				],
			},
			{
				id: "overlay",
				name: "Overlay",
				type: "media",
				elements: [
					mediaElement({ id: "overlap", startTime: 2 }),
					mediaElement({ id: "following", startTime: 6 }),
				],
			},
			{
				id: "empty",
				name: "Empty",
				type: "media",
				elements: [],
			},
		];
		useTimelineStore.setState({
			_tracks: tracks,
			tracks,
			history: [],
			redoStack: [],
			selectedElements: [{ trackId: "main", elementId: "b" }],
		});

		const result = useTimelineStore
			.getState()
			.deleteSelectedElementsWithRipple();

		expect(result).toMatchObject({
			deletedElements: 1,
			splitElements: 0,
			totalRemovedDuration: 2,
		});
		// The overlay track holds no linked dependency of the edited track, so
		// it is outside the ripple domain and must not move (QTL-003).
		expect(
			useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "overlay")
				?.elements.map((element) => [element.id, element.startTime])
		).toEqual([
			["overlap", 2],
			["following", 6],
		]);
		expect(
			useTimelineStore.getState().tracks.some((track) => track.id === "empty")
		).toBe(true);
	});

	it("moves following clips when a speed change alters clip duration", () => {
		useTimelineStore
			.getState()
			.updateMediaTiming("main", "b", { playbackRate: 2 });

		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 3]);
		expect(elementStartTimes({ trackId: "overlay" })).toEqual([4]);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("keeps separated audio linked when a speed change alters duration", () => {
		const tracks = rippleTracks()
			.map((track) =>
				track.id === "main"
					? {
							...track,
							elements: track.elements.map((element) =>
								element.id === "b"
									? { ...element, groupId: "separated-b" }
									: element
							),
						}
					: track
			)
			.concat({
				id: "audio",
				name: "Audio",
				type: "audio",
				elements: [
					{
						...mediaElement({ id: "b-audio", startTime: 2 }),
						mediaId: "b-media",
						groupId: "separated-b",
					},
					mediaElement({ id: "audio-following", startTime: 4 }),
				],
			});
		useTimelineStore.setState({ _tracks: tracks, tracks });

		useTimelineStore
			.getState()
			.updateMediaTiming("main", "b", { playbackRate: 2 });

		const audioElements =
			useTimelineStore.getState().tracks.find((track) => track.id === "audio")
				?.elements ?? [];
		expect(audioElements[0]).toMatchObject({
			id: "b-audio",
			playbackRate: 2,
			startTime: 2,
		});
		expect(audioElements[1]).toMatchObject({
			id: "audio-following",
			startTime: 3,
		});
	});

	it("preserves downstream gaps while a speed curve changes duration", () => {
		const tracks = rippleTracks().map((track) =>
			track.id === "main"
				? {
						...track,
						elements: track.elements.map((element) =>
							element.id === "c" ? { ...element, startTime: 5 } : element
						),
					}
				: track
		);
		useTimelineStore.setState({ _tracks: tracks, tracks });

		useTimelineStore.getState().updateMediaTiming("main", "b", {
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 0.5, easing: "linear" },
				{ id: "normal", frame: 60, value: 1, easing: "linear" },
			],
		});

		const [first, changed, following] =
			useTimelineStore.getState().tracks[0].elements;
		expect(first.startTime).toBe(0);
		expect(changed.startTime).toBe(2);
		expect(following.startTime).toBeGreaterThan(5);
		expect(changed.type).toBe("media");
		if (changed.type !== "media") return;
		expect(
			following.startTime -
				(changed.startTime + getMediaTimelineDuration(changed))
		).toBeCloseTo(1);
	});

	it("does not shift later clips for duration-neutral timing changes", () => {
		useTimelineStore
			.getState()
			.updateMediaTiming("main", "b", { reverse: true });

		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 4]);
	});

	it("does not mutate state or history for missing clips and invalid ranges", () => {
		useTimelineStore
			.getState()
			.removeElementFromTrackWithRipple("main", "missing");
		useTimelineStore.getState().rippleDeleteAcrossTracks(3, 1);

		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 4]);
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});
});
