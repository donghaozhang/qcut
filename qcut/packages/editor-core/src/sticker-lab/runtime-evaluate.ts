import {
	StickerRuntimeError,
	type AlphaVideoProgressKeyframe,
	type AlphaVideoRuntimeDescriptor,
	type AlphaVideoRuntimeState,
	type AtlasRuntimeDescriptor,
	type AtlasRuntimeState,
	type DirectGifRuntimeDescriptor,
	type DirectGifRuntimeState,
	type PngSequenceRuntimeDescriptor,
	type PngSequenceRuntimeState,
	type StickerRuntimeDescriptor,
	type StickerRuntimeFrameBase,
	type StickerRuntimeState,
	type StickerRuntimeTimelineWindow,
} from "./runtime-model.js";
import { findRuntimeFrameIndex } from "./runtime-frames.js";
import { resolveStickerRuntimeClock } from "./runtime-time.js";
import { assertStickerRuntimeDescriptor } from "./runtime-validation.js";
import {
	compareMediaTimeSeconds,
	normalizeMediaTimeSeconds,
	subtractMediaTimeSeconds,
} from "./runtime-media-time.js";

interface FrameRuntimeDescriptor<Frame extends StickerRuntimeFrameBase> {
	cycleDurationSeconds: number;
	frames: readonly Frame[];
	repeat: StickerRuntimeDescriptor["repeat"];
	completion: StickerRuntimeDescriptor["completion"];
}

function evaluateFrameRuntime<Frame extends StickerRuntimeFrameBase>({
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	descriptor: FrameRuntimeDescriptor<Frame>;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}):
	| { active: false; reason: "after-clip" | "before-clip" | "playback-ended" }
	| {
			active: true;
			cycleTimeSeconds: number;
			frame: Frame;
			frameElapsedSeconds: number;
			frameIndex: number;
			frozen: boolean;
			iterationIndex: number;
			sourceTimeSeconds: number;
	  } {
	const clock = resolveStickerRuntimeClock({
		timelineTimeSeconds,
		timeline,
		cycleDurationSeconds: descriptor.cycleDurationSeconds,
		repeat: descriptor.repeat,
		completion: descriptor.completion,
	});
	if (!clock.active) return clock;
	const frameIndex = findRuntimeFrameIndex({
		frames: descriptor.frames,
		cycleTimeSeconds: clock.cycleTimeSeconds,
		frozen: clock.frozen,
	});
	const frame = descriptor.frames[frameIndex];
	if (!frame) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "Frame timing resolved outside the descriptor",
		});
	}
	const frameElapsedValue = clock.frozen
		? normalizeMediaTimeSeconds({ seconds: frame.durationSeconds })
		: subtractMediaTimeSeconds({
				minuend: clock.cycleTimeSeconds,
				subtrahend: frame.startSeconds,
			});
	if (
		!Number.isFinite(frameElapsedValue) ||
		frameElapsedValue < 0 ||
		(!clock.frozen &&
			compareMediaTimeSeconds({
				left: frameElapsedValue,
				right: frame.durationSeconds,
			}) >= 0)
	) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "Frame elapsed time resolved outside its half-open interval",
		});
	}
	return {
		...clock,
		frame,
		frameElapsedSeconds: frameElapsedValue === 0 ? 0 : frameElapsedValue,
		frameIndex,
	};
}

function evaluateGifRuntime({
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	descriptor: DirectGifRuntimeDescriptor;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}): DirectGifRuntimeState | StickerRuntimeState {
	const state = evaluateFrameRuntime({
		descriptor,
		timeline,
		timelineTimeSeconds,
	});
	if (!state.active) return state;
	return { ...state, kind: "direct-gif" };
}

function evaluateAtlasRuntime({
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	descriptor: AtlasRuntimeDescriptor;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}): AtlasRuntimeState | StickerRuntimeState {
	const state = evaluateFrameRuntime({
		descriptor,
		timeline,
		timelineTimeSeconds,
	});
	if (!state.active) return state;
	return { ...state, kind: "atlas-animation" };
}

