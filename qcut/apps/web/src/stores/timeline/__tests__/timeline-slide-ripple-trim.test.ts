import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import {
	calculateRippleTrim,
	calculateSlideEdit,
} from "@/lib/timeline/precision-edit";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * QTL-007: slide edits and ripple trims share the precision-edit math —
 * normal, reversed, retimed, and insufficient-handle fixtures are covered by
 * pure-function tests, and each store command produces one history entry.
 */

function mediaElement({
	id,
	startTime,
	duration = 2,
	trimStart = 0,
	trimEnd = 0,
	playbackRate,
	reverse,
	groupId,
	mediaId,
}: {
	id: string;
	startTime: number;
	duration?: number;
	trimStart?: number;
	trimEnd?: number;
	playbackRate?: number;
	reverse?: boolean;
	groupId?: string;
	mediaId?: string;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: mediaId ?? `${id}-media`,
		duration,
		startTime,
		trimStart,
		trimEnd,
		...(playbackRate !== undefined ? { playbackRate } : {}),
		...(reverse !== undefined ? { reverse } : {}),
		...(groupId ? { groupId } : {}),
	};
}

describe("calculateSlideEdit", () => {
	const left = mediaElement({
		id: "left",
		startTime: 0,
		duration: 3,
		trimEnd: 1,
	}); // visible 0-2
	const middle = mediaElement({ id: "middle", startTime: 2 }); // 2-4
	const right = mediaElement({
		id: "right",
		startTime: 4,
		duration: 3,
		trimStart: 1,
	}); // visible 4-6

	it("moves the clip while both neighbors absorb the change", () => {
		const result = calculateSlideEdit({
			element: middle,
			leftNeighbor: left,
			rightNeighbor: right,
			timelineDelta: 0.5,
		});
		expect(result?.appliedTimelineDelta).toBeCloseTo(0.5);
		expect(result?.updates).toEqual([
			{ id: "left", startTime: 0, trimStart: 0, trimEnd: 0.5 },
			{ id: "middle", startTime: 2.5, trimStart: 0, trimEnd: 0 },
			{ id: "right", startTime: 4.5, trimStart: 1.5, trimEnd: 0 },
		]);
	});

	it("clamps to the available handle and minimum duration", () => {
		const result = calculateSlideEdit({
			element: middle,
			leftNeighbor: left,
			rightNeighbor: right,
			timelineDelta: 5,
		});
		// Left handle allows 1s; the right neighbor could shrink to 1.9s.
		expect(result?.appliedTimelineDelta).toBeCloseTo(1);
	});

	it("consumes reversed and retimed neighbor handles in source time", () => {
		const reversedLeft = mediaElement({
			id: "left",
			startTime: 0,
			duration: 3,
			trimStart: 1,
			reverse: true,
		}); // visible 0-2; its timeline-right handle is trimStart
		const fastRight = mediaElement({
			id: "right",
			startTime: 4,
			duration: 6,
			trimStart: 2,
			playbackRate: 2,
		}); // visible 4-6 at 2x
		const result = calculateSlideEdit({
			element: middle,
			leftNeighbor: reversedLeft,
			rightNeighbor: fastRight,
			timelineDelta: 0.5,
		});
		expect(result?.appliedTimelineDelta).toBeCloseTo(0.5);
		expect(result?.updates[0]).toMatchObject({ id: "left", trimStart: 0.5 });
		// 0.5s of timeline at 2x consumes 1s of source into the right trim.
		expect(result?.updates[2]).toMatchObject({
			id: "right",
			startTime: 4.5,
			trimStart: 3,
		});
	});

	it("rejects non-adjacent neighbors", () => {
		const gapRight = mediaElement({ id: "right", startTime: 5 });
		expect(
			calculateSlideEdit({
				element: middle,
				leftNeighbor: left,
				rightNeighbor: gapRight,
				timelineDelta: 0.5,
			})
		).toBeNull();
	});
});

describe("calculateRippleTrim", () => {
	it("shortens and lengthens at either edge with clamps", () => {
		const element = mediaElement({
			id: "clip",
			startTime: 2,
			duration: 2.5,
			trimEnd: 0.5,
		}); // visible 2-4

		const shorten = calculateRippleTrim({
			durationDelta: -0.5,
			edge: "right",
			element,
		});
		expect(shorten?.appliedDurationDelta).toBeCloseTo(-0.5);
		expect(shorten?.updates[0]).toMatchObject({ trimEnd: 1 });

		const extend = calculateRippleTrim({
			durationDelta: 2,
			edge: "right",
			element,
		});
		// Only 0.5s of right handle exists.
		expect(extend?.appliedDurationDelta).toBeCloseTo(0.5);
		expect(extend?.updates[0]).toMatchObject({ trimEnd: 0 });

		const overShorten = calculateRippleTrim({
			durationDelta: -5,
			edge: "left",
			element,
		});
		// Clamped so 0.1s of clip remains.
		expect(overShorten?.appliedDurationDelta).toBeCloseTo(-1.9);
		expect(overShorten?.updates[0]).toMatchObject({ trimStart: 1.9 });
	});

	it("maps the timeline edge to the source trim for reversed, retimed clips", () => {
		const element = mediaElement({
			id: "clip",
			startTime: 0,
			duration: 8,
			trimEnd: 2,
			playbackRate: 2,
			reverse: true,
		}); // visible 3s at 2x; timeline-left handle is trimEnd when reversed
		const result = calculateRippleTrim({
			durationDelta: 0.5,
			edge: "left",
			element,
		});
		expect(result?.appliedDurationDelta).toBeCloseTo(0.5);
		expect(result?.updates[0]).toMatchObject({ trimEnd: 1, trimStart: 0 });
	});
});

