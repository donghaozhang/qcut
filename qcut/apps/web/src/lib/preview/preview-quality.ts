import type { PreviewQualityPreset } from "@/types/playback";
import type { TranslationKey } from "@/lib/i18n";

export interface PreviewQualityOption {
	value: PreviewQualityPreset;
	labelKey: TranslationKey;
	descriptionKey: TranslationKey;
	maxDimension: number | null;
	forceProxy: boolean;
}

interface ResolveEffectivePreviewQualityOptionParams {
	quality: PreviewQualityPreset;
	runtimeQuality?: PreviewQualityPreset | null;
	sourceWidth: number;
	sourceHeight: number;
	hasEnhancements: boolean;
}

const HIGH_RESOLUTION_EDGE = 2160;
const LARGE_RESOLUTION_EDGE = 1440;
const SMOOTH_FRAME_INTERVAL_MS = 45;
const LOW_FRAME_INTERVAL_MS = 70;
const SMOOTH_STUTTER_COUNT = 3;
const LOW_STUTTER_COUNT = 5;
const STABLE_FRAMES_TO_RECOVER = 90;

export const PREVIEW_QUALITY_OPTIONS: readonly PreviewQualityOption[] = [
	{
		value: "auto",
		labelKey: "editor.preview.qualityAuto",
		descriptionKey: "editor.preview.qualityAutoDescription",
		maxDimension: null,
		forceProxy: false,
	},
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

export function resolveEffectivePreviewQualityOption({
	quality,
	runtimeQuality,
	sourceWidth,
	sourceHeight,
	hasEnhancements,
}: ResolveEffectivePreviewQualityOptionParams): PreviewQualityOption {
	const selectedOption = getPreviewQualityOption({ quality });
	if (quality !== "auto") {
		return selectedOption;
	}
	if (
		runtimeQuality === "clear" ||
		runtimeQuality === "smooth" ||
		runtimeQuality === "low"
	) {
		return getPreviewQualityOption({ quality: runtimeQuality });
	}

	const longestEdge = Math.max(
		Number.isFinite(sourceWidth) ? sourceWidth : 0,
		Number.isFinite(sourceHeight) ? sourceHeight : 0
	);
	if (longestEdge >= HIGH_RESOLUTION_EDGE) {
		return getPreviewQualityOption({ quality: "smooth" });
	}
	if (longestEdge >= LARGE_RESOLUTION_EDGE || hasEnhancements) {
		return getPreviewQualityOption({ quality: "clear" });
	}
	return getPreviewQualityOption({ quality: "original" });
}

export function resolveRuntimePreviewQuality({
	selectedQuality,
	currentRuntimeQuality,
	averageFrameIntervalMs,
	stutterFrameCount,
	stableFrameCount,
}: {
	selectedQuality: PreviewQualityPreset;
	currentRuntimeQuality: PreviewQualityPreset | null;
	averageFrameIntervalMs: number;
	stutterFrameCount: number;
	stableFrameCount: number;
}): PreviewQualityPreset | null {
	if (selectedQuality !== "auto") return null;
	if (
		averageFrameIntervalMs >= LOW_FRAME_INTERVAL_MS ||
		stutterFrameCount >= LOW_STUTTER_COUNT
	) {
		return "low";
	}
	if (
		averageFrameIntervalMs >= SMOOTH_FRAME_INTERVAL_MS ||
		stutterFrameCount >= SMOOTH_STUTTER_COUNT
	) {
		return currentRuntimeQuality === "low" ? "low" : "smooth";
	}
	if (stableFrameCount >= STABLE_FRAMES_TO_RECOVER) {
		return null;
	}
	return currentRuntimeQuality;
}
