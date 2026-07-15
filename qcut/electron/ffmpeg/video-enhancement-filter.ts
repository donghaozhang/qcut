import type { VideoVisual } from "./types.js";

export type VideoEnhancements = NonNullable<VideoVisual["enhancements"]>;

export const DEFAULT_VIDEO_ENHANCEMENTS: VideoEnhancements = {
	stabilization: 0,
	denoise: 0,
	clarity: 0,
	upscale: 1,
	relight: 0,
	beauty: 0,
};

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

function formatFilterNumber({ value }: { value: number }): string {
	return String(Number(value.toFixed(6)));
}

export function normalizeVideoEnhancements({
	enhancements,
}: {
	enhancements?: Partial<VideoEnhancements>;
}): VideoEnhancements {
	const values = { ...DEFAULT_VIDEO_ENHANCEMENTS, ...enhancements };
	const upscale =
		values.upscale === 2 || values.upscale === 4 ? values.upscale : 1;
	return {
		stabilization: clamp({ value: values.stabilization, min: 0, max: 100 }),
		denoise: clamp({ value: values.denoise, min: 0, max: 100 }),
		clarity: clamp({ value: values.clarity, min: 0, max: 100 }),
		upscale,
		relight: clamp({ value: values.relight, min: -100, max: 100 }),
		beauty: clamp({ value: values.beauty, min: 0, max: 100 }),
	};
}

export function hasVideoEnhancements({
	enhancements,
}: {
	enhancements?: Partial<VideoEnhancements>;
}): boolean {
	const values = normalizeVideoEnhancements({ enhancements });
	return (
		values.stabilization > 0 ||
		values.denoise > 0 ||
		values.clarity > 0 ||
		values.upscale > 1 ||
		values.relight !== 0 ||
		values.beauty > 0
	);
}

export function buildVideoEnhancementFilter({
	enhancements,
	width,
	height,
}: {
	enhancements?: Partial<VideoEnhancements>;
	width: number;
	height: number;
}): string {
	const values = normalizeVideoEnhancements({ enhancements });
	const filters: string[] = [];
	if (values.stabilization > 0) {
		const radius = Math.ceil((values.stabilization / 100) * 4) * 16;
		filters.push(`deshake=rx=${radius}:ry=${radius}:edge=mirror`);
	}
	if (values.denoise > 0 || values.beauty > 0) {
		const strength = clamp({
			value: values.denoise + values.beauty * 0.35,
			min: 0,
			max: 100,
		});
		filters.push(
			`hqdn3d=${formatFilterNumber({ value: 1 + strength * 0.04 })}:${formatFilterNumber({ value: 1 + strength * 0.03 })}:${formatFilterNumber({ value: 2 + strength * 0.06 })}:${formatFilterNumber({ value: 2 + strength * 0.045 })}`
		);
	}
	if (values.clarity > 0) {
		filters.push(
			`unsharp=5:5:${formatFilterNumber({ value: clamp({ value: values.clarity / 50, min: 0, max: 2 }) })}`
		);
	}
	if (values.upscale > 1) {
		filters.push(
			`scale=iw*${values.upscale}:ih*${values.upscale}:flags=lanczos`,
			`scale=${width}:${height}:flags=lanczos`
		);
	}
	if (values.relight !== 0 || values.beauty > 0) {
		filters.push(
			`eq=brightness=${formatFilterNumber({ value: values.relight / 500 + values.beauty / 2000 })}:gamma=${formatFilterNumber({ value: clamp({ value: 1 + values.relight / 250, min: 0.5, max: 2 }) })}:saturation=${formatFilterNumber({ value: 1 + values.beauty / 1000 })}`
		);
	}
	return filters.join(",");
}
