import type {
	ColorFilterApplication,
	MediaColorSettings,
} from "@/types/timeline";
import { FILTER_NONE_ID, getFilterPreset } from "./filter-registry";
import { getFilterCube } from "./filter-lut";

export const DEFAULT_COLOR_FILTER_APPLICATION: ColorFilterApplication = {
	presetId: FILTER_NONE_ID,
	presetVersion: 1,
	intensity: 100,
};

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

export function normalizeColorFilterApplication({
	filter,
}: {
	filter: Partial<ColorFilterApplication> | undefined;
}): ColorFilterApplication {
	return {
		presetId: filter?.presetId?.trim() || FILTER_NONE_ID,
		presetVersion: Math.max(1, Math.round(filter?.presetVersion ?? 1)),
		intensity: clamp({ value: filter?.intensity ?? 100, min: 0, max: 100 }),
	};
}

export function resolveColorFilterSettings({
	settings,
}: {
	settings: MediaColorSettings;
}): MediaColorSettings {
	const filter = normalizeColorFilterApplication({ filter: settings.filter });
	if (filter.presetId === FILTER_NONE_ID) {
		return { ...settings, filter };
	}

	const preset = getFilterPreset({ presetId: filter.presetId });
	if (!preset) {
		return {
			...settings,
			filter: { ...DEFAULT_COLOR_FILTER_APPLICATION },
		};
	}

	const intensity = clamp({ value: filter.intensity, min: 0, max: 100 });
	const amount = intensity / 100;
	const sharpness = clamp({
		value: settings.basic.sharpness + (preset.extras?.sharpness ?? 0) * amount,
		min: 0,
		max: 100,
	});
	const vignette = clamp({
		value: settings.basic.vignette + (preset.extras?.vignette ?? 0) * amount,
		min: 0,
		max: 100,
	});
	const grain = clamp({
		value: settings.basic.grain + (preset.extras?.grain ?? 0) * amount,
		min: 0,
		max: 100,
	});
	const hasFilterExtras = sharpness !== 0 || vignette !== 0 || grain !== 0;

	return {
		...settings,
		filter: {
			presetId: preset.id,
			presetVersion: preset.version,
			intensity,
		},
		basic: {
			...settings.basic,
			enabled: settings.basic.enabled || hasFilterExtras,
			sharpness,
			vignette,
			grain,
		},
		lut: {
			enabled: intensity > 0,
			presetId: `filter:${preset.id}`,
			name: preset.name,
			intensity,
			skinProtection: preset.skinProtection ?? 0,
			cube: intensity > 0 ? getFilterCube({ preset }) : undefined,
		},
	};
}
