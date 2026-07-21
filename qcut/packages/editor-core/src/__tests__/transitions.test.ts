import { describe, expect, it } from "vitest";
import {
	findClosestMediaSeam,
	reconcileTrackAudioCrossfades,
	getTransitionMaxDuration,
	reconcileTrackTransitions,
	resolveClipTransition,
	CLIP_TRANSITION_MAX_DURATION_SECONDS,
	CLIP_TRANSITION_MIN_DURATION_SECONDS,
	CLIP_TRANSITION_TYPES,
	isClipTransitionType,
} from "../timeline/transitions.js";
import type {
	AudioCrossfade,
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

function audioCrossfade({
	id,
	fromElementId,
	toElementId,
	duration = 1,
}: {
	id: string;
	fromElementId: string;
	toElementId: string;
	duration?: number;
}): AudioCrossfade {
	return {
		id,
		fromElementId,
		toElementId,
		duration,
		curve: "equal-power",
	};
}

describe("clip transitions", () => {
	it("recognizes every persisted transition engine", () => {
		expect(CLIP_TRANSITION_TYPES).toHaveLength(22);
		for (const type of CLIP_TRANSITION_TYPES) {
			expect(isClipTransitionType({ value: type })).toBe(true);
		}
		expect(isClipTransitionType({ value: "not-a-transition" })).toBe(false);
		expect(isClipTransitionType({ value: null })).toBe(false);
	});

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
			maxDuration: 5,
		});
	});

	it("clamps transition durations to the 0.1 through 5 second range", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 10 }),
				mediaElement({ id: "b", startTime: 10, duration: 10 }),
			],
		});

		const minimum = resolveClipTransition({
			track,
			transition: transition({
				id: "minimum",
				fromElementId: "a",
				toElementId: "b",
				duration: 0.01,
			}),
		});
		const maximum = resolveClipTransition({
			track,
			transition: transition({
				id: "maximum",
				fromElementId: "a",
				toElementId: "b",
				duration: 20,
			}),
		});

		expect(minimum?.transition.duration).toBe(
			CLIP_TRANSITION_MIN_DURATION_SECONDS
		);
		expect(maximum?.transition.duration).toBe(
			CLIP_TRANSITION_MAX_DURATION_SECONDS
		);
		expect(maximum?.maxDuration).toBe(CLIP_TRANSITION_MAX_DURATION_SECONDS);
	});

	it("rejects seams that cannot fit the minimum transition duration", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 0.04 }),
				mediaElement({ id: "b", startTime: 0.04, duration: 0.04 }),
			],
		});

		expect(
			resolveClipTransition({
				track,
				transition: transition({
					id: "too-short",
					fromElementId: "a",
					toElementId: "b",
					duration: 0.1,
				}),
			})
		).toBeNull();
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

		expect(reconciled.transitions).toEqual([left, { ...right, duration: 0.5 }]);
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

	it("reconciles audio crossfades with the same seam and overlap rules", () => {
		const track = mediaTrack({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 3 }),
				mediaElement({ id: "b", startTime: 3, duration: 1 }),
				mediaElement({ id: "c", startTime: 4, duration: 3 }),
			],
		});
		track.audioCrossfades = [
			audioCrossfade({
				id: "ab",
				fromElementId: "a",
				toElementId: "b",
				duration: 1.5,
			}),
			audioCrossfade({
				id: "bc",
				fromElementId: "b",
				toElementId: "c",
				duration: 1.5,
			}),
		];

		expect(reconcileTrackAudioCrossfades({ track }).audioCrossfades).toEqual([
			track.audioCrossfades[0],
			{ ...track.audioCrossfades[1], duration: 0.5 },
		]);

		track.elements[2] = { ...track.elements[2], startTime: 5 };
		expect(reconcileTrackAudioCrossfades({ track }).audioCrossfades).toEqual([
			track.audioCrossfades[0],
		]);
	});
});
