import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

function mediaElement({
	id,
	startTime,
	trimEnd,
	trimStart,
}: {
	id: string;
	startTime: number;
	trimEnd: number;
	trimStart: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		duration: 10,
		startTime,
		trimStart,
		trimEnd,
	};
}

function precisionTrack(): TimelineTrack {
	return {
		id: "track-1",
		name: "Main Track",
		type: "media",
		isMain: true,
		elements: [
			mediaElement({ id: "a", startTime: 0, trimStart: 1, trimEnd: 2 }),
			mediaElement({ id: "b", startTime: 7, trimStart: 2, trimEnd: 1 }),
		],
		transitions: [
			{
				id: "transition-1",
				fromElementId: "a",
				toElementId: "b",
				presetId: "dissolve",
				type: "dissolve",
				duration: 1,
				easing: "easeInOut",
			},
		],
		audioCrossfades: [
			{
				id: "crossfade-1",
				fromElementId: "a",
				toElementId: "b",
				duration: 1,
				curve: "equal-power",
			},
		],
	};
}

describe("timeline precision edit operations", () => {
	beforeEach(() => {
		const track = precisionTrack();
		useTimelineStore.setState({
			_tracks: [track],
			tracks: [track],
			history: [],
			redoStack: [],
		});
	});

	afterEach(() => clearAutoSaveTimer());

	it("applies a slip atomically and restores it with one undo", () => {
		const applied = useTimelineStore.getState().slipElement({
			elementId: "a",
			timelineDelta: 1,
			trackId: "track-1",
		});
		const element = useTimelineStore.getState().tracks[0].elements[0];

		expect(applied).toBe(1);
		expect(element).toEqual(
			expect.objectContaining({ startTime: 0, trimStart: 2, trimEnd: 1 })
		);
		expect(useTimelineStore.getState().history).toHaveLength(1);

		useTimelineStore.getState().undo();
		expect(useTimelineStore.getState().tracks[0].elements[0]).toEqual(
			expect.objectContaining({ startTime: 0, trimStart: 1, trimEnd: 2 })
		);
	});

	it("rolls both clips in one commit and keeps seam effects valid", () => {
		const applied = useTimelineStore.getState().rollEdit({
			fromElementId: "a",
			timelineDelta: 1,
			toElementId: "b",
			trackId: "track-1",
		});
		const track = useTimelineStore.getState().tracks[0];

		expect(applied).toBe(1);
		expect(track.elements[0]).toEqual(
			expect.objectContaining({ startTime: 0, trimStart: 1, trimEnd: 1 })
		);
		expect(track.elements[1]).toEqual(
			expect.objectContaining({ startTime: 8, trimStart: 3, trimEnd: 1 })
		);
		expect(track.transitions).toEqual([
			expect.objectContaining({ id: "transition-1", duration: 1 }),
		]);
		expect(track.audioCrossfades).toEqual([
			expect.objectContaining({ id: "crossfade-1", duration: 1 }),
		]);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("does not write state or history for unsupported and locked edits", () => {
		useTimelineStore.setState((state) => ({
			_tracks: state._tracks.map((track) => ({
				...track,
				locked: true,
			})),
			tracks: state.tracks.map((track) => ({ ...track, locked: true })),
		}));
		expect(
			useTimelineStore.getState().rollEdit({
				fromElementId: "a",
				timelineDelta: 1,
				toElementId: "b",
				trackId: "track-1",
			})
		).toBe(0);
		expect(useTimelineStore.getState().history).toHaveLength(0);

		useTimelineStore.setState((state) => ({
			_tracks: state._tracks.map((track) => ({
				...track,
				locked: false,
				elements: track.elements.map((element) =>
					element.id === "a" && element.type === "media"
						? {
								...element,
								speedKeyframes: [
									{
										id: "speed",
										frame: 0,
										value: 1,
										easing: "linear",
									},
								],
							}
						: element
				),
			})),
			tracks: state.tracks,
		}));
		expect(
			useTimelineStore.getState().slipElement({
				elementId: "a",
				timelineDelta: 1,
				trackId: "track-1",
			})
		).toBe(0);
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});
});
