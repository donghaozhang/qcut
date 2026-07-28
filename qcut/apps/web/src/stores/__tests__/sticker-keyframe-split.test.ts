import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	interpolateStickerKeyframes,
	STICKER_KEYFRAME_PROPERTIES,
} from "@/lib/stickers/sticker-keyframes";
import { MAX_STICKER_SPLIT_SAMPLES_PER_SEGMENT } from "@/lib/stickers/sticker-keyframe-slice";
import { useProjectStore } from "@/stores/project-store";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TProject } from "@/types/project";
import type {
	StickerElement,
	StickerPropertyKeyframe,
	TimelineTrack,
} from "@/types/timeline";

const PROJECT_FPS = 24;
const STICKER_TRACK_ID = "sticker-track";

function keyframe({
	id,
	frame,
	value,
	easing = "linear",
}: {
	id: string;
	frame: number;
	value: number;
	easing?: StickerPropertyKeyframe["easing"];
}): StickerPropertyKeyframe {
	return { id, frame, value, easing };
}

function interpolatedValue({
	keyframes,
	frame,
}: {
	keyframes: StickerPropertyKeyframe[];
	frame: number;
}): number {
	const value = interpolateStickerKeyframes({ keyframes, frame });
	if (value === undefined) {
		throw new Error("Expected a value from a non-empty keyframe track");
	}
	return value;
}

function stickerElement({
	duration = 4,
	keyframes,
	startTime = 0,
	trimStart = 0,
	trimEnd = 0,
}: {
	duration?: number;
	keyframes: StickerElement["keyframes"];
	startTime?: number;
	trimStart?: number;
	trimEnd?: number;
}): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		stickerId: "sticker-source",
		mediaId: "media-sticker",
		name: "Sticker",
		startTime,
		duration,
		trimStart,
		trimEnd,
		keyframes,
	};
}

function timelineTracks({
	element,
}: {
	element: StickerElement;
}): TimelineTrack[] {
	return [
		{
			id: STICKER_TRACK_ID,
			name: "Stickers",
			type: "sticker",
			elements: [element],
		},
		{
			id: "main-track",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [],
		},
	];
}

function resetTimeline({ element }: { element: StickerElement }): void {
	clearAutoSaveTimer();
	const tracks = timelineTracks({ element });
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
	});
}

function stickerElements(): StickerElement[] {
	return useTimelineStore
		.getState()
		._tracks.flatMap((track) =>
			track.elements.filter(
				(element): element is StickerElement => element.type === "sticker"
			)
		);
}

function expectKeyframesInsideClip({
	element,
}: {
	element: StickerElement;
}): void {
	const maximumFrame = Math.round(
		(element.duration - element.trimStart - element.trimEnd) * PROJECT_FPS
	);
	for (const propertyKeyframes of Object.values(element.keyframes ?? {})) {
		for (const propertyKeyframe of propertyKeyframes ?? []) {
			expect(propertyKeyframe.frame).toBeGreaterThanOrEqual(0);
			expect(propertyKeyframe.frame).toBeLessThanOrEqual(maximumFrame);
		}
	}
}

