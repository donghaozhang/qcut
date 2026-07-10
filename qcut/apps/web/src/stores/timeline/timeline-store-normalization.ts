/**
 * Timeline Store Normalization
 *
 * Pure functions for normalizing timeline elements and tracks on load.
 * Ensures markdown elements have all required defaults.
 *
 * @module stores/timeline-store-normalization
 */

import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { clampMarkdownDuration } from "@/lib/markdown";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";

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
		adjustments: element.adjustments ?? {
			brightness: 0,
			contrast: 0,
			saturation: 0,
			temperature: 0,
			tint: 0,
			sharpness: 0,
			fade: 0,
			vignette: 0,
		},
		mask: element.mask ?? {
			type: "none",
			centerX: 0.5,
			centerY: 0.5,
			width: 0.8,
			height: 0.8,
			rotation: 0,
			feather: 0,
			invert: false,
		},
		chromaKey: element.chromaKey ?? {
			enabled: false,
			color: "#00ff00",
			similarity: 0.2,
			blend: 0.1,
		},
		enhancements: element.enhancements ?? {
			stabilization: 0,
			denoise: 0,
			clarity: 0,
			upscale: 1,
			relight: 0,
			beauty: 0,
		},
		audioFadeIn: element.audioFadeIn ?? 0,
		audioFadeOut: element.audioFadeOut ?? 0,
		audioNormalize: element.audioNormalize ?? false,
		audioDenoise: element.audioDenoise ?? 0,
		audioPan: element.audioPan ?? 0,
		playbackRate: element.playbackRate ?? 1,
		reverse: element.reverse ?? false,
		freezeFrameDuration: element.freezeFrameDuration ?? 0,
	};
}

export function normalizeLoadedTracks({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TimelineTrack[] {
	return tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) =>
			normalizeMediaElement({
				element: normalizeMarkdownElement({ element }),
			})
		),
	}));
}
