import generatedPresets from "./portrait-filter-presets.generated.json";

export const DEFAULT_PORTRAIT_FILTER_ID = "soft-skin";
export const DEFAULT_PORTRAIT_BEAUTY = 25;

interface ColorCubeLut {
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	values: number[];
}

export interface PortraitFilterExtras {
	grain?: number;
	vignette?: number;
	sharpness?: number;
}

export interface PortraitFilterPreset {
	id: string;
	version: number;
	name: string;
	localizedName: string;
	defaultIntensity: number;
	skinProtection: number;
	extras: PortraitFilterExtras;
	cube: ColorCubeLut;
}

export interface ResolvedPortraitFilter {
	preset?: PortraitFilterPreset;
	presetId: string;
	intensity: number;
	beauty: number;
}

export const PORTRAIT_FILTER_PRESETS =
	generatedPresets as PortraitFilterPreset[];

const presetsById = new Map(
	PORTRAIT_FILTER_PRESETS.map((preset) => [preset.id, preset])
);

function resolveAmount({
	value,
	fallback,
	flag,
}: {
	value?: number;
	fallback: number;
	flag: string;
}): number {
	const amount = value ?? fallback;
	if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
		throw new Error(`${flag} must be between 0 and 100`);
	}
	return amount;
}

export function getPortraitFilterPreset({
	presetId,
}: {
	presetId: string;
}): PortraitFilterPreset | undefined {
	return presetsById.get(presetId);
}

export function resolvePortraitFilter({
	presetId = DEFAULT_PORTRAIT_FILTER_ID,
	intensity,
	beauty,
	defaultBeauty = DEFAULT_PORTRAIT_BEAUTY,
}: {
	presetId?: string;
	intensity?: number;
	beauty?: number;
	defaultBeauty?: number;
}): ResolvedPortraitFilter {
	const normalizedPresetId = presetId.trim().toLowerCase();
	const preset =
		normalizedPresetId === "none"
			? undefined
			: getPortraitFilterPreset({ presetId: normalizedPresetId });
	if (normalizedPresetId !== "none" && !preset) {
		throw new Error(
			`Unknown portrait filter: ${presetId}. Available: none, ${PORTRAIT_FILTER_PRESETS.map((item) => item.id).join(", ")}`
		);
	}
	return {
		preset,
		presetId: normalizedPresetId,
		intensity: resolveAmount({
			value: intensity,
			fallback: preset?.defaultIntensity ?? 0,
			flag: "--filter-intensity",
		}),
		beauty: resolveAmount({
			value: beauty,
			fallback: defaultBeauty,
			flag: "--beauty",
		}),
	};
}

export function listPortraitFilters() {
	return PORTRAIT_FILTER_PRESETS.map((preset) => ({
		id: preset.id,
		name: preset.name,
		localized_name: preset.localizedName,
		default_intensity: preset.defaultIntensity,
		skin_protection: preset.skinProtection,
	}));
}
