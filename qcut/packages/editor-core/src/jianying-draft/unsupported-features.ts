import type { MediaElement, TimelineTrack } from "../types/timeline.js";
import type { JianyingDraftIssue } from "./types.js";

function hasEntries({ value }: { value: unknown[] | undefined }): boolean {
	return (value?.length ?? 0) > 0;
}

function hasKeyframeEntries({
	value,
}: {
	value: Record<string, unknown[] | undefined> | undefined;
}): boolean {
	return Object.values(value ?? {}).some(
		(keyframes) => (keyframes?.length ?? 0) > 0
	);
}

function hasColorEdits({ element }: { element: MediaElement }): boolean {
	const hasLegacyAdjustments = Object.values(element.adjustments ?? {}).some(
		(value) => value !== 0
	);
	const color = element.color;
	if (!color?.enabled) return hasLegacyAdjustments;

	const hasBasicEdits = Object.entries(color.basic).some(
		([property, value]) =>
			property !== "enabled" && typeof value === "number" && value !== 0
	);
	return (
		hasLegacyAdjustments ||
		(color.filter.presetId !== "none" && color.filter.intensity > 0) ||
		(color.basic.enabled && hasBasicEdits) ||
		color.lut.enabled ||
		color.hsl.enabled ||
		color.curves.enabled ||
		color.secondaryCurves.enabled ||
		color.wheels.enabled ||
		color.smart.enabled ||
		color.management.enabled ||
		hasKeyframeEntries({ value: color.keyframes }) ||
		hasKeyframeEntries({ value: color.curveShapeKeyframes })
	);
}

function hasMaskOrCutoutEdits({ element }: { element: MediaElement }): boolean {
	const masks = [element.mask, ...(element.masks ?? [])];
	const hasActiveMask = masks.some(
		(mask) => mask && mask.enabled !== false && mask.type !== "none"
	);
	return (
		hasActiveMask ||
		element.customCutout?.enabled === true ||
		element.chromaKey?.enabled === true
	);
}

function hasEnhancementEdits({ element }: { element: MediaElement }): boolean {
	const enhancements = element.enhancements;
	if (!enhancements) return false;
	return (
		enhancements.stabilization > 0 ||
		enhancements.denoise > 0 ||
		enhancements.clarity > 0 ||
		enhancements.upscale > 1 ||
		enhancements.relight !== 0 ||
		enhancements.beauty > 0
	);
}

function hasCropPerspectiveOrFitEdits({
	element,
}: {
	element: MediaElement;
}): boolean {
	const hasCrop = Object.values(element.crop ?? {}).some(
		(value) => value !== 0
	);
	const perspective = element.perspective;
	const hasPerspective =
		perspective !== undefined &&
		(perspective.topLeftX !== 0 ||
			perspective.topLeftY !== 0 ||
			perspective.topRightX !== 1 ||
			perspective.topRightY !== 0 ||
			perspective.bottomRightX !== 1 ||
			perspective.bottomRightY !== 1 ||
			perspective.bottomLeftX !== 0 ||
			perspective.bottomLeftY !== 1);
	const hasNonDefaultFit =
		element.fitMode !== undefined && element.fitMode !== "cover";
	return hasCrop || hasPerspective || hasNonDefaultFit;
}

function hasAudioEdits({ element }: { element: MediaElement }): boolean {
	const audio = element.audio;
	const hasLegacyEdits =
		(element.audioFadeIn ?? 0) > 0 ||
		(element.audioFadeOut ?? 0) > 0 ||
		element.audioNormalize === true ||
		(element.audioDenoise ?? 0) > 0 ||
		Math.abs(element.audioPan ?? 0) > Number.EPSILON;
	if (!audio) return hasLegacyEdits;

	const audioGain =
		audio.enabled && audio.volumeDb > -60 ? 10 ** (audio.volumeDb / 20) : 0;
	const hasUnmappedVolume =
		Math.abs(audioGain - (element.volume ?? 1)) > 0.0001;
	const hasRepair = Object.values(audio.repair).some(
		(module) => module.enabled
	);
	const hasVoiceEnhancement =
		audio.voiceEnhance.enabled &&
		(audio.voiceEnhance.clarity !== 0 ||
			audio.voiceEnhance.warmth !== 0 ||
			audio.voiceEnhance.presence !== 0);
	const hasEqualizer =
		audio.equalizer.enabled &&
		(audio.equalizer.lowGainDb !== 0 ||
			audio.equalizer.midGainDb !== 0 ||
			audio.equalizer.highGainDb !== 0);

	return (
		hasLegacyEdits ||
		hasUnmappedVolume ||
		audio.fadeIn > 0 ||
		audio.fadeOut > 0 ||
		audio.channelMode !== "stereo" ||
		(audio.panEnabled && Math.abs(audio.pan) > Number.EPSILON) ||
		audio.loudness.enabled ||
		(audio.denoise.enabled && audio.denoise.amount > 0) ||
		hasVoiceEnhancement ||
		(audio.pitch.enabled && audio.pitch.semitones !== 0) ||
		hasEqualizer ||
		audio.parametricEqualizer.enabled ||
		hasRepair ||
		audio.compressor.enabled ||
		audio.limiter.enabled ||
		(audio.reverb.enabled && audio.reverb.mix > 0) ||
		(audio.echo.enabled && audio.echo.mix > 0) ||
		(audio.telephone.enabled && audio.telephone.mix > 0) ||
		audio.separation.enabled ||
		audio.voiceConversion.enabled ||
		audio.cover.enabled ||
		hasKeyframeEntries({ value: audio.keyframes })
	);
}

