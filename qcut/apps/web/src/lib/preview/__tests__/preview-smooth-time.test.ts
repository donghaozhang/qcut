import { describe, expect, it } from "vitest";
import type {
	MediaElement,
	TextElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	findJianyingPrefetchWindowIndex,
	resolveJianyingTransitionPrefetchWindows,
	resolvePreviewSmoothTimeNeed,
	timelineElementNeedsSmoothTime,
} from "../preview-smooth-time";

function makeMediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "media-1",
		name: "clip",
		type: "media",
		mediaId: "item-1",
		startTime: 0,
		duration: 10,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function makeTextElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		name: "text",
		type: "text",
		content: "hello",
		startTime: 0,
		duration: 10,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 24,
		fontFamily: "Arial",
		color: "#fff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		...overrides,
	} as TextElement;
}

function makeMediaTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
	return {
		id: "track-1",
		name: "Track",
		type: "media",
		elements: [makeMediaElement()],
		...overrides,
	};
}

function makeNeedParams(
	overrides: Partial<Parameters<typeof resolvePreviewSmoothTimeNeed>[0]> = {}
): Parameters<typeof resolvePreviewSmoothTimeNeed>[0] {
	const tracks = overrides.tracks ?? [makeMediaTrack()];
	return {
		tracks,
		transitionTracks: tracks,
		time: 2,
		fps: 30,
		zoomActive: false,
		cursorOverlayActive: false,
		hasElementEffects: () => false,
		jianyingPrefetchWindows: [],
		...overrides,
	};
}

describe("timelineElementNeedsSmoothTime", () => {
	it("treats a plain media clip as static", () => {
		expect(
			timelineElementNeedsSmoothTime({ element: makeMediaElement() })
		).toBe(false);
	});

	it("flags keyframed media", () => {
		expect(
			timelineElementNeedsSmoothTime({
				element: makeMediaElement({
					keyframes: {
						opacity: [{ id: "k1", frame: 0, value: 1, easing: "linear" }],
					},
				}),
			})
		).toBe(true);
	});

	it("flags media entrance animations but not 'none'", () => {
		expect(
			timelineElementNeedsSmoothTime({
				element: makeMediaElement({ animationInType: "fade" }),
			})
		).toBe(true);
		expect(
			timelineElementNeedsSmoothTime({
				element: makeMediaElement({ animationInType: "none" }),
			})
		).toBe(false);
	});

	it("flags mask tracking and custom cutouts", () => {
		expect(
			timelineElementNeedsSmoothTime({
				element: makeMediaElement({
					masks: [
						{
							id: "m1",
							type: "rectangle",
							tracking: { sourceMaskId: "m0" },
						} as unknown as NonNullable<MediaElement["masks"]>[number],
					],
				}),
			})
		).toBe(true);
	});

	it("ignores disabled default custom cutouts but flags enabled ones", () => {
		const disabledCutout = {
			enabled: false,
			applyStrokes: true,
			strokes: [],
			status: "idle",
		} as unknown as MediaElement["customCutout"];
		expect(
			timelineElementNeedsSmoothTime({
				element: makeMediaElement({ customCutout: disabledCutout }),
			})
		).toBe(false);
		const enabledCutout = {
			...disabledCutout,
			enabled: true,
		} as unknown as MediaElement["customCutout"];
		expect(
			timelineElementNeedsSmoothTime({
				element: makeMediaElement({ customCutout: enabledCutout }),
			})
		).toBe(true);
	});

	it("treats plain text as static and animated text as smooth", () => {
		expect(timelineElementNeedsSmoothTime({ element: makeTextElement() })).toBe(
			false
		);
		expect(
			timelineElementNeedsSmoothTime({
				element: makeTextElement({ animationType: "fade" }),
			})
		).toBe(true);
		expect(
			timelineElementNeedsSmoothTime({
				element: makeTextElement({ trackingTargetId: "media-1" }),
			})
		).toBe(true);
	});
});

