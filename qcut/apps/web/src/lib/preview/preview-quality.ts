import type { PreviewQualityPreset } from "@/types/playback";
import type { TranslationKey } from "@/lib/i18n";

export interface PreviewQualityOption {
	value: PreviewQualityPreset;
	labelKey: TranslationKey;
	descriptionKey: TranslationKey;
	maxDimension: number | null;
	forceProxy: boolean;
}

export const PREVIEW_QUALITY_OPTIONS: readonly PreviewQualityOption[] = [
	{
		value: "original",
		labelKey: "editor.preview.qualityOriginal",
		descriptionKey: "editor.preview.qualityOriginalDescription",
		maxDimension: null,
		forceProxy: false,
	},
	{
		value: "clear",
		labelKey: "editor.preview.qualityClear",
		descriptionKey: "editor.preview.qualityClearDescription",
		maxDimension: 1280,
		forceProxy: true,
	},
	{
		value: "smooth",
		labelKey: "editor.preview.qualitySmooth",
		descriptionKey: "editor.preview.qualitySmoothDescription",
		maxDimension: 854,
		forceProxy: true,
	},
	{
		value: "low",
		labelKey: "editor.preview.qualityLow",
		descriptionKey: "editor.preview.qualityLowDescription",
		maxDimension: 480,
		forceProxy: true,
	},
];

export function getPreviewQualityOption({
	quality,
}: {
	quality: PreviewQualityPreset;
}): PreviewQualityOption {
	return (
		PREVIEW_QUALITY_OPTIONS.find((option) => option.value === quality) ??
		PREVIEW_QUALITY_OPTIONS[0]
	);
}