describe("sticker keyframes across timeline splits", () => {
	beforeEach(() => {
		useProjectStore.setState({
			activeProject: { fps: PROJECT_FPS } as TProject,
		});
	});

	afterEach(() => {
		clearAutoSaveTimer();
	});

	it("uses project fps and rebases the ordinary split right side to frame zero", () => {
		resetTimeline({
			element: stickerElement({
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 0 }),
						keyframe({ id: "end", frame: 96, value: 96 }),
					],
				},
			}),
		});

		const rightId = useTimelineStore
			.getState()
			.splitElement(STICKER_TRACK_ID, "sticker-element", 1);
		const left = stickerElements().find(
			(element) => element.id === "sticker-element"
		);
		const right = stickerElements().find((element) => element.id === rightId);

		expect(
			left?.keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 0 },
			{ frame: 24, value: 24 },
		]);
		expect(
			right?.keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 24 },
			{ frame: 72, value: 96 },
		]);
	});

	it("slices every sticker keyframe property through the shared path", () => {
		const keyframes: NonNullable<StickerElement["keyframes"]> = {};
		for (const [index, property] of STICKER_KEYFRAME_PROPERTIES.entries()) {
			keyframes[property] = [
				keyframe({ id: `${property}-start`, frame: 0, value: index }),
				keyframe({
					id: `${property}-end`,
					frame: 96,
					value: index + 96,
				}),
			];
		}
		resetTimeline({ element: stickerElement({ keyframes }) });

		useTimelineStore
			.getState()
			.splitElement(STICKER_TRACK_ID, "sticker-element", 1);
		const [left, right] = stickerElements().sort(
			(first, second) => first.startTime - second.startTime
		);

		expect(Object.keys(left.keyframes ?? {})).toHaveLength(
			STICKER_KEYFRAME_PROPERTIES.length
		);
		for (const [index, property] of STICKER_KEYFRAME_PROPERTIES.entries()) {
			expect(left.keyframes?.[property]?.at(-1)?.value).toBe(index + 24);
			expect(right.keyframes?.[property]?.[0]).toMatchObject({
				frame: 0,
				value: index + 24,
			});
		}
	});

	it("keeps keyframes clip-local when the sticker already has source trims", () => {
		resetTimeline({
			element: stickerElement({
				duration: 6,
				startTime: 2,
				trimStart: 1,
				trimEnd: 1,
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 0 }),
						keyframe({ id: "end", frame: 96, value: 96 }),
					],
				},
			}),
		});

		useTimelineStore
			.getState()
			.splitElement(STICKER_TRACK_ID, "sticker-element", 3);
		const [left, right] = stickerElements().sort(
			(first, second) => first.startTime - second.startTime
		);

		expect(left.keyframes?.x?.at(-1)?.value).toBe(24);
		expect(
			right.keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 24 },
			{ frame: 72, value: 96 },
		]);
		expectKeyframesInsideClip({ element: left });
		expectKeyframesInsideClip({ element: right });
	});

	it("keeps a nonlinear split boundary continuous without per-frame expansion", () => {
		const sourceKeyframes = [
			keyframe({ id: "start", frame: 0, value: 10 }),
			keyframe({
				id: "end",
				frame: 9_600,
				value: 90,
				easing: "easeInOut",
			}),
		];
		const splitFrame = 30;
		const expectedBoundary = interpolatedValue({
			keyframes: sourceKeyframes,
			frame: splitFrame,
		});
		resetTimeline({
			element: stickerElement({
				duration: 400,
				keyframes: { x: sourceKeyframes },
			}),
		});

		useTimelineStore
			.getState()
			.splitElement(
				STICKER_TRACK_ID,
				"sticker-element",
				splitFrame / PROJECT_FPS
			);
		const [left, right] = stickerElements().sort(
			(first, second) => first.startTime - second.startTime
		);
		const leftBoundary = left.keyframes?.x?.at(-1);
		const rightBoundary = right.keyframes?.x?.[0];

		expect(leftBoundary?.value).toBeCloseTo(expectedBoundary);
		expect(leftBoundary?.easing).toBe("linear");
		expect(rightBoundary?.frame).toBe(0);
		expect(rightBoundary?.value).toBeCloseTo(expectedBoundary);
		expect(left.keyframes?.x?.length).toBeLessThanOrEqual(
			sourceKeyframes.length + MAX_STICKER_SPLIT_SAMPLES_PER_SEGMENT + 2
		);
		expect(right.keyframes?.x?.length).toBeLessThanOrEqual(
			sourceKeyframes.length + MAX_STICKER_SPLIT_SAMPLES_PER_SEGMENT + 2
		);
	});

	it("keeps later nonlinear split boundaries faithful after an earlier split", () => {
		const sourceKeyframes = [
			keyframe({ id: "start", frame: 0, value: 10 }),
			keyframe({
				id: "end",
				frame: 96,
				value: 90,
				easing: "easeInOut",
			}),
		];
		const firstSplitFrame = 72;
		const secondSplitFrame = 24;
		const expectedFirstBoundary = interpolatedValue({
			keyframes: sourceKeyframes,
			frame: firstSplitFrame,
		});
		const expectedSecondBoundary = interpolatedValue({
			keyframes: sourceKeyframes,
			frame: secondSplitFrame,
		});
		resetTimeline({
			element: stickerElement({ keyframes: { x: sourceKeyframes } }),
		});

		useTimelineStore
			.getState()
			.splitElement(
				STICKER_TRACK_ID,
				"sticker-element",
				firstSplitFrame / PROJECT_FPS
			);
		useTimelineStore
			.getState()
			.splitElement(
				STICKER_TRACK_ID,
				"sticker-element",
				secondSplitFrame / PROJECT_FPS
			);
		const [first, second, third] = stickerElements().sort(
			(left, right) => left.startTime - right.startTime
		);

		expect(first.keyframes?.x?.at(-1)?.value).toBeCloseTo(
			expectedSecondBoundary
		);
		expect(second.keyframes?.x?.[0]?.value).toBeCloseTo(expectedSecondBoundary);
		expect(second.keyframes?.x?.at(-1)?.value).toBeCloseTo(
			expectedFirstBoundary
		);
		expect(third.keyframes?.x?.[0]?.value).toBeCloseTo(expectedFirstBoundary);
	});

	it("crops keyframes when keeping only the left side", () => {
		resetTimeline({
			element: stickerElement({
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 0 }),
						keyframe({ id: "end", frame: 96, value: 96 }),
					],
				},
			}),
		});

		useTimelineStore
			.getState()
			.splitAndKeepLeft(STICKER_TRACK_ID, "sticker-element", 1);

		expect(
			stickerElements()[0].keyframes?.x?.map(({ frame, value }) => ({
				frame,
				value,
			}))
		).toEqual([
			{ frame: 0, value: 0 },
			{ frame: 24, value: 24 },
		]);
	});

	it("rebases keyframes when keeping only the right side", () => {
		resetTimeline({
			element: stickerElement({
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 0 }),
						keyframe({ id: "end", frame: 96, value: 96 }),
					],
				},
			}),
		});

		useTimelineStore
			.getState()
			.splitAndKeepRight(STICKER_TRACK_ID, "sticker-element", 1);

		expect(
			stickerElements()[0].keyframes?.x?.map(({ frame, value }) => ({
				frame,
				value,
			}))
		).toEqual([
			{ frame: 0, value: 24 },
			{ frame: 72, value: 96 },
		]);
	});

	it("slices both retained sides of a deleted timeline range", () => {
		resetTimeline({
			element: stickerElement({
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 0 }),
						keyframe({ id: "end", frame: 96, value: 96 }),
					],
				},
			}),
		});

		useTimelineStore.getState().deleteTimeRange({
			startTime: 1,
			endTime: 3,
			trackIds: [STICKER_TRACK_ID],
			ripple: false,
		});
		const [left, right] = stickerElements().sort(
			(first, second) => first.startTime - second.startTime
		);

		expect(
			left.keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 0 },
			{ frame: 24, value: 24 },
		]);
		expect(
			right.keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 72 },
			{ frame: 24, value: 96 },
		]);
	});

	it("removes remote keys instead of letting export clamp them over the boundary", () => {
		const sourceKeyframes = [
			keyframe({ id: "start", frame: 0, value: 0 }),
			keyframe({ id: "remote", frame: 120, value: 500 }),
		];
		const splitFrame = 48;
		const expectedBoundary = interpolatedValue({
			keyframes: sourceKeyframes,
			frame: splitFrame,
		});
		resetTimeline({
			element: stickerElement({ keyframes: { x: sourceKeyframes } }),
		});

		useTimelineStore
			.getState()
			.splitElement(
				STICKER_TRACK_ID,
				"sticker-element",
				splitFrame / PROJECT_FPS
			);
		const [left, right] = stickerElements().sort(
			(first, second) => first.startTime - second.startTime
		);

		expect(left.keyframes?.x?.at(-1)?.value).toBeCloseTo(expectedBoundary);
		expect(left.keyframes?.x?.some(({ id }) => id === "remote")).toBe(false);
		expectKeyframesInsideClip({ element: left });
		expectKeyframesInsideClip({ element: right });
	});

	it("keeps the right endpoint inside fractional clip rounding", () => {
		resetTimeline({
			element: stickerElement({
				duration: 1.04,
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 0 }),
						keyframe({ id: "end", frame: 25, value: 25 }),
					],
				},
			}),
		});

		useTimelineStore
			.getState()
			.splitElement(STICKER_TRACK_ID, "sticker-element", 0.52);
		const [left, right] = stickerElements().sort(
			(first, second) => first.startTime - second.startTime
		);

		expect(right.keyframes?.x?.map(({ frame }) => frame)).toEqual([0, 12]);
		expect(right.keyframes?.x?.at(-1)?.value).toBe(25);
		expectKeyframesInsideClip({ element: left });
		expectKeyframesInsideClip({ element: right });
	});

	it("keeps the split value at frame zero when the right clip rounds to zero frames", () => {
		resetTimeline({
			element: stickerElement({
				duration: 0.04,
				keyframes: {
					x: [
						keyframe({ id: "start", frame: 0, value: 5 }),
						keyframe({ id: "end", frame: 1, value: 9 }),
					],
				},
			}),
		});

		useTimelineStore
			.getState()
			.splitElement(STICKER_TRACK_ID, "sticker-element", 0.02);
		const right = stickerElements().find((element) => element.startTime > 0);

		expect(
			right?.keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([{ frame: 0, value: 5 }]);
		if (right) expectKeyframesInsideClip({ element: right });
	});
});
