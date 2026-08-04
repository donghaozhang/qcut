import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

// Imported dynamically: playback-store pre-loads the timeline store at module
// top level, and importing it before the timeline store lets that in-flight
// load hand this file a not-yet-populated namespace.
let usePlaybackStore: typeof import("@/stores/editor/playback-store")["usePlaybackStore"];

/**
 * QTL-004 transactional history: a history entry restores the full editing
 * context — tracks, selection, selected transition, and playhead — and
 * undo→redo→undo round-trips.
 */

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

function baseTracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "a", startTime: 0 }),
				mediaElement({ id: "b", startTime: 2 }),
			],
			transitions: [
				{
					id: "t1",
					fromElementId: "a",
					toElementId: "b",
					presetId: "dissolve",
					type: "dissolve",
					duration: 0.5,
					easing: "easeInOut",
				},
			],
		},
	];
}

describe("timeline transactional history", () => {
	beforeEach(async () => {
		usePlaybackStore = (await import("@/stores/editor/playback-store"))
			.usePlaybackStore;
		const tracks = baseTracks();
		useTimelineStore.setState({
			_tracks: tracks,
			tracks,
			history: [],
			redoStack: [],
			selectedElements: [],
			selectedTransition: null,
			rippleEditingEnabled: false,
		});
		usePlaybackStore.setState({ currentTime: 5, duration: 100 });
	});

	afterEach(() => clearAutoSaveTimer());

	it("undo and redo restore selection and playhead with the tracks", () => {
		useTimelineStore.getState().selectElement("main", "a");

		const newElementId = useTimelineStore.getState().addElementToTrack("main", {
			type: "media",
			mediaId: "new-media",
			name: "new",
			duration: 2,
			startTime: 8,
			trimStart: 0,
			trimEnd: 0,
		});
		expect(newElementId).not.toBeNull();
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: newElementId },
		]);

		// The user scrubs away after the edit.
		usePlaybackStore.setState({ currentTime: 9 });

		useTimelineStore.getState().undo();
		expect(
			useTimelineStore
				.getState()
				.tracks[0].elements.map((element) => element.id)
		).toEqual(["a", "b"]);
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: "a" },
		]);
		expect(usePlaybackStore.getState().currentTime).toBe(5);

		useTimelineStore.getState().redo();
		expect(
			useTimelineStore
				.getState()
				.tracks[0].elements.map((element) => element.id)
		).toEqual(["a", "b", newElementId]);
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: newElementId },
		]);
		expect(usePlaybackStore.getState().currentTime).toBe(9);

		// Round trip: undo works again after a redo.
		useTimelineStore.getState().undo();
		expect(
			useTimelineStore
				.getState()
				.tracks[0].elements.map((element) => element.id)
		).toEqual(["a", "b"]);
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: "a" },
		]);
	});

	it("restores the selected transition alongside the tracks", () => {
		useTimelineStore
			.getState()
			.selectTransition({ trackId: "main", transitionId: "t1" });
		useTimelineStore
			.getState()
			.removeTransition({ trackId: "main", transitionId: "t1" });

		expect(useTimelineStore.getState().selectedTransition).toBeNull();
		expect(useTimelineStore.getState().tracks[0].transitions).toEqual([]);

		useTimelineStore.getState().undo();
		expect(useTimelineStore.getState().tracks[0].transitions).toHaveLength(1);
		expect(useTimelineStore.getState().selectedTransition).toEqual({
			trackId: "main",
			transitionId: "t1",
		});
	});

	it("keeps one history entry per command for batch deletion", () => {
		useTimelineStore.setState({
			selectedElements: [
				{ trackId: "main", elementId: "a" },
				{ trackId: "main", elementId: "b" },
			],
		});
		useTimelineStore.getState().deleteSelectedElementsWithRipple();
		expect(useTimelineStore.getState().history).toHaveLength(1);

		useTimelineStore.getState().undo();
		expect(
			useTimelineStore
				.getState()
				.tracks[0].elements.map((element) => element.id)
		).toEqual(["a", "b"]);
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: "a" },
			{ trackId: "main", elementId: "b" },
		]);
	});

	it("multi-select toggles without duplicating entries", () => {
		useTimelineStore.getState().selectElement("main", "a");
		useTimelineStore.getState().selectElement("main", "b", true);
		expect(useTimelineStore.getState().selectedElements).toHaveLength(2);

		// Selecting an already-selected element with multi toggles it off,
		// never appends a duplicate.
		useTimelineStore.getState().selectElement("main", "b", true);
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: "a" },
		]);

		useTimelineStore.getState().selectElement("main", "b", true);
		useTimelineStore.getState().selectElement("main", "b", true);
		const keys = useTimelineStore
			.getState()
			.selectedElements.map(
				(selection) => `${selection.trackId}:${selection.elementId}`
			);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
