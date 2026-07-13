import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	resolveClipTransition,
	type MediaElement,
	type TimelineTrack,
} from "@/types/timeline";
import { storageService } from "@/lib/storage/storage-service";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
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

	afterEach(() => {
		clearAutoSaveTimer();
		vi.restoreAllMocks();
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

	it("updates second-release direction and easing without replacing the seam", () => {
		const transitionId = useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "whip-pan-left",
			type: "whip-pan",
			direction: "left",
			easing: "easeInOut",
			duration: 0.4,
		});

		useTimelineStore.getState().updateTransition({
			trackId: "track-1",
			transitionId: transitionId!,
			updates: { direction: "right", easing: "linear", duration: 0.7 },
		});

		expect(useTimelineStore.getState().tracks[0].transitions).toEqual([
			expect.objectContaining({
				id: transitionId,
				presetId: "whip-pan-left",
				type: "whip-pan",
				direction: "right",
				easing: "linear",
				duration: 0.7,
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

		useTimelineStore.getState().updateElementStartTime("track-1", "b", 2.5);

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

		expect(
			useTimelineStore.getState().tracks[0].transitions?.[0].duration
		).toBe(4);
	});

	it("prevents neighboring transition windows from overlapping a short clip", () => {
		const shortTrack: TimelineTrack = {
			...track(),
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 3 }),
				mediaElement({ id: "b", startTime: 3, duration: 1 }),
				mediaElement({ id: "c", startTime: 4, duration: 3 }),
			],
		};
		useTimelineStore.setState({
			_tracks: [shortTrack],
			tracks: [shortTrack],
			history: [],
			redoStack: [],
		});

		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 1.5,
		});
		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "b",
			toElementId: "c",
			presetId: "wipe-left",
			type: "wipe",
			direction: "left",
			duration: 1.5,
		});

		const updatedTrack = useTimelineStore.getState().tracks[0];
		const transitions = updatedTrack.transitions ?? [];
		expect(transitions.map((item) => item.duration)).toEqual([1.5, 0.5]);
		const left = resolveClipTransition({
			track: updatedTrack,
			transition: transitions[0],
		});
		const right = resolveClipTransition({
			track: updatedTrack,
			transition: transitions[1],
		});
		expect(left?.windowEnd).toBe(right?.windowStart);
	});

	it("restores transition edits through undo and redo", () => {
		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});
		expect(useTimelineStore.getState().tracks[0].transitions).toHaveLength(1);

		useTimelineStore.getState().undo();
		expect(useTimelineStore.getState().tracks[0].transitions ?? []).toEqual([]);

		useTimelineStore.getState().redo();
		expect(useTimelineStore.getState().tracks[0].transitions).toEqual([
			expect.objectContaining({
				fromElementId: "a",
				toElementId: "b",
				duration: 0.5,
			}),
		]);
	});

	it.each([
		{
			name: "delete",
			edit: () =>
				useTimelineStore.getState().removeElementFromTrack("track-1", "b"),
		},
		{
			name: "split",
			edit: () => useTimelineStore.getState().splitElement("track-1", "a", 1),
		},
		{
			name: "move to another track",
			edit: () =>
				useTimelineStore
					.getState()
					.moveElementToTrack("track-1", "track-2", "b"),
		},
	])("removes a stale transition after $name", ({ edit }) => {
		const secondTrack: TimelineTrack = {
			id: "track-2",
			name: "Second Track",
			type: "media",
			elements: [],
		};
		useTimelineStore.setState((state) => ({
			_tracks: [...state._tracks, secondTrack],
			tracks: [...state.tracks, secondTrack],
		}));
		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});

		edit();

		expect(
			useTimelineStore
				.getState()
				.tracks.flatMap((candidate) => candidate.transitions ?? [])
		).toEqual([]);
		expect(useTimelineStore.getState().selectedTransition).toBeNull();
	});

	it("preserves transitions through explicit save and reload", async () => {
		useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "slide-left",
			type: "slide",
			direction: "left",
			duration: 0.75,
		});
		const persistedTracks = structuredClone(useTimelineStore.getState().tracks);
		const save = vi
			.spyOn(storageService, "saveProjectTimeline")
			.mockResolvedValue();
		await useTimelineStore
			.getState()
			.saveProjectTimeline({ projectId: "project-1" });
		expect(save).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				tracks: expect.arrayContaining([
					expect.objectContaining({
						transitions: [
							expect.objectContaining({
								presetId: "slide-left",
								direction: "left",
							}),
						],
					}),
				]),
			})
		);

		vi.spyOn(storageService, "loadProjectTimeline").mockResolvedValue(
			persistedTracks
		);
		await useTimelineStore
			.getState()
			.loadProjectTimeline({ projectId: "project-1" });
		expect(useTimelineStore.getState().tracks[0].transitions).toEqual(
			persistedTracks[0].transitions
		);
	});

	it("keeps hard cut by default and synchronizes optional audio crossfade", () => {
		const transitionId = useTimelineStore.getState().addTransition({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});
		expect(useTimelineStore.getState().tracks[0].audioCrossfades ?? []).toEqual(
			[]
		);

		useTimelineStore.getState().setTransitionAudioCrossfade({
			trackId: "track-1",
			fromElementId: "a",
			toElementId: "b",
			duration: 0.5,
			enabled: true,
		});
		expect(useTimelineStore.getState().tracks[0].audioCrossfades).toEqual([
			expect.objectContaining({
				fromElementId: "a",
				toElementId: "b",
				duration: 0.5,
				curve: "equal-power",
			}),
		]);

		useTimelineStore.getState().updateTransition({
			trackId: "track-1",
			transitionId: transitionId!,
			updates: { duration: 0.75 },
		});
		expect(
			useTimelineStore.getState().tracks[0].audioCrossfades?.[0].duration
		).toBe(0.75);

		useTimelineStore.getState().removeTransition({
			trackId: "track-1",
			transitionId: transitionId!,
		});
		expect(useTimelineStore.getState().tracks[0].audioCrossfades).toEqual([]);
	});
});
