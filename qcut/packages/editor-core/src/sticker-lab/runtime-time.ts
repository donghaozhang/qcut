import {
	StickerRuntimeError,
	type StickerRuntimeCompletion,
	type StickerRuntimeInactiveState,
	type StickerRuntimeRepeat,
	type StickerRuntimeTimelineWindow,
} from "./runtime-model.js";
import {
	assertRuntimeCompletion,
	finiteRuntimeIterationCount,
} from "./runtime-validation.js";
import { mediaTicksToSeconds, mediaTimeToTicks } from "./runtime-media-time.js";

const MAX_SAFE_ITERATION_INDEX = BigInt(Number.MAX_SAFE_INTEGER);

interface RuntimeClockActiveState {
	active: true;
	cycleTimeSeconds: number;
	iterationIndex: number;
	sourceTimeSeconds: number;
	frozen: boolean;
}

type RuntimeClockState = StickerRuntimeInactiveState | RuntimeClockActiveState;

function assertFiniteNonNegative({
	label,
	value,
}: {
	label: string;
	value: number;
}): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new StickerRuntimeError({
			code: "INVALID_TIMELINE",
			message: `${label} must be a finite non-negative number`,
		});
	}
}

export function resolveStickerRuntimeClock({
	timelineTimeSeconds,
	timeline,
	cycleDurationSeconds,
	repeat,
	completion,
}: {
	timelineTimeSeconds: number;
	timeline: StickerRuntimeTimelineWindow;
	cycleDurationSeconds: number;
	repeat: StickerRuntimeRepeat;
	completion: StickerRuntimeCompletion;
}): RuntimeClockState {
	assertRuntimeCompletion({ completion });
	const iterationCount = finiteRuntimeIterationCount({ repeat });
	if (!Number.isFinite(timelineTimeSeconds)) {
		throw new StickerRuntimeError({
			code: "INVALID_TIMELINE",
			message: "timelineTimeSeconds must be finite",
		});
	}
	assertFiniteNonNegative({
		label: "timelineStartSeconds",
		value: timeline.timelineStartSeconds,
	});
	assertFiniteNonNegative({
		label: "timelineDurationSeconds",
		value: timeline.timelineDurationSeconds,
	});
	assertFiniteNonNegative({
		label: "sourceOffsetSeconds",
		value: timeline.sourceOffsetSeconds ?? 0,
	});
	if (!Number.isFinite(cycleDurationSeconds) || cycleDurationSeconds <= 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "cycleDurationSeconds must be finite and positive",
		});
	}
	const cycleDurationTicks = mediaTimeToTicks({
		seconds: cycleDurationSeconds,
	});
	if (cycleDurationTicks <= 0n) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "cycleDurationSeconds must exceed media-time precision",
		});
	}
	let playbackDurationTicks: bigint | undefined;
	if (iterationCount !== undefined) {
		const playbackDurationSeconds = cycleDurationSeconds * iterationCount;
		if (!Number.isFinite(playbackDurationSeconds)) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "Finite playback duration exceeds the supported range",
			});
		}
		playbackDurationTicks = cycleDurationTicks * BigInt(iterationCount);
	}

	const timelineTimeTicks = mediaTimeToTicks({ seconds: timelineTimeSeconds });
	const timelineStartTicks = mediaTimeToTicks({
		seconds: timeline.timelineStartSeconds,
	});
	const timelineDurationTicks = mediaTimeToTicks({
		seconds: timeline.timelineDurationSeconds,
	});
	if (timeline.timelineDurationSeconds > 0 && timelineDurationTicks <= 0n) {
		throw new StickerRuntimeError({
			code: "INVALID_TIMELINE",
			message: "timelineDurationSeconds must exceed media-time precision",
		});
	}
	const clipTimeTicks = timelineTimeTicks - timelineStartTicks;
	if (clipTimeTicks < 0n) return { active: false, reason: "before-clip" };
	if (clipTimeTicks >= timelineDurationTicks) {
		return { active: false, reason: "after-clip" };
	}

	const sourceTimeTicks =
		clipTimeTicks +
		mediaTimeToTicks({ seconds: timeline.sourceOffsetSeconds ?? 0 });
	const sourceTimeSeconds = mediaTicksToSeconds({ ticks: sourceTimeTicks });
	if (!Number.isFinite(sourceTimeSeconds)) {
		throw new StickerRuntimeError({
			code: "INVALID_TIMELINE",
			message: "source time exceeds the supported range",
		});
	}
	if (playbackDurationTicks !== undefined && iterationCount !== undefined) {
		if (sourceTimeTicks >= playbackDurationTicks) {
			if (completion === "hide") {
				return { active: false, reason: "playback-ended" };
			}
			return {
				active: true,
				cycleTimeSeconds: mediaTicksToSeconds({
					ticks: cycleDurationTicks,
				}),
				iterationIndex: iterationCount - 1,
				sourceTimeSeconds,
				frozen: true,
			};
		}
	}

	const rawIterationIndexValue = sourceTimeTicks / cycleDurationTicks;
	if (rawIterationIndexValue > MAX_SAFE_ITERATION_INDEX) {
		throw new StickerRuntimeError({
			code: "INVALID_TIMELINE",
			message: "Sticker runtime iteration index exceeds the safe integer range",
		});
	}
	const rawIterationIndex = Number(rawIterationIndexValue);
	const cycleTimeSeconds = mediaTicksToSeconds({
		ticks: sourceTimeTicks % cycleDurationTicks,
	});
	return {
		active: true,
		cycleTimeSeconds,
		iterationIndex: rawIterationIndex,
		sourceTimeSeconds,
		frozen: false,
	};
}