function addFeatureIssue({
	element,
	issues,
	message,
}: {
	element: MediaElement;
	issues: JianyingDraftIssue[];
	message: string;
}): void {
	issues.push({
		code: "UNSUPPORTED_MEDIA_FEATURE",
		severity: "warning",
		message,
		elementId: element.id,
		mediaId: element.mediaId,
	});
}

export function findBlockingMediaTimingIssue({
	element,
}: {
	element: MediaElement;
}): JianyingDraftIssue | null {
	const hasSpeedCurve = hasEntries({ value: element.speedKeyframes });
	const hasFreezeFrame = (element.freezeFrameDuration ?? 0) > 0;
	if (
		!hasSpeedCurve &&
		!element.reverse &&
		!hasFreezeFrame &&
		!element.compound
	) {
		return null;
	}

	return {
		code: "UNSUPPORTED_MEDIA_TIMING",
		severity: "error",
		message:
			"Speed curves, reverse playback, freeze frames, and compound clips need a native mapping or baked media before draft export.",
		elementId: element.id,
		mediaId: element.mediaId,
	};
}

export function hasLossyTrackAudioSettings({
	track,
}: {
	track: TimelineTrack;
}): boolean {
	if ((track.audioCrossfades?.length ?? 0) > 0) return true;
	const audio = track.audio;
	if (!audio) return false;
	return (
		audio.gainDb !== 0 ||
		audio.pan !== 0 ||
		audio.solo ||
		audio.busId !== "master" ||
		audio.effects.parametricEqualizer.enabled ||
		audio.effects.compressor.enabled ||
		audio.effects.limiter.enabled ||
		audio.ducking.enabled ||
		audio.autoCrossfade.enabled
	);
}

export function collectLossyMediaFeatureIssues({
	element,
}: {
	element: MediaElement;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];

	if (
		hasEntries({ value: element.effects }) ||
		hasEntries({ value: element.effectChains }) ||
		hasEntries({ value: element.effectIds })
	) {
		addFeatureIssue({
			element,
			issues,
			message: "QCut effects are not represented in the plaintext baseline.",
		});
	}
	if (hasColorEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Color adjustments need a JianYing-native mapping or baking.",
		});
	}
	if (hasMaskOrCutoutEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Masks and cutouts need a JianYing-native mapping or baking.",
		});
	}
	if (hasEnhancementEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "AI media enhancements are not represented in the draft.",
		});
	}
	if (hasCropPerspectiveOrFitEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Crop, perspective, and fit-mode settings are not mapped yet.",
		});
	}
	if (element.width !== undefined || element.height !== undefined) {
		addFeatureIssue({
			element,
			issues,
			message: "Explicit media bounds need a verified JianYing scale mapping.",
		});
	}
	if (element.blendMode !== undefined && element.blendMode !== "normal") {
		addFeatureIssue({
			element,
			issues,
			message: "Non-normal blend modes are not mapped yet.",
		});
	}
	if (
		(element.animationInType !== undefined &&
			element.animationInType !== "none") ||
		(element.animationOutType !== undefined &&
			element.animationOutType !== "none") ||
		(element.comboAnimationType !== undefined &&
			element.comboAnimationType !== "none")
	) {
		addFeatureIssue({
			element,
			issues,
			message: "Clip animations need a JianYing-native mapping or baking.",
		});
	}
	if (hasKeyframeEntries({ value: element.keyframes })) {
		addFeatureIssue({
			element,
			issues,
			message: "Transform keyframes are not mapped in the first baseline.",
		});
	}
	if (hasAudioEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Advanced QCut audio processing is not mapped yet.",
		});
	}
	if (
		element.frameInterpolation !== undefined &&
		element.frameInterpolation !== "none"
	) {
		addFeatureIssue({
			element,
			issues,
			message: "Frame interpolation settings are not represented in the draft.",
		});
	}

	return issues;
}