function evaluatePngSequenceRuntime({
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	descriptor: PngSequenceRuntimeDescriptor;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}): PngSequenceRuntimeState | StickerRuntimeState {
	const state = evaluateFrameRuntime({
		descriptor,
		timeline,
		timelineTimeSeconds,
	});
	if (!state.active) return state;
	return { ...state, kind: "png-sequence" };
}

function interpolateAlphaProgress({
	left,
	right,
	cycleTimeSeconds,
}: {
	left: AlphaVideoProgressKeyframe;
	right: AlphaVideoProgressKeyframe;
	cycleTimeSeconds: number;
}): number {
	if (left.interpolation === "hold") return left.sourceProgress;
	const spanSeconds = subtractMediaTimeSeconds({
		minuend: right.atSeconds,
		subtrahend: left.atSeconds,
	});
	const progress =
		subtractMediaTimeSeconds({
			minuend: cycleTimeSeconds,
			subtrahend: left.atSeconds,
		}) / spanSeconds;
	return (
		left.sourceProgress +
		(right.sourceProgress - left.sourceProgress) * progress
	);
}

function evaluateAlphaSourceProgress({
	descriptor,
	cycleTimeSeconds,
	frozen,
}: {
	descriptor: AlphaVideoRuntimeDescriptor;
	cycleTimeSeconds: number;
	frozen: boolean;
}): number {
	const last = descriptor.progressKeyframes.at(-1);
	if (!last) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "Alpha-video progress keyframes cannot be empty",
		});
	}
	if (frozen) return last.sourceProgress;
	for (
		let index = 0;
		index < descriptor.progressKeyframes.length - 1;
		index += 1
	) {
		const left = descriptor.progressKeyframes[index];
		const right = descriptor.progressKeyframes[index + 1];
		if (
			!left ||
			!right ||
			compareMediaTimeSeconds({
				left: cycleTimeSeconds,
				right: right.atSeconds,
			}) >= 0
		) {
			continue;
		}
		return interpolateAlphaProgress({ left, right, cycleTimeSeconds });
	}
	return last.sourceProgress;
}

function evaluateAlphaVideoRuntime({
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	descriptor: AlphaVideoRuntimeDescriptor;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}): AlphaVideoRuntimeState | StickerRuntimeState {
	const clock = resolveStickerRuntimeClock({
		timelineTimeSeconds,
		timeline,
		cycleDurationSeconds: descriptor.cycleDurationSeconds,
		repeat: descriptor.repeat,
		completion: descriptor.completion,
	});
	if (!clock.active) return clock;
	const sourceProgress = evaluateAlphaSourceProgress({
		descriptor,
		cycleTimeSeconds: clock.cycleTimeSeconds,
		frozen: clock.frozen,
	});
	return {
		...clock,
		kind: "alpha-video",
		layout: descriptor.layout,
		sourceProgress,
		sourceTimeInVideoSeconds: sourceProgress * descriptor.sourceDurationSeconds,
	};
}

export function evaluateStickerRuntime({
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	descriptor: StickerRuntimeDescriptor;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}): StickerRuntimeState {
	assertStickerRuntimeDescriptor({ descriptor });
	switch (descriptor.kind) {
		case "direct-gif":
			return evaluateGifRuntime({
				descriptor,
				timeline,
				timelineTimeSeconds,
			});
		case "atlas-animation":
			return evaluateAtlasRuntime({
				descriptor,
				timeline,
				timelineTimeSeconds,
			});
		case "png-sequence":
			return evaluatePngSequenceRuntime({
				descriptor,
				timeline,
				timelineTimeSeconds,
			});
		case "alpha-video":
			return evaluateAlphaVideoRuntime({
				descriptor,
				timeline,
				timelineTimeSeconds,
			});
		default: {
			const unsupported: never = descriptor;
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: `Unsupported sticker runtime descriptor: ${String(unsupported)}`,
			});
		}
	}
}
