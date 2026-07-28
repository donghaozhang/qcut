/**
 * Timeline Store Normalization
 *
 * Pure functions for normalizing timeline elements and tracks on load.
 * Ensures markdown elements have all required defaults.
 *
 * @module stores/timeline-store-normalization
 */

import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { normalizeTextAnimations } from "@qcut/editor-core";
import { clampMarkdownDuration } from "@/lib/markdown";
import {
	DEFAULT_MEDIA_MASK,
	normalizeMediaMask,
	resolveMediaMasks,
} from "@/lib/video/video-properties";
import { normalizeMediaChromaKey } from "@/lib/video/media-chroma-key";
import { normalizeMediaCustomCutout } from "@/lib/video/media-custom-cutout";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import {
	buildLegacyAudioFields,
	normalizeMediaAudioSettings,
} from "@/lib/audio/audio-properties";
import { normalizeTrackAudioSettings } from "@/lib/audio/audio-mix-settings";
import {
	buildLegacyColorAdjustments,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";

export function normalizeMarkdownElement({
	element,
}: {
	element: TimelineElement;
}): TimelineElement {
	if (element.type !== "markdown") {
		return element;
	}

	return {
		...element,
		markdownContent: element.markdownContent ?? "",
		theme: element.theme ?? "dark",
		fontSize: element.fontSize ?? 18,
		fontFamily: element.fontFamily ?? "Arial",
		padding: element.padding ?? 16,
		backgroundColor: element.backgroundColor ?? "rgba(0, 0, 0, 0.85)",
		textColor: element.textColor ?? "#ffffff",
		scrollMode: element.scrollMode ?? "static",
		scrollSpeed: element.scrollSpeed ?? 30,
		x: element.x ?? 0,
		y: element.y ?? 0,
		width: element.width ?? 720,
		height: element.height ?? 420,
		rotation: element.rotation ?? 0,
		opacity: element.opacity ?? 1,
		duration: clampMarkdownDuration({
			duration:
				element.duration ?? TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
		}),
	};
}

export function normalizeMediaElement({
	element,
}: {
	element: TimelineElement;
}): TimelineElement {
	if (element.type !== "media") return element;
	const masks = resolveMediaMasks(element);
	const audio = normalizeMediaAudioSettings({ element });
	const legacyAudio = buildLegacyAudioFields({ settings: audio });
	const color = normalizeMediaColorSettings({ element });
	const legacyColor = buildLegacyColorAdjustments({ settings: color });

	return {
		...element,
		x: element.x ?? 0,
		y: element.y ?? 0,
		rotation: element.rotation ?? 0,
		scaleX: element.scaleX ?? 1,
		scaleY: element.scaleY ?? 1,
		maintainAspectRatio: element.maintainAspectRatio ?? true,
		flipHorizontal: element.flipHorizontal ?? false,
		flipVertical: element.flipVertical ?? false,
		opacity: element.opacity ?? 1,
		blendMode: element.blendMode ?? "normal",
		fitMode: element.fitMode ?? "cover",
		crop: element.crop ?? { top: 0, right: 0, bottom: 0, left: 0 },
		perspective: element.perspective ?? {
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
			bottomRightX: 1,
			bottomRightY: 1,
			bottomLeftX: 0,
			bottomLeftY: 1,
		},
		animationInType: element.animationInType ?? "none",
		animationInDuration: element.animationInDuration ?? 0.5,
		animationOutType: element.animationOutType ?? "none",
		animationOutDuration: element.animationOutDuration ?? 0.5,
		comboAnimationType: element.comboAnimationType ?? "none",
		comboAnimationIntensity: element.comboAnimationIntensity ?? 0.5,
		adjustments: legacyColor,
		color,
		mask: masks[0] ?? normalizeMediaMask(element.mask ?? DEFAULT_MEDIA_MASK),
		masks,
		customCutout: normalizeMediaCustomCutout(element.customCutout),
		chromaKey: normalizeMediaChromaKey(element.chromaKey),
		enhancements: element.enhancements ?? {
			stabilization: 0,
			denoise: 0,
			clarity: 0,
			upscale: 1,
			relight: 0,
			beauty: 0,
		},
		audio,
		...legacyAudio,
		playbackRate: element.playbackRate ?? 1,
		reverse: element.reverse ?? false,
		freezeFrameDuration: element.freezeFrameDuration ?? 0,
	};
}

export function normalizeTextElement({
	element,
	fps = 30,
}: {
	element: TimelineElement;
	fps?: number;
}): TimelineElement {
	if (element.type !== "text") return element;

	const normalization = normalizeTextAnimations({ element, fps });
	if (normalization.source === "unsupported") {
		return element;
	}
	if (
		normalization.source === "legacy" &&
		element.textAnimations === undefined
	) {
		return element;
	}
	if (normalization.animation) {
		return {
			...element,
			textAnimations: normalization.animation,
		};
	}
	if (element.textAnimations === undefined) {
		return element;
	}
	return {
		...element,
		textAnimations: undefined,
	};
}

export function normalizeLoadedTracks({
	tracks,
	fps = 30,
}: {
	tracks: TimelineTrack[];
	fps?: number;
}): TimelineTrack[] {
	return tracks.map((track) => ({
		...track,
		audio:
			track.type === "media" || track.type === "audio"
				? normalizeTrackAudioSettings({ audio: track.audio })
				: track.audio,
		audioCrossfades:
			track.type === "media" || track.type === "audio"
				? (track.audioCrossfades ?? []).map((crossfade) => ({ ...crossfade }))
				: track.audioCrossfades,
		elements: track.elements.map((element) =>
			normalizeMediaElement({
				element: normalizeTextElement({
					element: normalizeMarkdownElement({ element }),
					fps,
				}),
			})
		),
	}));
}
