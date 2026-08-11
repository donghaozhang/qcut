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

function hasConfiguredColorFilter({
	filter,
}: {
	filter: NonNullable<MediaElement["color"]>["filter"];
}): boolean {
	return filter.presetId !== "none";
}

function hasConfiguredLut({
	lut,
}: {
	lut: NonNullable<MediaElement["color"]>["lut"];
}): boolean {
	return (
		lut.enabled ||
		lut.presetId !== "none" ||
		lut.intensity !== 100 ||
		lut.skinProtection !== 0 ||
		lut.cube !== undefined ||
		lut.dual !== undefined
	);
}

function hasColorEdits({ element }: { element: MediaElement }): boolean {
	const hasLegacyAdjustments = Object.values(element.adjustments ?? {}).some(
		(value) => value !== 0
	);
	const color = element.color;
	if (!color) return hasLegacyAdjustments;

	const hasBasicEdits = Object.entries(color.basic).some(
		([property, value]) =>
			property !== "enabled" && typeof value === "number" && value !== 0
	);
	const hasHslEdits = Object.values(color.hsl.ranges).some((range) =>
		Object.values(range).some((value) => value !== 0)
	);
	return (
		hasLegacyAdjustments ||
		hasConfiguredColorFilter({ filter: color.filter }) ||
		hasBasicEdits ||
		hasConfiguredLut({ lut: color.lut }) ||
		color.hsl.enabled ||
		hasHslEdits ||
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
	const hasConfiguredMask = masks.some(
		(mask) =>
			mask &&
			(mask.type !== "none" ||
				hasKeyframeEntries({ value: mask.keyframes }) ||
				mask.tracking !== undefined ||
				Boolean(mask.sourceMediaId?.trim()))
	);
	const customCutout = element.customCutout;
	const hasConfiguredCutout =
		customCutout !== undefined &&
		(customCutout.enabled ||
			customCutout.strokes.length > 0 ||
			(customCutout.status !== undefined && customCutout.status !== "idle") ||
			Boolean(customCutout.error?.trim()) ||
			Boolean(customCutout.sourceMediaId?.trim()) ||
			Boolean(customCutout.resultMaskId?.trim()) ||
			Boolean(customCutout.generatedFrom?.trim()));
	const chromaKey = element.chromaKey;
	const hasConfiguredChromaKey =
		chromaKey !== undefined &&
		(chromaKey.enabled ||
			chromaKey.color.toLowerCase() !== "#00ff00" ||
			(chromaKey.similarity !== 0 && chromaKey.similarity !== 0.2) ||
			(chromaKey.blend !== 0 && chromaKey.blend !== 0.1) ||
			chromaKey.shadow !== 0 ||
			chromaKey.cleanup !== 0 ||
			chromaKey.spill !== 0 ||
			hasKeyframeEntries({ value: chromaKey.keyframes }));
	return hasConfiguredMask || hasConfiguredCutout || hasConfiguredChromaKey;
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
		audio.voiceEnhance.clarity !== 0 ||
		audio.voiceEnhance.warmth !== 0 ||
		audio.voiceEnhance.presence !== 0;
	const hasEqualizer =
		audio.equalizer.lowGainDb !== 0 ||
		audio.equalizer.midGainDb !== 0 ||
		audio.equalizer.highGainDb !== 0;

	return (
		hasLegacyEdits ||
		hasUnmappedVolume ||
		audio.fadeIn > 0 ||
		audio.fadeOut > 0 ||
		audio.channelMode !== "stereo" ||
		(audio.panEnabled && Math.abs(audio.pan) > Number.EPSILON) ||
		audio.loudness.enabled ||
		audio.denoise.amount > 0 ||
		hasVoiceEnhancement ||
		audio.pitch.semitones !== 0 ||
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

function hasAudioLyrics({ element }: { element: MediaElement }): boolean {
	const lyrics = element.audio?.lyrics;
	if (!lyrics) return false;
	return (
		lyrics.status !== "idle" ||
		lyrics.text.trim().length > 0 ||
		lyrics.words.length > 0 ||
		Boolean(lyrics.language?.trim()) ||
		Boolean(lyrics.sourceMediaId?.trim()) ||
		Boolean(lyrics.captionTrackId?.trim()) ||
		lyrics.sourceFormat !== undefined ||
		Object.keys(lyrics.speakerNames ?? {}).length > 0 ||
		lyrics.maxWordsPerLine !== undefined ||
		Boolean(lyrics.error?.trim())
	);
}

function hasInactiveFreezeFramePosition({
	element,
}: {
	element: MediaElement;
}): boolean {
	const duration = element.freezeFrameDuration ?? 0;
	return (
		element.freezeFrameTime !== undefined &&
		Number.isFinite(duration) &&
		duration === 0
	);
}

function addFeatureIssue({
	element,
	issues,
	message,
	severity = "warning",
}: {
	element: MediaElement;
	issues: JianyingDraftIssue[];
	message: string;
	severity?: JianyingDraftIssue["severity"];
}): void {
	issues.push({
		code: "UNSUPPORTED_MEDIA_FEATURE",
		severity,
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
	mediaName,
}: {
	element: MediaElement;
	mediaName?: string;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];

	if (element.groupId?.trim()) {
		addFeatureIssue({
			element,
			issues,
			message: "Timeline element grouping is not mapped yet.",
		});
	}
	if (element.templateBinding !== undefined) {
		addFeatureIssue({
			element,
			issues,
			message:
				"QCut template binding metadata is not represented in the draft.",
		});
	}
	if (element.colorLabel?.trim()) {
		addFeatureIssue({
			element,
			issues,
			message: "Timeline element color labels are not mapped yet.",
		});
	}
	if (
		mediaName !== undefined &&
		element.name.trim().length > 0 &&
		element.name !== mediaName
	) {
		addFeatureIssue({
			element,
			issues,
			message:
				"Custom timeline element names are not represented separately from media names.",
		});
	}
	if (
		hasEntries({ value: element.effects }) ||
		hasEntries({ value: element.effectChains }) ||
		hasEntries({ value: element.effectIds })
	) {
		addFeatureIssue({
			element,
			issues,
			message: "QCut effects are not represented in the plaintext baseline.",
			severity: "error",
		});
	}
	if (hasColorEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Color adjustments need a JianYing-native mapping or baking.",
			severity: "error",
		});
	}
	if (hasMaskOrCutoutEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Masks and cutouts need a JianYing-native mapping or baking.",
			severity: "error",
		});
	}
	if (hasEnhancementEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "AI media enhancements are not represented in the draft.",
			severity: "error",
		});
	}
	if (hasCropPerspectiveOrFitEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Crop, perspective, and fit-mode settings are not mapped yet.",
			severity: "error",
		});
	}
	if (element.width !== undefined || element.height !== undefined) {
		addFeatureIssue({
			element,
			issues,
			message: "Explicit media bounds need a verified JianYing scale mapping.",
			severity: "error",
		});
	}
	if (element.blendMode !== undefined && element.blendMode !== "normal") {
		addFeatureIssue({
			element,
			issues,
			message: "Non-normal blend modes are not mapped yet.",
			severity: "error",
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
			severity: "error",
		});
	}
	if (
		(element.animationInType === "none" &&
			element.animationInDuration !== undefined &&
			element.animationInDuration !== 0.5) ||
		(element.animationOutType === "none" &&
			element.animationOutDuration !== undefined &&
			element.animationOutDuration !== 0.5) ||
		(element.comboAnimationType === "none" &&
			element.comboAnimationIntensity !== undefined &&
			element.comboAnimationIntensity !== 0.5)
	) {
		addFeatureIssue({
			element,
			issues,
			message:
				"Disabled clip animations retain non-default parameters that are not represented in the draft.",
			severity: "error",
		});
	}
	if (hasKeyframeEntries({ value: element.keyframes })) {
		addFeatureIssue({
			element,
			issues,
			message: "Transform keyframes are not mapped in the first baseline.",
			severity: "error",
		});
	}
	if (hasAudioEdits({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Advanced QCut audio processing is not mapped yet.",
			severity: "error",
		});
	}
	if (hasAudioLyrics({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Audio lyrics and word timings are not mapped yet.",
			severity: "error",
		});
	}
	if (hasInactiveFreezeFramePosition({ element })) {
		addFeatureIssue({
			element,
			issues,
			message: "Inactive freeze-frame position metadata is not preserved.",
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
			severity: "error",
		});
	}

	return issues;
}

export function collectLossyTrackMetadataIssues({
	isImplicitMainTrack,
	track,
}: {
	isImplicitMainTrack: boolean;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	if (track.height !== undefined) {
		issues.push({
			code: "UNSUPPORTED_TRACK_METADATA",
			severity: "warning",
			message: `Track ${track.id} custom lane height is not represented in the draft.`,
			trackId: track.id,
		});
	}
	if (track.isMain && !isImplicitMainTrack) {
		issues.push({
			code: "UNSUPPORTED_TRACK_METADATA",
			severity: "warning",
			message: `Track ${track.id} cannot retain its QCut main-track designation without changing render order.`,
			trackId: track.id,
		});
	}
	if (track.isMain === false && isImplicitMainTrack) {
		issues.push({
			code: "UNSUPPORTED_TRACK_METADATA",
			severity: "warning",
			message: `Track ${track.id} is explicitly non-main in QCut but becomes the target draft's implicit main video track.`,
			trackId: track.id,
		});
	}
	return issues;
}