describe("store commands", () => {
	function tracks(): TimelineTrack[] {
		return [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					mediaElement({
						id: "v1",
						startTime: 0,
						duration: 3,
						trimEnd: 1,
						groupId: "sep",
						mediaId: "m",
					}), // visible 0-2
					mediaElement({ id: "v2", startTime: 2, duration: 2.5, trimEnd: 0.5 }), // 2-4
					mediaElement({
						id: "v3",
						startTime: 4,
						duration: 3,
						trimStart: 1,
					}), // 4-6
				],
			},
			{
				id: "audio",
				name: "Audio",
				type: "audio",
				elements: [
					mediaElement({
						id: "a1",
						startTime: 0,
						groupId: "sep",
						mediaId: "m",
					}),
					mediaElement({ id: "a-late", startTime: 4 }),
				],
			},
			{
				id: "overlay",
				name: "Overlay",
				type: "media",
				elements: [mediaElement({ id: "o1", startTime: 4 })],
			},
		];
	}

	beforeEach(() => {
		const initial = tracks();
		useTimelineStore.setState({
			_tracks: initial,
			tracks: initial,
			history: [],
			redoStack: [],
			selectedElements: [],
			selectedTransition: null,
			rippleEditingEnabled: false,
			linkedRippleEnabled: true,
		});
	});

	afterEach(() => clearAutoSaveTimer());

	it("slideElement adjusts both neighbors in one history entry", () => {
		const applied = useTimelineStore.getState().slideElement({
			trackId: "main",
			elementId: "v2",
			timelineDelta: 0.5,
		});
		expect(applied).toBeCloseTo(0.5);

		const elements =
			useTimelineStore.getState().tracks.find((track) => track.id === "main")
				?.elements ?? [];
		expect(elements.find((element) => element.id === "v1")).toMatchObject({
			trimEnd: 0.5,
		});
		expect(elements.find((element) => element.id === "v2")).toMatchObject({
			startTime: 2.5,
		});
		expect(elements.find((element) => element.id === "v3")).toMatchObject({
			startTime: 4.5,
			trimStart: 1.5,
		});
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("rippleTrimElement shifts downstream across the ripple domain", () => {
		const applied = useTimelineStore.getState().rippleTrimElement({
			trackId: "main",
			elementId: "v2",
			edge: "right",
			durationDelta: -0.5,
		});
		expect(applied).toBeCloseTo(-0.5);

		const state = useTimelineStore.getState();
		const main =
			state.tracks.find((track) => track.id === "main")?.elements ?? [];
		expect(main.find((element) => element.id === "v2")).toMatchObject({
			trimEnd: 1,
			startTime: 2,
		});
		expect(main.find((element) => element.id === "v3")?.startTime).toBeCloseTo(
			3.5
		);
		// The linked audio lane follows; a1 sits before the edit and holds.
		const audio =
			state.tracks.find((track) => track.id === "audio")?.elements ?? [];
		expect(audio.find((element) => element.id === "a1")?.startTime).toBe(0);
		expect(
			audio.find((element) => element.id === "a-late")?.startTime
		).toBeCloseTo(3.5);
		// Unrelated overlay holds its position.
		expect(
			state.tracks.find((track) => track.id === "overlay")?.elements[0]
				.startTime
		).toBe(4);
		expect(state.history).toHaveLength(1);
	});

	it("rippleTrimElement respects the linked-ripple toggle and locks", () => {
		useTimelineStore.setState({ linkedRippleEnabled: false });
		useTimelineStore.getState().rippleTrimElement({
			trackId: "main",
			elementId: "v2",
			edge: "right",
			durationDelta: -0.5,
		});
		expect(
			useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "audio")
				?.elements.find((element) => element.id === "a-late")?.startTime
		).toBe(4);

		// Locked linked dependency blocks the whole command.
		const lockedTracks = tracks().map((track) =>
			track.id === "audio" ? { ...track, locked: true } : track
		);
		useTimelineStore.setState({
			_tracks: lockedTracks,
			tracks: lockedTracks,
			history: [],
			redoStack: [],
			linkedRippleEnabled: true,
		});
		const applied = useTimelineStore.getState().rippleTrimElement({
			trackId: "main",
			elementId: "v2",
			edge: "right",
			durationDelta: -0.5,
		});
		expect(applied).toBe(0);
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});
});
