/**
 * Discrete stabilization levels for the 视频防抖 section's level dropdown.
 *
 * The FFmpeg backend (electron/ffmpeg/video-enhancement-filter.ts) quantizes
 * `enhancements.stabilization` (0–100) to a deshake radius of
 * `ceil(value / 100 * 4) * 16`, i.e. exactly four steps: 16, 32, 48 and 64 px.
 * Exposing a slider therefore promises more precision than the filter has;
 * the level enum maps one-to-one onto those steps instead.
 */

export type StabilizationLevel = "low" | "recommended" | "high" | "max";

export const STABILIZATION_LEVELS: ReadonlyArray<{
	level: StabilizationLevel;
	/** Stored `enhancements.stabilization` value. */
	value: number;
	/** Resulting deshake search radius in pixels. */
	radius: number;
	labelKey:
		| "mediaProperties.stabilizationLevel.low"
		| "mediaProperties.stabilizationLevel.recommended"
		| "mediaProperties.stabilizationLevel.high"
		| "mediaProperties.stabilizationLevel.max";
}> = [
	{
		level: "low",
		value: 25,
		radius: 16,
		labelKey: "mediaProperties.stabilizationLevel.low",
	},
	{
		level: "recommended",
		value: 50,
		radius: 32,
		labelKey: "mediaProperties.stabilizationLevel.recommended",
	},
	{
		level: "high",
		value: 75,
		radius: 48,
		labelKey: "mediaProperties.stabilizationLevel.high",
	},
	{
		level: "max",
		value: 100,
		radius: 64,
		labelKey: "mediaProperties.stabilizationLevel.max",
	},
];

export const DEFAULT_STABILIZATION_LEVEL: StabilizationLevel = "recommended";

/** Mirror of the backend quantization, kept here so the UI can be tested against it. */
export function deshakeRadiusForStabilization(value: number): number {
	if (value <= 0) return 0;
	return Math.ceil((Math.min(100, value) / 100) * 4) * 16;
}

/** Level whose deshake radius matches a stored 0–100 value; undefined when off. */
export function stabilizationLevelForValue(
	value: number
): StabilizationLevel | undefined {
	if (value <= 0) return undefined;
	const radius = deshakeRadiusForStabilization(value);
	return STABILIZATION_LEVELS.find((entry) => entry.radius === radius)?.level;
}

export function stabilizationValueForLevel(level: StabilizationLevel): number {
	return (
		STABILIZATION_LEVELS.find((entry) => entry.level === level)?.value ?? 0
	);
}
