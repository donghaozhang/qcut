import { describe, expect, it } from "vitest";
import {
	evaluateStickerRuntime,
	parseDirectGifRuntimeDescriptor,
	type DirectGifRuntimeDescriptor,
	type DirectGifRuntimeState,
} from "../sticker-lab/index.js";

function asciiBytes({ value }: { value: string }): number[] {
	const bytes: number[] = [];
	for (const character of value) bytes.push(character.charCodeAt(0));
	return bytes;
}

function uint16Bytes({ value }: { value: number }): [number, number] {
	return [value & 0xff, (value >> 8) & 0xff];
}

function gifFrameBytes({
	delayCentiseconds,
	disposalMethod = 1,
	hasTransparency = false,
	x = 0,
}: {
	delayCentiseconds: number;
	disposalMethod?: number;
	hasTransparency?: boolean;
	x?: number;
}): number[] {
	const packed = (disposalMethod << 2) | (hasTransparency ? 1 : 0);
	return [
		0x21,
		0xf9,
		0x04,
		packed,
		...uint16Bytes({ value: delayCentiseconds }),
		7,
		0,
		0x2c,
		...uint16Bytes({ value: x }),
		0,
		0,
		...uint16Bytes({ value: 2 }),
		...uint16Bytes({ value: 2 }),
		0,
		2,
		2,
		0x4c,
		0x01,
		0,
	];
}

function gifFixture({
	delaysCentiseconds,
	repeatCount,
}: {
	delaysCentiseconds: readonly number[];
	repeatCount?: number;
}): Uint8Array {
	const bytes = [
		...asciiBytes({ value: "GIF89a" }),
		...uint16Bytes({ value: 4 }),
		...uint16Bytes({ value: 3 }),
		0x80,
		0,
		0,
		0,
		0,
		0,
		255,
		255,
		255,
	];
	if (repeatCount !== undefined) {
		bytes.push(
			0x21,
			0xff,
			0x0b,
			...asciiBytes({ value: "NETSCAPE2.0" }),
			0x03,
			0x01,
			...uint16Bytes({ value: repeatCount }),
			0
		);
	}
	for (let index = 0; index < delaysCentiseconds.length; index += 1) {
		bytes.push(
			...gifFrameBytes({
				delayCentiseconds: delaysCentiseconds[index] ?? 0,
				disposalMethod: index + 1,
				hasTransparency: index === 1,
				x: index,
			})
		);
	}
	bytes.push(0x3b);
	return new Uint8Array(bytes);
}

function activeGifState({
	descriptor,
	timelineTimeSeconds,
	timelineStartSeconds = 0,
	timelineDurationSeconds = 10,
	sourceOffsetSeconds,
}: {
	descriptor: DirectGifRuntimeDescriptor;
	timelineTimeSeconds: number;
	timelineStartSeconds?: number;
	timelineDurationSeconds?: number;
	sourceOffsetSeconds?: number;
}): DirectGifRuntimeState {
	const state = evaluateStickerRuntime({
		descriptor,
		timelineTimeSeconds,
		timeline: {
			timelineStartSeconds,
			timelineDurationSeconds,
			...(sourceOffsetSeconds === undefined ? {} : { sourceOffsetSeconds }),
		},
	});
	if (!state.active || state.kind !== "direct-gif") {
		throw new Error("Expected an active direct GIF state");
	}
	return state;
}

