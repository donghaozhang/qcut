import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
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

	it("does not mutate state or history for missing clips and invalid ranges", () => {
		useTimelineStore
			.getState()
			.removeElementFromTrackWithRipple("main", "missing");
		useTimelineStore.getState().rippleDeleteAcrossTracks(3, 1);

		expect(elementStartTimes({ trackId: "main" })).toEqual([0, 2, 4]);
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});
});
