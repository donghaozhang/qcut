/**
 * Shared Seedance 2.0 260128 param validators.
 *
 * Keeps the GMI API contract in one place: duration / resolution / ratio
 * are clamped to documented values before the payload ships so an
 * unexpected UI state (e.g. resolution: "auto") doesn't reach the
 * provider.
 */

import type { Seedance260128Params } from "@/lib/ai-video";

type SeedanceResolution = NonNullable<Seedance260128Params["resolution"]>;
type SeedanceRatio = NonNullable<Seedance260128Params["ratio"]>;

const SEEDANCE_RESOLUTIONS: readonly SeedanceResolution[] = [
	"480p",
	"720p",
	"1080p",
];
const SEEDANCE_RATIOS: readonly SeedanceRatio[] = [
	"16:9",
	"4:3",
	"1:1",
	"3:4",
	"9:16",
	"21:9",
	"adaptive",
];

export function resolveSeedanceResolution(value: unknown): SeedanceResolution {
	return SEEDANCE_RESOLUTIONS.includes(value as SeedanceResolution)
		? (value as SeedanceResolution)
		: "720p";
}

export function resolveSeedanceRatio(value: unknown): SeedanceRatio {
	return SEEDANCE_RATIOS.includes(value as SeedanceRatio)
		? (value as SeedanceRatio)
		: "16:9";
}

export function resolveSeedanceDuration(value: unknown): number {
	const n = typeof value === "number" ? Math.round(value) : NaN;
	if (!Number.isFinite(n)) return 5;
	if (n < 4) return 4;
	if (n > 15) return 15;
	return n;
}
