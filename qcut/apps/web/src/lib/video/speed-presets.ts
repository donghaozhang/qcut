import type { MediaPropertyKeyframe } from "@/types/timeline";
import type { TranslationKey } from "@/lib/i18n";

export type SpeedCurvePresetId =
	| "montage"
	| "hero"
	| "bullet"
	| "jump"
	| "flash-in"
	| "flash-out";

export type SpeedCurveSelectionId = SpeedCurvePresetId | "custom" | "none";

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
			{ position: 0, rate: 0.9, easing: "linear" },
			{ position: 0.12, rate: 0.75, easing: "easeOut" },
			{ position: 0.28, rate: 1.1, easing: "easeIn" },
			{ position: 0.46, rate: 7, easing: "easeInOut" },
			{ position: 0.54, rate: 7, easing: "easeOut" },
			{ position: 0.66, rate: 0.2, easing: "easeInOut" },
			{ position: 0.75, rate: 0.2, easing: "linear" },
			{ position: 0.88, rate: 1, easing: "easeOut" },
			{ position: 1, rate: 1, easing: "easeOut" },
		],
	},
	{
		id: "hero",
		nameKey: "audioProperties.speed.preset.hero",
		points: [
			{ position: 0, rate: 1, easing: "linear" },
			{ position: 0.15, rate: 1.2, easing: "easeOut" },
			{ position: 0.35, rate: 4, easing: "easeInOut" },
			{ position: 0.45, rate: 0.2, easing: "easeInOut" },
			{ position: 0.58, rate: 0.2, easing: "linear" },
			{ position: 0.68, rate: 4, easing: "easeInOut" },
			{ position: 0.85, rate: 2, easing: "easeOut" },
			{ position: 1, rate: 1, easing: "easeOut" },
		],
	},
	{
		id: "bullet",
		nameKey: "audioProperties.speed.preset.bullet",
		points: [
			{ position: 0, rate: 4, easing: "linear" },
			{ position: 0.38, rate: 4, easing: "linear" },
			{ position: 0.48, rate: 0.2, easing: "easeInOut" },
			{ position: 0.6, rate: 0.2, easing: "linear" },
			{ position: 0.66, rate: 4, easing: "easeInOut" },
			{ position: 1, rate: 4, easing: "linear" },
		],
	},
	{
		id: "jump",
		nameKey: "audioProperties.speed.preset.jump",
		points: [
			{ position: 0, rate: 1, easing: "linear" },
			{ position: 0.42, rate: 1, easing: "linear" },
			{ position: 0.5, rate: 7, easing: "easeInOut" },
			{ position: 0.58, rate: 1, easing: "easeOut" },
			{ position: 1, rate: 1, easing: "linear" },
		],
	},
	{
		id: "flash-in",
		nameKey: "audioProperties.speed.preset.flashIn",
		points: [
			{ position: 0, rate: 7, easing: "linear" },
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
			{ position: 1, rate: 7, easing: "easeIn" },
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

export function identifySpeedCurvePreset({
	keyframes,
	durationInFrames,
}: {
	keyframes: MediaPropertyKeyframe[];
	durationInFrames: number;
}): SpeedCurveSelectionId {
	if (keyframes.length === 0) return "none";
	const sortedKeyframes = [...keyframes].sort(
		(left, right) => left.frame - right.frame
	);
	for (const preset of SPEED_CURVE_PRESETS) {
		const expected = createSpeedPresetKeyframes({
			preset,
			durationInFrames,
		}).sort((left, right) => left.frame - right.frame);
		const matches =
			expected.length === sortedKeyframes.length &&
			expected.every((candidate, index) => {
				const actual = sortedKeyframes[index];
				return (
					actual?.frame === candidate.frame &&
					Math.abs(actual.value - candidate.value) < 0.001 &&
					actual.easing === candidate.easing
				);
			});
		if (matches) return preset.id;
	}
	return "custom";
}
