import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import type { MediaPropertyKeyframe } from "@/types/timeline";
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE } from "./video-speed-constants";

const PATH_SAMPLE_COUNT = 96;
const LOG_RATE_MIN = Math.log10(MIN_PLAYBACK_RATE);
const LOG_RATE_SPAN =
	Math.log10(MAX_PLAYBACK_RATE) - Math.log10(MIN_PLAYBACK_RATE);

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

export function speedRateToY({ rate }: { rate: number }): number {
	const safeRate = clamp({
		value: rate,
		min: MIN_PLAYBACK_RATE,
		max: MAX_PLAYBACK_RATE,
	});
	const normalizedRate = (Math.log10(safeRate) - LOG_RATE_MIN) / LOG_RATE_SPAN;
	return 1 - normalizedRate;
}

export function speedYToRate({ y }: { y: number }): number {
	const normalizedY = clamp({ value: y, min: 0, max: 1 });
	return 10 ** (LOG_RATE_MIN + (1 - normalizedY) * LOG_RATE_SPAN);
}

export function buildSpeedCurvePath({
	keyframes,
	durationInFrames,
}: {
	keyframes: MediaPropertyKeyframe[];
	durationInFrames: number;
}): string {
	if (keyframes.length === 0) return "";
	const safeDuration = Math.max(1, durationInFrames);
	return Array.from({ length: PATH_SAMPLE_COUNT + 1 }, (_, index) => {
		const frame = (index / PATH_SAMPLE_COUNT) * safeDuration;
		const rate = interpolateNumber(keyframes as Keyframe[], frame);
		const x = (frame / safeDuration) * 100;
		const y = speedRateToY({ rate }) * 100;
		return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
	}).join(" ");
}
