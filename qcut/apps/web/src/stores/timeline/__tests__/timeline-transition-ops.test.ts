import { beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { useTimelineStore } from "../timeline-store";

function mediaElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function track(): TimelineTrack {
	return {
		id: "track-1",
		name: "Main Track",
		type: "media",
		isMain: true,
		elements: [
			mediaElement({ id: "a", startTime: 0, duration: 2 }),
			mediaElement({ id: "b", startTime: 2, duration: 2 }),
		],
	};
}

describe("timeline transition operations", () => {
	beforeEach(() => {
		const initialTrack = track();
		useTimelineStore.setState({
			_tracks: [initialTrack],
			tracks: [initialTrack],
			history: [],
			redoStack: [],
			selectedElements: [],
			selectedTransition: null,
		});
	});

	it("adds and selects a transition at a valid seam", () => {
		const transitionId = useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});

		expect(transitionId).toBeTruthy();
		expect(useTimelineStore.getState().tracks[0].transitions).toEqual([
			expect.objectContaining({
				id: transitionId,
				fromElementId: "a",
				toElementId: "b",
				duration: 0.5,
			}),
		]);
		expect(useTimelineStore.getState().selectedTransition).toEqual({
			trackId: "track-1",
			transitionId,
		});
	});

	it("replaces the preset without duplicating the seam", () => {
		const store = useTimelineStore.getState();
		const firstId = store.addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});
		const secondId = useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "wipe-left",
			type: "wipe",
			direction: "left",
			duration: 0.8,
		});

		expect(secondId).toBe(firstId);
		expect(useTimelineStore.getState().tracks[0].transitions).toEqual([
			expect.objectContaining({
				id: firstId,
				presetId: "wipe-left",
				type: "wipe",
				direction: "left",
			}),
		]);
	});

	it("removes a transition when a clip no longer touches the cut", () => {
		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});

		useTimelineStore
			.getState()
			.updateElementStartTime("track-1", "b", 2.5);

		expect(useTimelineStore.getState().tracks[0].transitions).toEqual([]);
		expect(useTimelineStore.getState().selectedTransition).toBeNull();
	});

	it("clamps duration to the available clips", () => {
		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 20,
		});

		expect(useTimelineStore.getState().tracks[0].transitions?.[0].duration).toBe(
			4
		);
	});
});
