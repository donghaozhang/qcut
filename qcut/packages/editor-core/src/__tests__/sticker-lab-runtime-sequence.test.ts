import { describe, expect, it } from "vitest";
import {
	createPngSequenceRuntimeDescriptor,
	evaluateStickerRuntime,
} from "../sticker-lab/index.js";

describe("Sticker Lab PNG sequence runtime", () => {
	it("builds deterministic constant-rate timing and loops on the boundary", () => {
		const descriptor = createPngSequenceRuntimeDescriptor({
			frames: [
				{ source: "frame-000.png" },
				{ source: "frame-001.png" },
				{ source: "frame-002.png" },
			],
			frameRate: 10,
		});
		const evaluateAt = (timelineTimeSeconds: number) =>
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			});

		expect(descriptor.cycleDurationSeconds).toBeCloseTo(0.3);
		expect(evaluateAt(0.099)).toMatchObject({ active: true, frameIndex: 0 });
		expect(evaluateAt(0.1 - 5e-10)).toMatchObject({
			active: true,
			frameIndex: 0,
		});
		expect(evaluateAt(0.1)).toMatchObject({ active: true, frameIndex: 1 });
		expect(evaluateAt(0.25)).toMatchObject({ active: true, frameIndex: 2 });
		expect(evaluateAt(0.1 + 0.2 - 5e-10)).toMatchObject({
			active: true,
			frameIndex: 2,
			iterationIndex: 0,
		});
		expect(evaluateAt(0.1 + 0.2)).toMatchObject({
			active: true,
			frameIndex: 0,
			iterationIndex: 1,
		});
		expect(evaluateAt(descriptor.cycleDurationSeconds)).toMatchObject({
			active: true,
			frameIndex: 0,
			iterationIndex: 1,
		});
	});

	it("supports per-frame timing and keeps phase across a split", () => {
		const descriptor = createPngSequenceRuntimeDescriptor({
			frames: [
				{ source: "short.png", durationSeconds: 0.05 },
				{ source: "long.png", durationSeconds: 0.4 },
				{ source: "tail.png", durationSeconds: 0.1 },
			],
		});
		const state = evaluateStickerRuntime({
			descriptor,
			timelineTimeSeconds: 5,
			timeline: {
				timelineStartSeconds: 5,
				timelineDurationSeconds: 1,
				sourceOffsetSeconds: descriptor.frames[2]?.startSeconds,
			},
		});
		expect(state).toMatchObject({
			active: true,
			kind: "png-sequence",
			frameIndex: 2,
		});
		if (!state.active) throw new Error("Expected an active sequence state");
		expect(state.sourceTimeSeconds).toBe(descriptor.frames[2]?.startSeconds);
	});

	it("uses half-open clip bounds independently of playback completion", () => {
		const descriptor = createPngSequenceRuntimeDescriptor({
			frames: [{ source: "only.png", durationSeconds: 0.1 }],
		});
		expect(
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds: 2 - 5e-10,
				timeline: { timelineStartSeconds: 2, timelineDurationSeconds: 1 },
			})
		).toEqual({ active: false, reason: "before-clip" });
		expect(
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds: 3 - 5e-10,
				timeline: { timelineStartSeconds: 2, timelineDurationSeconds: 1 },
			})
		).toMatchObject({ active: true });
		expect(
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds: 3,
				timeline: { timelineStartSeconds: 2, timelineDurationSeconds: 1 },
			})
		).toEqual({ active: false, reason: "after-clip" });
	});

	it("supports finite freeze and hide completion", () => {
		const frames = [
			{ source: "a.png", durationSeconds: 0.1 },
			{ source: "b.png", durationSeconds: 0.2 },
		];
		const frozenDescriptor = createPngSequenceRuntimeDescriptor({
			frames,
			repeat: { kind: "finite", additionalIterations: 0 },
		});
		expect(
			evaluateStickerRuntime({
				descriptor: frozenDescriptor,
				timelineTimeSeconds: frozenDescriptor.cycleDurationSeconds - 5e-10,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			})
		).toMatchObject({ active: true, frozen: false, frameIndex: 1 });
		expect(
			evaluateStickerRuntime({
				descriptor: frozenDescriptor,
				timelineTimeSeconds: frozenDescriptor.cycleDurationSeconds,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			})
		).toMatchObject({ active: true, frozen: true, frameIndex: 1 });

		const hiddenDescriptor = createPngSequenceRuntimeDescriptor({
			frames,
			repeat: { kind: "finite", additionalIterations: 0 },
			completion: "hide",
		});
		expect(
			evaluateStickerRuntime({
				descriptor: hiddenDescriptor,
				timelineTimeSeconds: hiddenDescriptor.cycleDurationSeconds - 5e-10,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			})
		).toMatchObject({ active: true, frozen: false, frameIndex: 1 });
		expect(
			evaluateStickerRuntime({
				descriptor: hiddenDescriptor,
				timelineTimeSeconds: hiddenDescriptor.cycleDurationSeconds,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			})
		).toEqual({ active: false, reason: "playback-ended" });
	});

	it("rejects empty sources and missing timing", () => {
		expect(() =>
			createPngSequenceRuntimeDescriptor({
				frames: [{ source: "" }],
				frameRate: 10,
			})
		).toThrow("cannot be empty");
		expect(() =>
			createPngSequenceRuntimeDescriptor({ frames: [{ source: "frame.png" }] })
		).toThrow("positive frameRate");
	});
});
