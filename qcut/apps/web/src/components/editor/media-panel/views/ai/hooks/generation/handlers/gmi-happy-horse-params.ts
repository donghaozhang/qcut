/**
 * Shared GMI Happy Horse 1.0 T2V param validators.
 *
 * Keeps the GMI API contract in one place: duration / resolution / ratio
 * are clamped to documented values before the payload ships so an
 * unexpected UI state doesn't reach the provider.
 */

export type GmiHappyHorseDurationLiteral =
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7
	| 8
	| 9
	| 10
	| 11
	| 12
	| 13
	| 14
	| 15;
export type GmiHappyHorseResolutionLiteral = "720p" | "1080p";
export type GmiHappyHorseRatioLiteral = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

const GMI_HAPPY_HORSE_DURATIONS = new Set([
	2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);
const GMI_HAPPY_HORSE_RESOLUTIONS = new Set(["720p", "1080p"]);
const GMI_HAPPY_HORSE_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);

export function resolveGmiHappyHorseDuration(
	raw: unknown
): GmiHappyHorseDurationLiteral | undefined {
	if (raw == null || raw === "") return undefined;
	const n = typeof raw === "number" ? raw : Number(raw);
	if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
	return GMI_HAPPY_HORSE_DURATIONS.has(n)
		? (n as GmiHappyHorseDurationLiteral)
		: undefined;
}

export function resolveGmiHappyHorseResolution(
	raw: unknown
): GmiHappyHorseResolutionLiteral | undefined {
	if (typeof raw !== "string") return undefined;
	const lower = raw.toLowerCase();
	return GMI_HAPPY_HORSE_RESOLUTIONS.has(lower)
		? (lower as GmiHappyHorseResolutionLiteral)
		: undefined;
}

export function resolveGmiHappyHorseRatio(
	raw: unknown
): GmiHappyHorseRatioLiteral | undefined {
	if (typeof raw !== "string") return undefined;
	return GMI_HAPPY_HORSE_RATIOS.has(raw)
		? (raw as GmiHappyHorseRatioLiteral)
		: undefined;
}
