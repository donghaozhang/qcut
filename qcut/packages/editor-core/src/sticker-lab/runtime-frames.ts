import {
	StickerRuntimeError,
	type StickerRuntimeFrameBase,
} from "./runtime-model.js";
import { mediaTicksToSeconds, mediaTimeToTicks } from "./runtime-media-time.js";

export interface RuntimeFrameTiming {
	startSeconds: number;
	durationSeconds: number;
}

export function buildRuntimeFrameTimings({
	durationsSeconds,
}: {
	durationsSeconds: readonly number[];
}): { cycleDurationSeconds: number; timings: RuntimeFrameTiming[] } {
	if (durationsSeconds.length === 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "Animated sticker runtimes require at least one frame",
		});
	}
	const timings: RuntimeFrameTiming[] = [];
	let startTicks = 0n;
	for (const durationSeconds of durationsSeconds) {
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "Frame durations must be finite and positive",
			});
		}
		const durationTicks = mediaTimeToTicks({ seconds: durationSeconds });
		if (durationTicks <= 0n) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "Frame durations must exceed media-time precision",
			});
		}
		const endTicks = startTicks + durationTicks;
		const endSeconds = mediaTicksToSeconds({ ticks: endTicks });
		if (!Number.isFinite(endSeconds)) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "The combined frame duration exceeds the supported range",
			});
		}
		timings.push({
			startSeconds: mediaTicksToSeconds({ ticks: startTicks }),
			durationSeconds: mediaTicksToSeconds({ ticks: durationTicks }),
		});
		startTicks = endTicks;
	}
	return {
		cycleDurationSeconds: mediaTicksToSeconds({ ticks: startTicks }),
		timings,
	};
}

export function assertRuntimeFrameTable({
	frames,
	cycleDurationSeconds,
}: {
	frames: readonly StickerRuntimeFrameBase[];
	cycleDurationSeconds: number;
}): void {
	if (frames.length === 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "Animated sticker runtimes require at least one frame",
		});
	}
	let expectedStartTicks = 0n;
	for (const frame of frames) {
		if (
			!Number.isFinite(frame.startSeconds) ||
			!Number.isFinite(frame.durationSeconds) ||
			frame.durationSeconds <= 0
		) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "Frame timing table must be positive, ordered, and contiguous",
			});
		}
		const frameStartTicks = mediaTimeToTicks({ seconds: frame.startSeconds });
		const frameDurationTicks = mediaTimeToTicks({
			seconds: frame.durationSeconds,
		});
		if (frameStartTicks !== expectedStartTicks || frameDurationTicks <= 0n) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "Frame timing table must be positive, ordered, and contiguous",
			});
		}
		expectedStartTicks += frameDurationTicks;
	}
	if (
		!Number.isFinite(cycleDurationSeconds) ||
		mediaTimeToTicks({ seconds: cycleDurationSeconds }) !== expectedStartTicks
	) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "cycleDurationSeconds must equal the sum of frame durations",
		});
	}
}

export function findRuntimeFrameIndex({
	frames,
	cycleTimeSeconds,
	frozen,
}: {
	frames: readonly StickerRuntimeFrameBase[];
	cycleTimeSeconds: number;
	frozen: boolean;
}): number {
	if (frozen) return frames.length - 1;
	if (!Number.isFinite(cycleTimeSeconds) || cycleTimeSeconds < 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "cycleTimeSeconds must be finite and non-negative",
		});
	}
	const cycleTimeTicks = mediaTimeToTicks({ seconds: cycleTimeSeconds });
	let lower = 0;
	let upper = frames.length - 1;
	while (lower <= upper) {
		const middle = Math.floor((lower + upper) / 2);
		const frame = frames[middle];
		if (!frame) break;
		const frameStartTicks = mediaTimeToTicks({ seconds: frame.startSeconds });
		const frameEndTicks =
			frameStartTicks + mediaTimeToTicks({ seconds: frame.durationSeconds });
		if (cycleTimeTicks < frameStartTicks) {
			upper = middle - 1;
			continue;
		}
		if (cycleTimeTicks >= frameEndTicks) {
			lower = middle + 1;
			continue;
		}
		return middle;
	}
	throw new StickerRuntimeError({
		code: "INVALID_DESCRIPTOR",
		message: "Frame timing resolved outside the descriptor",
	});
}