describe("resolvePreviewSmoothTimeNeed", () => {
	it("returns not-needed for a static clip at original quality", () => {
		expect(resolvePreviewSmoothTimeNeed(makeNeedParams())).toEqual({
			needsSmoothTime: false,
			reason: null,
		});
	});

	it("turns on for screen-recording zoom and cursor overlays", () => {
		expect(
			resolvePreviewSmoothTimeNeed(makeNeedParams({ zoomActive: true }))
		).toMatchObject({ needsSmoothTime: true, reason: "zoom-region" });
		expect(
			resolvePreviewSmoothTimeNeed(
				makeNeedParams({ cursorOverlayActive: true })
			)
		).toMatchObject({ needsSmoothTime: true, reason: "cursor-overlay" });
	});

	it("turns on while inside a jianying prefetch window", () => {
		expect(
			resolvePreviewSmoothTimeNeed(
				makeNeedParams({
					jianyingPrefetchWindows: [{ start: 1, end: 6 }],
					time: 2,
				})
			)
		).toMatchObject({ reason: "jianying-transition-prefetch" });
	});

	it("turns on for elements with active effects", () => {
		expect(
			resolvePreviewSmoothTimeNeed(
				makeNeedParams({ hasElementEffects: () => true })
			)
		).toMatchObject({ reason: "element-effects" });
	});

	it("stays off for plain high-resolution video (proxy advances via events)", () => {
		// Proxy-backed playback no longer forces per-frame renders: the chunk
		// window is advanced by useVideoEnhancementProxyWindow from
		// playback-update events instead of rendered time.
		expect(resolvePreviewSmoothTimeNeed(makeNeedParams())).toMatchObject({
			needsSmoothTime: false,
		});
	});

	it("ignores hidden tracks and out-of-range elements", () => {
		const animated = makeMediaElement({ animationInType: "fade" });
		expect(
			resolvePreviewSmoothTimeNeed(
				makeNeedParams({
					tracks: [makeMediaTrack({ elements: [animated], hidden: true })],
					transitionTracks: [],
				})
			)
		).toMatchObject({ needsSmoothTime: false });
		expect(
			resolvePreviewSmoothTimeNeed(
				makeNeedParams({
					tracks: [
						makeMediaTrack({
							elements: [makeMediaElement({ startTime: 20, ...{} })],
						}),
					],
					transitionTracks: [],
					time: 2,
				})
			)
		).toMatchObject({ needsSmoothTime: false });
	});

	it("turns on inside an active clip transition window", () => {
		const fromElement = makeMediaElement({
			id: "from",
			startTime: 0,
			duration: 5,
		});
		const toElement = makeMediaElement({
			id: "to",
			mediaId: "item-2",
			startTime: 5,
			duration: 5,
		});
		const track = makeMediaTrack({
			elements: [fromElement, toElement],
			transitions: [
				{
					id: "t1",
					fromElementId: "from",
					toElementId: "to",
					presetId: "fade",
					type: "dissolve",
					duration: 1,
					easing: "linear",
				},
			],
		});
		const params = makeNeedParams({
			tracks: [track],
			transitionTracks: [track],
		});
		expect(resolvePreviewSmoothTimeNeed({ ...params, time: 5 })).toMatchObject({
			reason: "clip-transition",
		});
		expect(resolvePreviewSmoothTimeNeed({ ...params, time: 2 })).toMatchObject({
			needsSmoothTime: false,
		});
	});
});

describe("jianying prefetch windows", () => {
	it("builds windows with prefetch lead time for jianying-local transitions", () => {
		const track = makeMediaTrack({
			elements: [
				makeMediaElement({ id: "from", startTime: 0, duration: 10 }),
				makeMediaElement({
					id: "to",
					mediaId: "item-2",
					startTime: 10,
					duration: 10,
				}),
			],
			transitions: [
				{
					id: "t1",
					fromElementId: "from",
					toElementId: "to",
					presetId: "jy",
					engine: "jianying-local",
					packageHash: "a".repeat(32),
					type: "dissolve",
					duration: 1,
					easing: "linear",
				},
			],
		});
		const windows = resolveJianyingTransitionPrefetchWindows({
			tracks: [track],
			fps: 30,
		});
		expect(windows).toHaveLength(1);
		expect(windows[0].start).toBeLessThan(windows[0].end);
		// Prefetch lead time reaches ahead of the transition window itself.
		expect(windows[0].start).toBeCloseTo(9.5 - 4, 5);

		expect(
			findJianyingPrefetchWindowIndex({ windows, time: windows[0].start + 0.1 })
		).toBe(0);
		expect(findJianyingPrefetchWindowIndex({ windows, time: 0 })).toBe(-1);
	});

	it("ignores non-jianying transitions", () => {
		const track = makeMediaTrack({
			elements: [
				makeMediaElement({ id: "from", startTime: 0, duration: 5 }),
				makeMediaElement({
					id: "to",
					mediaId: "item-2",
					startTime: 5,
					duration: 5,
				}),
			],
			transitions: [
				{
					id: "t1",
					fromElementId: "from",
					toElementId: "to",
					presetId: "fade",
					type: "dissolve",
					duration: 1,
					easing: "linear",
				},
			],
		});
		expect(
			resolveJianyingTransitionPrefetchWindows({ tracks: [track], fps: 30 })
		).toHaveLength(0);
	});
});
