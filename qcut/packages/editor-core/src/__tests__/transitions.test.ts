import { describe, expect, it } from "vitest";
import {
	findClosestMediaSeam,
	getTransitionMaxDuration,
	reconcileTrackTransitions,
	resolveClipTransition,
} from "../timeline/transitions.js";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "../types/timeline.js";

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

function transition({
	id,
	fromElementId,
	toElementId,
	duration = 1,
}: {
	id: string;
	fromElementId: string;
	toElementId: string;
	duration?: number;
}): ClipTransition {
	return {
		id,
		fromElementId,
		toElementId,
		presetId: "dissolve",
		type: "dissolve",
		duration,
		easing: "easeInOut",
	};
}

function mediaTrack({
	elements,
	transitions,
}: {
	elements: MediaElement[];
	transitions?: ClipTransition[];
}): TimelineTrack {
	return {
		id: "track-1",
		name: "Media",
		type: "media",
		elements,
		transitions,
	};
}

describe("clip transitions", () => {
	it("resolves a transition window centered on a touching cut", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 4 }),
				mediaElement({ id: "b", startTime: 4, duration: 3 }),
			],
		});

		const result = resolveClipTransition({
			track,
			transition: transition({
				id: "ab",
				fromElementId: "a",
				toElementId: "b",
				duration: 0.6,
			}),
		});

		expect(result).toMatchObject({
			cutTime: 4,
			windowStart: 3.7,
			windowEnd: 4.3,
			maxDuration: 6,
		});
	});

	it("rejects reversed, separated, and non-adjacent pairs", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 2 }),
				mediaElement({ id: "b", startTime: 2, duration: 2 }),
				mediaElement({ id: "c", startTime: 5, duration: 2 }),
			],
		});

		expect(
			resolveClipTransition({
				track,
				transition: transition({
					id: "ba",
					fromElementId: "b",
					toElementId: "a",
				}),
			})
		).toBeNull();
		expect(
			resolveClipTransition({
				track,
				transition: transition({
					id: "ac",
					fromElementId: "a",
					toElementId: "c",
				}),
			})
		).toBeNull();
		expect(
			resolveClipTransition({
				track,
				transition: transition({
					id: "bc",
					fromElementId: "b",
					toElementId: "c",
				}),
			})
		).toBeNull();
	});

	it("removes stale transitions after an edit breaks the seam", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 3 }),
				mediaElement({ id: "b", startTime: 4, duration: 3 }),
			],
			transitions: [
				transition({ id: "ab", fromElementId: "a", toElementId: "b" }),
			],
		});

		expect(reconcileTrackTransitions({ track }).transitions).toEqual([]);
	});

	it("limits two neighboring transitions to the middle clip duration", () => {
		const left = transition({
			id: "ab",
			fromElementId: "a",
			toElementId: "b",
			duration: 1.5,
		});
		const right = transition({
			id: "bc",
			fromElementId: "b",
			toElementId: "c",
			duration: 1.5,
		});
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 3 }),
				mediaElement({ id: "b", startTime: 3, duration: 1 }),
				mediaElement({ id: "c", startTime: 4, duration: 3 }),
			],
			transitions: [left, right],
		});

		const reconciled = reconcileTrackTransitions({ track });

		expect(reconciled.transitions).toEqual([
			left,
			{ ...right, duration: 0.5 },
		]);
		expect(
			getTransitionMaxDuration({
				track,
				fromElementId: "b",
				toElementId: "c",
				transitions: [left],
			})
		).toBe(0.5);
	});

	it("finds the closest touching seam within the drop threshold", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 2 }),
				mediaElement({ id: "b", startTime: 2, duration: 2 }),
			],
		});

		const closest = findClosestMediaSeam({
			track,
			time: 2.08,
			maxDistance: 0.1,
		});
		expect(closest?.cutTime).toBe(2);
		expect(closest?.distance).toBeCloseTo(0.08);
		expect(
			findClosestMediaSeam({ track, time: 2.2, maxDistance: 0.1 })
		).toBeNull();
	});
});
