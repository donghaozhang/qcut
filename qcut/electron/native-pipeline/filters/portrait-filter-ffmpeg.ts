import {
	escapeFfmpegFilterPath,
	materializeVideoCubeLut,
} from "../../ffmpeg/color-lut-file.js";
import type {
	PortraitFilterPreset,
	ResolvedPortraitFilter,
} from "./portrait-filter-catalog.js";

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

function formatNumber({ value }: { value: number }): string {
	return String(Number(value.toFixed(6)));
}

function materializePresetLut({
	preset,
	intensity,
}: {
	preset: PortraitFilterPreset;
	intensity: number;
}): string {
	return materializeVideoCubeLut({
		name: preset.name,
		cube: preset.cube,
		intensity,
		skinProtection: preset.skinProtection,
	});
}

export function buildPortraitVideoFilters({
	filter,
}: {
	filter: ResolvedPortraitFilter;
}): string[] {
	const filters: string[] = [];
	if (filter.beauty > 0) {
		const strength = filter.beauty * 0.35;
		filters.push(
			`hqdn3d=${formatNumber({ value: 1 + strength * 0.04 })}:${formatNumber({ value: 1 + strength * 0.03 })}:${formatNumber({ value: 2 + strength * 0.06 })}:${formatNumber({ value: 2 + strength * 0.045 })}`,
			`eq=brightness=${formatNumber({ value: filter.beauty / 2000 })}:gamma=1:saturation=${formatNumber({ value: 1 + filter.beauty / 1000 })}`
		);
	}
	if (filter.preset && filter.intensity > 0) {
		const lutPath = materializePresetLut({
			preset: filter.preset,
			intensity: filter.intensity,
		});
		filters.push(
			`lut3d=file='${escapeFfmpegFilterPath(lutPath)}':interp=tetrahedral`
		);
		const sharpness = filter.preset.extras.sharpness ?? 0;
		if (sharpness > 0) {
			filters.push(
				`unsharp=5:5:${formatNumber({ value: clamp({ value: (sharpness * filter.intensity) / 5000, min: 0, max: 2 }) })}`
			);
		}
	}
	return filters;
}

export function buildAlphaSafePortraitGraph({
	inputLabel,
	outputLabel,
	labelPrefix,
	filter,
}: {
	inputLabel: string;
	outputLabel: string;
	labelPrefix: string;
	filter: ResolvedPortraitFilter;
}): string {
	const filters = buildPortraitVideoFilters({ filter });
	if (filters.length === 0) return `${inputLabel}format=rgba${outputLabel}`;
	const color = `[${labelPrefix}_color]`;
	const alphaSource = `[${labelPrefix}_alpha_source]`;
	const alpha = `[${labelPrefix}_alpha]`;
	const filtered = `[${labelPrefix}_filtered]`;
	return (
		`${inputLabel}format=rgba,split=2${color}${alphaSource};` +
		`${alphaSource}alphaextract${alpha};` +
		`${color}format=rgb24,${filters.join(",")}${filtered};` +
		`${filtered}${alpha}alphamerge,format=rgba${outputLabel}`
	);
}

export function buildPortraitFilterArgs({
	input,
	output,
	filter,
}: {
	input: string;
	output: string;
	filter: ResolvedPortraitFilter;
}): string[] {
	const filters = buildPortraitVideoFilters({ filter });
	return [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		input,
		...(filters.length > 0 ? ["-vf", filters.join(",")] : []),
		"-map",
		"0:v:0",
		"-map",
		"0:a?",
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-movflags",
		"+faststart",
		output,
	];
}
