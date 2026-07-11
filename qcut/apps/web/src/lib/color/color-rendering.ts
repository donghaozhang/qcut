import type { MediaColorSettings } from "@/types/timeline";

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

export function buildColorCssFilter({
	settings,
}: {
	settings: MediaColorSettings;
}): string {
	if (!settings.enabled || !settings.basic.enabled) return "";
	const { basic } = settings;
	const fade = clamp({ value: basic.fade / 100, min: 0, max: 1 });
	const exposureGain = 2 ** clamp({ value: basic.exposure, min: -5, max: 5 });
	const tonalBrightness =
		basic.brightness / 100 +
		basic.shadows / 400 +
		basic.highlights / 600 +
		basic.whites / 500 +
		basic.blacks / 500;
	const brightness = clamp({
		value: exposureGain * (1 + tonalBrightness + fade * 0.06),
		min: 0,
		max: 8,
	});
	const contrast = clamp({
		value:
			1 +
			basic.contrast / 100 +
			basic.whites / 500 -
			basic.blacks / 500 -
			fade * 0.25 +
			basic.sharpness / 500,
		min: 0,
		max: 3,
	});
	const saturation = clamp({
		value: 1 + basic.saturation / 100 + basic.vibrance / 150 - fade * 0.15,
		min: 0,
		max: 3,
	});
	const filters = [
		`brightness(${brightness})`,
		`contrast(${contrast})`,
		`saturate(${saturation})`,
	];
	if (basic.temperature !== 0 || basic.tint !== 0) {
		filters.push(
			`sepia(${Math.min(0.35, Math.abs(basic.temperature) / 300)})`,
			`hue-rotate(${basic.temperature * -0.08 + basic.tint * 0.12}deg)`
		);
	}
	return filters.join(" ");
}

export function buildColorVignetteBackground({
	settings,
}: {
	settings: MediaColorSettings;
}): string | undefined {
	if (!settings.enabled || !settings.basic.enabled) return undefined;
	const vignette = clamp({ value: settings.basic.vignette, min: 0, max: 100 });
	if (vignette <= 0) return undefined;
	const alpha = Math.min(0.8, vignette / 125);
	return `radial-gradient(circle, transparent 45%, rgba(0, 0, 0, ${alpha}) 100%)`;
}

export function buildColorGrainStyle({
	settings,
}: {
	settings: MediaColorSettings;
}): { backgroundImage: string; opacity: number } | undefined {
	if (!settings.enabled || !settings.basic.enabled) return undefined;
	const grain = clamp({ value: settings.basic.grain, min: 0, max: 100 });
	if (grain <= 0) return undefined;
	return {
		backgroundImage:
			"repeating-radial-gradient(circle at 17% 31%, #fff 0 0.4px, #000 0.8px 1.2px, transparent 1.6px 3px)",
		opacity: grain / 300,
	};
}
