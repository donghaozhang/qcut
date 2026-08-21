import type {
	PreviewQualityDiagnostic,
	PreviewQualityDowngradeReason,
	PreviewQualityPreset,
} from "@/types/playback";
import type { TranslationKey } from "@/lib/i18n";

export interface PreviewQualityOption {
	value: PreviewQualityPreset;
	labelKey: TranslationKey;
	descriptionKey: TranslationKey;
	maxDimension: number | null;
	forceProxy: boolean;
}

export type PreviewEffectRenderMode = "full" | "reduced" | "minimal";

interface ResolveEffectivePreviewQualityOptionParams {
	quality: PreviewQualityPreset;
	runtimeQuality?: PreviewQualityPreset | null;
	sourceWidth: number;
	sourceHeight: number;
	hasEnhancements: boolean;
}

interface ResolveRuntimePreviewQualityParams {
	selectedQuality: PreviewQualityPreset;
	currentRuntimeQuality: PreviewQualityPreset | null;
	averageFrameIntervalMs: number;
	stutterFrameCount: number;
	stableFrameCount: number;
	averagePresentedFrameIntervalMs?: number;
	presentedFrameStallCount?: number;
}

export interface RuntimePreviewQualityDecision {
	quality: PreviewQualityPreset | null;
	diagnostic: PreviewQualityDiagnostic | null;
}

export function buildPreviewFrameCacheIdentity({
	quality,
	width,
	height,
}: {
	quality: PreviewQualityPreset;
	width: number;
	height: number;
}): string {
	const normalizedWidth = Math.max(1, Math.round(width));
	const normalizedHeight = Math.max(1, Math.round(height));
	return `preview-quality:${quality}:viewport:${normalizedWidth}x${normalizedHeight}`;
}

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

	// Enhancements are rendered by the ffmpeg proxy, so they always need it.
	if (hasEnhancements) {
		return getPreviewQualityOption({ quality: "clear" });
	}
	// Resolution no longer forces a proxy up front: playback starts on the
	// original source and the runtime health monitor downgrades to a proxy
	// preset (resolveRuntimePreviewQualityDecision) only when real frame
	// pressure is measured. Machines that decode high-res sources directly
	// skip the proxy — and its chunk-switch churn — entirely.
	return getPreviewQualityOption({ quality: "original" });
}

function resolveDowngradeReason({
	hasMainThreadPressure,
	hasPresentedFramePressure,
}: {
	hasMainThreadPressure: boolean;
	hasPresentedFramePressure: boolean;
}): PreviewQualityDowngradeReason | null {
	if (hasMainThreadPressure && hasPresentedFramePressure) return "combined";
	if (hasPresentedFramePressure) return "video-frame";
	if (hasMainThreadPressure) return "main-thread";
	return null;
}

export function resolveRuntimePreviewQualityDecision({
	selectedQuality,
	currentRuntimeQuality,
	averageFrameIntervalMs,
	stutterFrameCount,
	stableFrameCount,
	averagePresentedFrameIntervalMs = 0,
	presentedFrameStallCount = 0,
}: ResolveRuntimePreviewQualityParams): RuntimePreviewQualityDecision {
	if (selectedQuality !== "auto") {
		return { quality: null, diagnostic: null };
	}
	const effectiveAverageFrameIntervalMs = Math.max(
		averageFrameIntervalMs,
		averagePresentedFrameIntervalMs
	);
	const effectiveStutterFrameCount =
		stutterFrameCount + presentedFrameStallCount;
	const hasMainThreadPressure =
		averageFrameIntervalMs >= SMOOTH_FRAME_INTERVAL_MS ||
		stutterFrameCount >= SMOOTH_STUTTER_COUNT;
	const hasPresentedFramePressure =
		averagePresentedFrameIntervalMs >= SMOOTH_FRAME_INTERVAL_MS ||
		presentedFrameStallCount >= SMOOTH_STUTTER_COUNT;
	const downgradeReason = resolveDowngradeReason({
		hasMainThreadPressure,
		hasPresentedFramePressure,
	});
	const diagnostic = downgradeReason
		? {
				reason: downgradeReason,
				averageMainThreadFrameIntervalMs: averageFrameIntervalMs,
				mainThreadStutterCount: stutterFrameCount,
				averagePresentedFrameIntervalMs,
				presentedFrameStallCount,
			}
		: null;

	if (
		effectiveAverageFrameIntervalMs >= LOW_FRAME_INTERVAL_MS ||
		effectiveStutterFrameCount >= LOW_STUTTER_COUNT
	) {
		return { quality: "low", diagnostic };
	}
	if (
		effectiveAverageFrameIntervalMs >= SMOOTH_FRAME_INTERVAL_MS ||
		effectiveStutterFrameCount >= SMOOTH_STUTTER_COUNT
	) {
		return {
			quality: currentRuntimeQuality === "low" ? "low" : "smooth",
			diagnostic,
		};
	}
	if (stableFrameCount >= STABLE_FRAMES_TO_RECOVER) {
		return { quality: null, diagnostic: null };
	}
	return { quality: currentRuntimeQuality, diagnostic: null };
}

export function resolveRuntimePreviewQuality({
	selectedQuality,
	currentRuntimeQuality,
	averageFrameIntervalMs,
	stutterFrameCount,
	stableFrameCount,
	averagePresentedFrameIntervalMs,
	presentedFrameStallCount,
}: ResolveRuntimePreviewQualityParams): PreviewQualityPreset | null {
	return resolveRuntimePreviewQualityDecision({
		selectedQuality,
		currentRuntimeQuality,
		averageFrameIntervalMs,
		stutterFrameCount,
		stableFrameCount,
		averagePresentedFrameIntervalMs,
		presentedFrameStallCount,
	}).quality;
}

export function resolvePreviewEffectRenderMode({
	quality,
	isPlaying,
}: {
	quality: PreviewQualityPreset;
	isPlaying: boolean;
}): PreviewEffectRenderMode {
	if (!isPlaying) return "full";
	if (quality === "low") return "minimal";
	if (quality === "smooth") return "reduced";
	return "full";
}
