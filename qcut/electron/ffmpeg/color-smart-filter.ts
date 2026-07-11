import type { VideoVisual } from "./types";
import type { VideoColorSettings } from "./color-settings";
import { hasColorKeyframes } from "./color-keyframe-filter";

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
	return String(Math.round(value * 1_000_000) / 1_000_000);
}

export function buildSmartFilters({
	visual,
	color,
}: {
	visual: VideoVisual;
	color: VideoColorSettings;
}): string[] {
	const correction = color.smart.correction;
	if (
		!color.smart.enabled ||
		color.smart.status !== "ready" ||
		!correction ||
		hasColorKeyframes({
			visual: { ...visual, color },
			property: "smart.intensity",
		})
	) {
		return [];
	}
	const amount = clamp({ value: color.smart.intensity / 100, min: 0, max: 1 });
	const exposure = color.smart.autoTone ? correction.exposure * amount : 0;
	const contrast = color.smart.autoTone ? correction.contrast * amount : 0;
	const saturation = color.smart.autoTone ? correction.saturation * amount : 0;
	const temperature = color.smart.autoWhiteBalance
		? correction.temperature * amount
		: 0;
	const tint = color.smart.autoWhiteBalance ? correction.tint * amount : 0;
	const exposureScale = 2 ** exposure;
	const contrastFactor = 1 + contrast / 100;
	const channelExpression = ({ scale }: { scale: number }) =>
		`clip(255*(((val/255)*${formatNumber({ value: exposureScale * scale })}-0.5)*` +
		`${formatNumber({ value: contrastFactor })}+0.5),0,255)`;
	const filters = [
		`lutrgb=r='${channelExpression({ scale: 1 + temperature * 0.0018 + tint * 0.0004 })}':` +
			`g='${channelExpression({ scale: 1 - tint * 0.0012 })}':` +
			`b='${channelExpression({ scale: 1 - temperature * 0.0018 + tint * 0.0004 })}'`,
	];
	const saturationFactor = Math.max(0, 1 + saturation / 100);
	if (Math.abs(saturationFactor - 1) < 0.000_001) return filters;
	const lumaMix = 1 - saturationFactor;
	const luma = [0.2126 * lumaMix, 0.7152 * lumaMix, 0.0722 * lumaMix];
	const coefficient = ({
		channel,
		diagonal,
	}: {
		channel: number;
		diagonal: boolean;
	}) =>
		formatNumber({ value: luma[channel] + (diagonal ? saturationFactor : 0) });
	filters.push(
		`colorchannelmixer=rr=${coefficient({ channel: 0, diagonal: true })}:` +
			`rg=${coefficient({ channel: 1, diagonal: false })}:rb=${coefficient({ channel: 2, diagonal: false })}:` +
			`gr=${coefficient({ channel: 0, diagonal: false })}:gg=${coefficient({ channel: 1, diagonal: true })}:` +
			`gb=${coefficient({ channel: 2, diagonal: false })}:br=${coefficient({ channel: 0, diagonal: false })}:` +
			`bg=${coefficient({ channel: 1, diagonal: false })}:bb=${coefficient({ channel: 2, diagonal: true })}`
	);
	return filters;
}
