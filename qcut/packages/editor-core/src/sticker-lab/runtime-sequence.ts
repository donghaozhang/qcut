import { buildRuntimeFrameTimings } from "./runtime-frames.js";
import {
	StickerRuntimeError,
	type PngSequenceRuntimeDescriptor,
	type PngSequenceRuntimeFrame,
	type StickerRuntimeCompletion,
	type StickerRuntimeRepeat,
} from "./runtime-model.js";
import { assertPngSequenceRuntimeDescriptor } from "./runtime-validation.js";

export interface PngSequenceFrameInput {
	source: string;
	durationSeconds?: number;
}

function resolveSequenceFrameDuration({
	frame,
	frameRate,
}: {
	frame: PngSequenceFrameInput;
	frameRate?: number;
}): number {
	if (frame.durationSeconds !== undefined) return frame.durationSeconds;
	if (!Number.isFinite(frameRate) || (frameRate ?? 0) <= 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message:
				"PNG sequence frames without durations require a positive frameRate",
		});
	}
	return 1 / (frameRate ?? 1);
}

export function createPngSequenceRuntimeDescriptor({
	frames,
	frameRate,
	repeat = { kind: "infinite" },
	completion = "freeze-last",
}: {
	frames: readonly PngSequenceFrameInput[];
	frameRate?: number;
	repeat?: StickerRuntimeRepeat;
	completion?: StickerRuntimeCompletion;
}): PngSequenceRuntimeDescriptor {
	if (!Array.isArray(frames)) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "PNG sequence frames must be an array",
		});
	}
	const durationsSeconds: number[] = [];
	for (const frame of frames) {
		if (typeof frame.source !== "string" || frame.source.length === 0) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "PNG sequence frame sources cannot be empty",
			});
		}
		durationsSeconds.push(resolveSequenceFrameDuration({ frame, frameRate }));
	}
	const timing = buildRuntimeFrameTimings({ durationsSeconds });
	const runtimeFrames: PngSequenceRuntimeFrame[] = [];
	for (let index = 0; index < frames.length; index += 1) {
		const frame = frames[index];
		const frameTiming = timing.timings[index];
		if (!frame || !frameTiming) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "PNG sequence timing does not match its frame list",
			});
		}
		runtimeFrames.push({ ...frameTiming, source: frame.source });
	}
	const descriptor: PngSequenceRuntimeDescriptor = {
		kind: "png-sequence",
		cycleDurationSeconds: timing.cycleDurationSeconds,
		frames: runtimeFrames,
		repeat,
		completion,
	};
	assertPngSequenceRuntimeDescriptor({ descriptor });
	return descriptor;
}