describe("Sticker Lab direct GIF runtime", () => {
	it("parses container delays, repeat count, disposal, and transparency", () => {
		const descriptor = parseDirectGifRuntimeDescriptor({
			bytes: gifFixture({
				delaysCentiseconds: [10, 25, 5],
				repeatCount: 2,
			}),
		});

		expect(descriptor.canvasSize).toEqual({ width: 4, height: 3 });
		expect(descriptor.cycleDurationSeconds).toBeCloseTo(0.4);
		expect(descriptor.repeat).toEqual({
			kind: "finite",
			additionalIterations: 2,
		});
		expect(
			descriptor.frames.map(({ delayCentiseconds }) => delayCentiseconds)
		).toEqual([10, 25, 5]);
		expect(
			descriptor.frames.map(({ durationSeconds }) => durationSeconds)
		).toEqual([0.1, 0.25, 0.05]);
		expect(descriptor.frames[1]).toMatchObject({
			disposalMethod: 2,
			hasTransparency: true,
			transparentColorIndex: 7,
			frameRect: { x: 1, y: 0, width: 2, height: 2 },
		});
	});

	it("selects frames from variable delays instead of average FPS", () => {
		const descriptor = parseDirectGifRuntimeDescriptor({
			bytes: gifFixture({ delaysCentiseconds: [10, 25, 5], repeatCount: 0 }),
		});

		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.099 }).frameIndex
		).toBe(0);
		const justBeforeFrameBoundary = activeGifState({
			descriptor,
			timelineTimeSeconds: 0.1 - 5e-10,
		});
		expect(justBeforeFrameBoundary.frameIndex).toBe(0);
		expect(justBeforeFrameBoundary.frameElapsedSeconds).toBeGreaterThanOrEqual(
			0
		);
		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.1 }).frameIndex
		).toBe(1);
		expect(
			activeGifState({
				descriptor,
				timelineStartSeconds: 4,
				timelineTimeSeconds: 4.1,
			}).frameIndex
		).toBe(1);
		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.349 }).frameIndex
		).toBe(1);
		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.35 }).frameIndex
		).toBe(2);
		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.4 }).frameIndex
		).toBe(0);
		const arbitrarySeek = activeGifState({
			descriptor,
			timelineTimeSeconds: 0.61,
		});
		expect(arbitrarySeek).toMatchObject({
			frameIndex: 1,
			iterationIndex: 1,
		});
		expect(arbitrarySeek.frameElapsedSeconds).toBeCloseTo(0.11);
	});

	it("preserves animation phase after a timeline split", () => {
		const descriptor = parseDirectGifRuntimeDescriptor({
			bytes: gifFixture({ delaysCentiseconds: [10, 25, 5], repeatCount: 0 }),
		});
		const state = activeGifState({
			descriptor,
			timelineTimeSeconds: 10,
			timelineStartSeconds: 10,
			timelineDurationSeconds: 2,
			sourceOffsetSeconds: 0.35,
		});

		expect(state.frameIndex).toBe(2);
		expect(state.sourceTimeSeconds).toBeCloseTo(0.35);
	});

	it("freezes or hides after all finite GIF iterations", () => {
		const bytes = gifFixture({
			delaysCentiseconds: [10, 25, 5],
			repeatCount: 2,
		});
		const frozenDescriptor = parseDirectGifRuntimeDescriptor({ bytes });
		const frozen = activeGifState({
			descriptor: frozenDescriptor,
			timelineTimeSeconds: frozenDescriptor.cycleDurationSeconds * 3 - 5e-10,
		});
		expect(frozen).toMatchObject({
			frozen: false,
			frameIndex: 2,
			iterationIndex: 2,
		});
		const completed = activeGifState({
			descriptor: frozenDescriptor,
			timelineTimeSeconds: frozenDescriptor.cycleDurationSeconds * 3,
		});
		expect(completed).toMatchObject({
			frozen: true,
			frameIndex: 2,
			iterationIndex: 2,
		});

		const hiddenDescriptor = parseDirectGifRuntimeDescriptor({
			bytes,
			completion: "hide",
		});
		expect(
			evaluateStickerRuntime({
				descriptor: hiddenDescriptor,
				timelineTimeSeconds: hiddenDescriptor.cycleDurationSeconds * 3 - 5e-10,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			})
		).toMatchObject({ active: true, frozen: false });
		expect(
			evaluateStickerRuntime({
				descriptor: hiddenDescriptor,
				timelineTimeSeconds: hiddenDescriptor.cycleDurationSeconds * 3,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			})
		).toEqual({ active: false, reason: "playback-ended" });
	});

	it("makes zero-delay policy explicit while preserving the container value", () => {
		const descriptor = parseDirectGifRuntimeDescriptor({
			bytes: gifFixture({ delaysCentiseconds: [0, 2] }),
			zeroDelayFallbackSeconds: 0.08,
		});
		expect(descriptor.frames[0]).toMatchObject({
			delayCentiseconds: 0,
			durationSeconds: 0.08,
		});
		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.079 }).frameIndex
		).toBe(0);
		expect(
			activeGifState({ descriptor, timelineTimeSeconds: 0.08 }).frameIndex
		).toBe(1);
	});

	it("rejects truncated and out-of-bounds GIF data", () => {
		const truncated = gifFixture({ delaysCentiseconds: [10] }).slice(0, -1);
		expect(() => parseDirectGifRuntimeDescriptor({ bytes: truncated })).toThrow(
			"missing its trailer"
		);

		const outOfBounds = gifFixture({ delaysCentiseconds: [10] });
		const imageSeparatorIndex = outOfBounds.indexOf(0x2c);
		outOfBounds[imageSeparatorIndex + 1] = 3;
		expect(() =>
			parseDirectGifRuntimeDescriptor({ bytes: outOfBounds })
		).toThrow("outside the logical screen");
	});
});
