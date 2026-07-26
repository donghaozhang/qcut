import type { MediaPropertyKeyframe } from "@/types/timeline";
import type { TranslationKey } from "@/lib/i18n";

export type SpeedCurvePresetId =
	| "montage"
	| "hero"
	| "bullet"
	| "jump"
	| "flash-in"
	| "flash-out";

interface NormalizedSpeedPoint {
	position: number;
	rate: number;
	easing: MediaPropertyKeyframe["easing"];
}

export interface SpeedCurvePreset {
	id: SpeedCurvePresetId;
	nameKey: TranslationKey;
	points: NormalizedSpeedPoint[];
}

export const SPEED_CURVE_PRESETS: SpeedCurvePreset[] = [
	{
		id: "montage",
		nameKey: "audioProperties.speed.preset.montage",
		points: [
			{ position: 0, rate: 1, easing: "linear" },
			{ position: 0.2, rate: 2.8, easing: "easeInOut" },
			{ position: 0.48, rate: 0.65, easing: "easeInOut" },
			{ position: 0.72, rate: 2.2, easing: "easeInOut" },
			{ position: 1, rate: 1, easing: "easeOut" },
		],
	},
	{
		id: "hero",
		nameKey: "audioProperties.speed.preset.hero",
		points: [
			{ position: 0, rate: 1.6, easing: "linear" },
			{ position: 0.32, rate: 0.45, easing: "easeOut" },
			{ position: 0.68, rate: 0.45, easing: "linear" },
			{ position: 1, rate: 1.6, easing: "easeIn" },
		],
	},
	{
		id: "bullet",
		nameKey: "audioProperties.speed.preset.bullet",
		points: [
			{ position: 0, rate: 1, easing: "linear" },
			{ position: 0.38, rate: 1, easing: "easeIn" },
			{ position: 0.5, rate: 0.2, easing: "easeOut" },
			{ position: 0.62, rate: 1, easing: "easeIn" },
			{ position: 1, rate: 1, easing: "linear" },
		],
	},
	{
		id: "jump",
		nameKey: "audioProperties.speed.preset.jump",
		points: [
			{ position: 0, rate: 1, easing: "linear" },
			{ position: 0.42, rate: 1, easing: "linear" },
			{ position: 0.5, rate: 5, easing: "easeInOut" },
			{ position: 0.58, rate: 1, easing: "easeOut" },
			{ position: 1, rate: 1, easing: "linear" },
		],
	},
	{
		id: "flash-in",
		nameKey: "audioProperties.speed.preset.flashIn",
		points: [
			{ position: 0, rate: 5, easing: "linear" },
			{ position: 0.22, rate: 1, easing: "easeOut" },
			{ position: 1, rate: 1, easing: "linear" },
		],
	},
	{
		id: "flash-out",
		nameKey: "audioProperties.speed.preset.flashOut",
		points: [
			{ position: 0, rate: 1, easing: "linear" },
			{ position: 0.78, rate: 1, easing: "linear" },
			{ position: 1, rate: 5, easing: "easeIn" },
		],
	},
];

export interface SpeedPointPreset {
	id: string;
	nameKey: TranslationKey;
	curvePresetId: SpeedCurvePresetId;
	effectIds: string[];
}

export const SPEED_POINT_PRESETS: SpeedPointPreset[] = [
	{
		id: "flash",
		nameKey: "audioProperties.speed.point.flash",
		curvePresetId: "jump",
		effectIds: ["dynamic-flash-pulse"],
	},
	{
		id: "flash-black-focus",
		nameKey: "audioProperties.speed.point.flashBlackFocus",
		curvePresetId: "bullet",
		effectIds: ["dynamic-flash-black", "person-vignette-focus"],
	},
	{
		id: "retro-camera",
		nameKey: "audioProperties.speed.point.retroCamera",
		curvePresetId: "montage",
		effectIds: ["camera-rotate-zoom", "faded-film"],
	},
	{
		id: "rainbow",
		nameKey: "audioProperties.speed.point.rainbow",
		curvePresetId: "hero",
		effectIds: ["atmosphere-rainbow-rays"],
	},
	{
		id: "impact",
		nameKey: "audioProperties.speed.point.impact",
		curvePresetId: "jump",
		effectIds: ["dynamic-hard-shake"],
	},
];

export function createSpeedPresetKeyframes({
	preset,
	durationInFrames,
}: {
	preset: SpeedCurvePreset;
	durationInFrames: number;
}): MediaPropertyKeyframe[] {
	const safeDuration = Math.max(1, durationInFrames);
	return preset.points.map((point, index) => ({
		id: `speed-${preset.id}-${index}`,
		frame: Math.round(point.position * safeDuration),
		value: point.rate,
		easing: point.easing,
	}));
}

export function getSpeedCurvePreset({
	id,
}: {
	id: SpeedCurvePresetId;
}): SpeedCurvePreset {
	const preset = SPEED_CURVE_PRESETS.find((candidate) => candidate.id === id);
	if (!preset) throw new Error(`Unknown speed curve preset: ${id}`);
	return preset;
}
