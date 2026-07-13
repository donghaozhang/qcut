import type { VideoMask, VideoVisual } from "./types";

type VideoMaskStroke = NonNullable<VideoMask["stroke"]>;

export interface MaskStrokeFilterGraph {
	filterSteps: string[];
	outputLabel: string;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function activeStroke({
	visual,
}: {
	visual: VideoVisual;
}): VideoMaskStroke | null {
	const masks = [visual.mask, ...(visual.masks ?? [])].filter(
		(mask): mask is VideoMask => mask !== undefined
	);
	const stroke = masks.find(
		(mask) =>
			mask.enabled !== false &&
			mask.stroke?.style !== undefined &&
			mask.stroke.style !== "none" &&
			mask.stroke.width > 0
	)?.stroke;
	if (!stroke) return null;
	return {
		...stroke,
		width: clamp({ value: stroke.width, min: 0, max: 32 }),
		opacity: clamp({ value: stroke.opacity, min: 0, max: 1 }),
		glow: clamp({ value: stroke.glow, min: 0, max: 64 }),
		offsetX: clamp({ value: stroke.offsetX, min: -64, max: 64 }),
		offsetY: clamp({ value: stroke.offsetY, min: -64, max: 64 }),
	};
}

function parseHexColor({ color }: { color: string }) {
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	const value = Number.parseInt(match?.[1] ?? "ffffff", 16);
	return {
		r: (value >> 16) & 255,
		g: (value >> 8) & 255,
		b: value & 255,
	};
}

function dilationFilters({ stroke }: { stroke: VideoMaskStroke }): string[] {
	const multiplier = stroke.style === "triple" ? 1.75 : 1;
	const iterations = Math.max(
		1,
		Math.min(32, Math.round(stroke.width * multiplier))
	);
	return Array.from({ length: iterations }, () => "dilation=coordinates=255");
}

function alphaExpression({ stroke }: { stroke: VideoMaskStroke }): string {
	const x = stroke.style === "offset" ? stroke.offsetX : 0;
	const y = stroke.style === "offset" ? stroke.offsetY : 0;
	const sample = `r(X-(${x}),Y-(${y}))`;
	const bounds = `between(X-(${x}),0,W-1)*between(Y-(${y}),0,H-1)`;
	const pattern =
		stroke.style === "dashed"
			? `*lt(mod(X+Y,${Math.max(6, Math.round(stroke.width * 5))}),${Math.max(3, Math.round(stroke.width * 2.5))})`
			: stroke.style === "sketch"
				? `*(0.7+0.3*lt(mod(X*3+Y*5,11),7))`
				: "";
	return `${sample}*${bounds}*${stroke.opacity}${pattern}`;
}

export function buildMaskStrokeFilterGraph({
	inputLabel,
	labelPrefix,
	visual,
}: {
	inputLabel: string;
	labelPrefix: string;
	visual: VideoVisual;
}): MaskStrokeFilterGraph {
	const stroke = activeStroke({ visual });
	if (!stroke) return { filterSteps: [], outputLabel: inputLabel };
	const baseLabel = `${labelPrefix}_base`;
	const alphaSourceLabel = `${labelPrefix}_alpha_source`;
	const alphaLabel = `${labelPrefix}_alpha`;
	const coloredLabel = `${labelPrefix}_colored`;
	const outputLabel = `${labelPrefix}_output`;
	const colors = parseHexColor({ color: stroke.color });
	const alphaFilters = ["alphaextract", ...dilationFilters({ stroke })];
	if (stroke.style === "glow") {
		alphaFilters.push(`gblur=sigma=${Math.max(0.5, stroke.glow / 2)}`);
	}
	const filterSteps = [
		`[${inputLabel}]split=2[${baseLabel}][${alphaSourceLabel}]`,
		`[${alphaSourceLabel}]${alphaFilters.join(",")}[${alphaLabel}]`,
		`[${alphaLabel}]format=rgba,geq=r='${colors.r}':g='${colors.g}':b='${colors.b}':a='${alphaExpression({ stroke })}'[${coloredLabel}]`,
		`[${coloredLabel}][${baseLabel}]overlay=0:0:format=auto[${outputLabel}]`,
	];
	return { filterSteps, outputLabel };
}
