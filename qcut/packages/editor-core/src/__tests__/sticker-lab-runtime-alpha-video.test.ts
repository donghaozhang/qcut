import { describe, expect, it } from "vitest";
import {
	createAlphaVideoRuntimeDescriptor,
	evaluateStickerRuntime,
	type AlphaVideoLayout,
	StickerRuntimeError,
} from "../sticker-lab/index.js";

const SIDE_BY_SIDE_LAYOUT: AlphaVideoLayout = {
	kind: "side-by-side",
	colorRect: { x: 0, y: 0, width: 0.5, height: 1 },
	maskRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
	mask: { channel: "luma", inverted: false },
};

describe("Sticker Lab alpha-video runtime", () => {
	it("evaluates linear and held source-progress keyframes", () => {
		const descriptor = createAlphaVideoRuntimeDescriptor({
			source: "color-and-mask.mp4",
			sourceDurationSeconds: 4,
			cycleDurationSeconds: 2,
			layout: SIDE_BY_SIDE_LAYOUT,
			progressKeyframes: [
				{ atSeconds: 0, sourceProgress: 0, interpolation: "linear" },
				{ atSeconds: 1, sourceProgress: 0.25, interpolation: "hold" },
				{ atSeconds: 1.5, sourceProgress: 0.8, interpolation: "linear" },
				{ atSeconds: 2, sourceProgress: 1, interpolation: "hold" },
			],
			repeat: { kind: "infinite" },
		});
		const evaluateAt = (timelineTimeSeconds: number) =>
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 5 },
			});

		expect(evaluateAt(0.5)).toMatchObject({
			active: true,
			sourceProgress: 0.125,
			sourceTimeInVideoSeconds: 0.5,
		});
		expect(evaluateAt(1.25)).toMatchObject({
			active: true,
			sourceProgress: 0.25,
		});
		expect(evaluateAt(1.5 - 5e-10)).toMatchObject({
			active: true,
			sourceProgress: 0.25,
		});
		expect(evaluateAt(1.75)).toMatchObject({
			active: true,
			sourceProgress: 0.9,
			sourceTimeInVideoSeconds: 3.6,
		});
		expect(evaluateAt(2.5)).toMatchObject({
			active: true,
			iterationIndex: 1,
			sourceProgress: 0.125,
		});
	});

	it("returns renderer-ready side-by-side mask layout", () => {
		const descriptor = createAlphaVideoRuntimeDescriptor({
			source: "packed.mp4",
			sourceDurationSeconds: 1,
			layout: SIDE_BY_SIDE_LAYOUT,
		});
		const state = evaluateStickerRuntime({
			descriptor,
			timelineTimeSeconds: 0.5,
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
		});
		expect(state).toMatchObject({
			active: true,
			kind: "alpha-video",
			layout: SIDE_BY_SIDE_LAYOUT,
			sourceProgress: 0.5,
		});
	});

	it("supports separate alpha masks and split offsets", () => {
		const descriptor = createAlphaVideoRuntimeDescriptor({
			source: "color.mp4",
			sourceDurationSeconds: 2,
			layout: {
				kind: "separate-mask",
				maskSource: "mask.mp4",
				mask: { channel: "alpha", inverted: true },
			},
			repeat: { kind: "infinite" },
		});
		const state = evaluateStickerRuntime({
			descriptor,
			timelineTimeSeconds: 10.25,
			timeline: {
				timelineStartSeconds: 10,
				timelineDurationSeconds: 1,
				sourceOffsetSeconds: 0.75,
			},
		});
		expect(state).toMatchObject({
			active: true,
			layout: { kind: "separate-mask", maskSource: "mask.mp4" },
			sourceProgress: 0.5,
			sourceTimeInVideoSeconds: 1,
		});
	});

	it("freezes at the final mapped progress or hides", () => {
		const frozenDescriptor = createAlphaVideoRuntimeDescriptor({
			source: "packed.mp4",
			sourceDurationSeconds: 2,
			cycleDurationSeconds: 1,
			layout: SIDE_BY_SIDE_LAYOUT,
		});
		expect(
			evaluateStickerRuntime({
				descriptor: frozenDescriptor,
				timelineTimeSeconds: 1 - 5e-10,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			})
		).toMatchObject({
			active: true,
			frozen: false,
			sourceProgress: 1 - 5e-10,
		});
		expect(
			evaluateStickerRuntime({
				descriptor: frozenDescriptor,
				timelineTimeSeconds: 1,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			})
		).toMatchObject({
			active: true,
			frozen: true,
			sourceProgress: 1,
			sourceTimeInVideoSeconds: 2,
		});

		const hiddenDescriptor = createAlphaVideoRuntimeDescriptor({
			source: "packed.mp4",
			sourceDurationSeconds: 2,
			cycleDurationSeconds: 1,
			layout: SIDE_BY_SIDE_LAYOUT,
			completion: "hide",
		});
		expect(
			evaluateStickerRuntime({
				descriptor: hiddenDescriptor,
				timelineTimeSeconds: 1 - 5e-10,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			})
		).toMatchObject({ active: true, frozen: false });
		expect(
			evaluateStickerRuntime({
				descriptor: hiddenDescriptor,
				timelineTimeSeconds: 1,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			})
		).toEqual({ active: false, reason: "playback-ended" });
	});

	it("rejects overlapping masks and incomplete progress maps", () => {
		expect(() =>
			createAlphaVideoRuntimeDescriptor({
				source: "packed.mp4",
				sourceDurationSeconds: 1,
				layout: {
					...SIDE_BY_SIDE_LAYOUT,
					maskRect: { x: 0.4, y: 0, width: 0.5, height: 1 },
				},
			})
		).toThrow("cannot overlap");
		expect(() =>
			createAlphaVideoRuntimeDescriptor({
				source: "packed.mp4",
				sourceDurationSeconds: 1,
				layout: SIDE_BY_SIDE_LAYOUT,
				progressKeyframes: [
					{ atSeconds: 0.1, sourceProgress: 0, interpolation: "linear" },
					{ atSeconds: 1, sourceProgress: 1, interpolation: "hold" },
				],
			})
		).toThrow("start at zero");
	});

	it("returns typed errors for malformed source, layout, and mask fields", () => {
		const invalidDescriptors = [
			() =>
				createAlphaVideoRuntimeDescriptor({
					source: 7 as unknown as string,
					sourceDurationSeconds: 1,
					layout: SIDE_BY_SIDE_LAYOUT,
				}),
			() =>
				createAlphaVideoRuntimeDescriptor({
					source: "packed.mp4",
					sourceDurationSeconds: 1,
					layout: null as unknown as AlphaVideoLayout,
				}),
			() =>
				createAlphaVideoRuntimeDescriptor({
					source: "packed.mp4",
					sourceDurationSeconds: 1,
					layout: {
						...SIDE_BY_SIDE_LAYOUT,
						mask: {
							channel: "opacity",
							inverted: false,
						},
					} as unknown as AlphaVideoLayout,
				}),
			() =>
				createAlphaVideoRuntimeDescriptor({
					source: "packed.mp4",
					sourceDurationSeconds: 1,
					layout: {
						...SIDE_BY_SIDE_LAYOUT,
						mask: { channel: "luma", inverted: "false" },
					} as unknown as AlphaVideoLayout,
				}),
			() =>
				createAlphaVideoRuntimeDescriptor({
					source: "color.mp4",
					sourceDurationSeconds: 1,
					layout: {
						kind: "separate-mask",
						maskSource: 7 as unknown as string,
						mask: { channel: "alpha", inverted: false },
					},
				}),
		];

		for (const createInvalidDescriptor of invalidDescriptors) {
			expect(createInvalidDescriptor).toThrowError(StickerRuntimeError);
		}
	});
});
