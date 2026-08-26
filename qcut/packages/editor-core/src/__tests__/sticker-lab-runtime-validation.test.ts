import { describe, expect, it } from "vitest";
import {
	assertStickerRuntimeDescriptor,
	createPngSequenceRuntimeDescriptor,
	evaluateStickerRuntime,
	StickerRuntimeError,
	type PngSequenceRuntimeDescriptor,
} from "../sticker-lab/index.js";

function sequenceDescriptor(): PngSequenceRuntimeDescriptor {
	return createPngSequenceRuntimeDescriptor({
		frames: [
			{ source: "frame-0.png", durationSeconds: 0.1 },
			{ source: "frame-1.png", durationSeconds: 0.2 },
		],
	});
}

describe("Sticker Lab runtime descriptor validation", () => {
	it("validates nested frame fields and exact timing before evaluation", () => {
		const descriptor = sequenceDescriptor();
		const malformedSource = {
			...descriptor,
			frames: [{ ...descriptor.frames[0], source: 7 }, descriptor.frames[1]],
		};
		expect(() =>
			assertStickerRuntimeDescriptor({ descriptor: malformedSource })
		).toThrowError(StickerRuntimeError);

		const nonContiguous = {
			...descriptor,
			frames: [
				descriptor.frames[0],
				{ ...descriptor.frames[1], startSeconds: 0.1 - 5e-10 },
			],
		};
		expect(() =>
			assertStickerRuntimeDescriptor({ descriptor: nonContiguous })
		).toThrow("positive, ordered, and contiguous");
	});

	it("rejects invalid completion and unsafe finite repeat counts", () => {
		const descriptor = sequenceDescriptor();
		const invalidCompletion = {
			...descriptor,
			completion: "loop-forever",
		};
		expect(() =>
			assertStickerRuntimeDescriptor({ descriptor: invalidCompletion })
		).toThrow("completion must be freeze-last or hide");

		const unsafeRepeat = {
			...descriptor,
			repeat: {
				kind: "finite",
				additionalIterations: Number.MAX_SAFE_INTEGER,
			},
		};
		expect(() =>
			assertStickerRuntimeDescriptor({ descriptor: unsafeRepeat })
		).toThrow("too large to count safely");
	});

	it("fails closed when finite playback duration multiplication overflows", () => {
		const descriptor: PngSequenceRuntimeDescriptor = {
			kind: "png-sequence",
			completion: "hide",
			cycleDurationSeconds: Number.MAX_VALUE,
			frames: [
				{
					durationSeconds: Number.MAX_VALUE,
					source: "frame.png",
					startSeconds: 0,
				},
			],
			repeat: { kind: "finite", additionalIterations: 1 },
		};

		expect(() =>
			evaluateStickerRuntime({
				descriptor,
				timeline: { timelineDurationSeconds: 1, timelineStartSeconds: 0 },
				timelineTimeSeconds: 0,
			})
		).toThrow("Finite playback duration exceeds the supported range");
	});
});
