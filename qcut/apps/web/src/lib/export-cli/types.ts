/**
 * Export CLI Types
 *
 * Type definitions for the export engine CLI module.
 * Extracted from export-engine-cli.ts for reuse across filter and source modules.
 */

import type {
	EffectAudioReactiveEnvelope,
	EffectRenderProgram,
} from "@qcut/editor-core";
import type {
	AudioCrossfade,
	AudioMixBusSettings,
	ClipTransitionDirection,
	ClipTransitionEasing,
	ClipTransitionType,
	ClipTransitionMaskShape,
	ClipTransitionTuning,
	MediaAudioSettings,
	MediaColorSettings,
	MediaMask,
	TimelineTrackAudioSettings,
} from "@/types/timeline";

export interface AudioCrossfadeInput extends AudioCrossfade {
	trackId: string;
}

export interface AudioTrackMixInput extends TimelineTrackAudioSettings {
	trackId: string;
	muted: boolean;
}

export interface AudioMixConfigInput {
	master: AudioMixBusSettings;
	buses: AudioMixBusSettings[];
	tracks: AudioTrackMixInput[];
}

export interface VideoTransitionInput {
	id: string;
	trackId: string;
	fromElementId: string;
	toElementId: string;
	presetId: string;
	type: ClipTransitionType;
	direction?: ClipTransitionDirection;
	easing: ClipTransitionEasing;
	duration: number;
	tuning?: ClipTransitionTuning;
	maskShape?: ClipTransitionMaskShape;
}

/**
 * Video source input for FFmpeg direct copy optimization.
 * Matches IPC handler expectations for video segment data.
 */
export interface VideoVisualInput {
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
	opacity: number;
	blendMode:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten";
	fitMode: "cover" | "contain" | "fill";
	crop: { top: number; right: number; bottom: number; left: number };
	perspective: {
		topLeftX: number;
		topLeftY: number;
		topRightX: number;
		topRightY: number;
		bottomRightX: number;
		bottomRightY: number;
		bottomLeftX: number;
		bottomLeftY: number;
	};
	animationInType:
		| "none"
		| "fade"
		| "slide-left"
		| "slide-right"
		| "slide-up"
		| "slide-down"
		| "zoom-in"
		| "zoom-out";
	animationInDuration: number;
	animationOutType:
		| "none"
		| "fade"
		| "slide-left"
		| "slide-right"
		| "slide-up"
		| "slide-down"
		| "zoom-in"
		| "zoom-out";
	animationOutDuration: number;
	comboAnimationType: "none" | "pulse" | "drift";
	comboAnimationIntensity: number;
	adjustments: {
		brightness: number;
		contrast: number;
		saturation: number;
		temperature: number;
		tint: number;
		sharpness: number;
		fade: number;
		vignette: number;
	};
	color: MediaColorSettings;
	mask: MediaMask;
	masks: MediaMask[];
	customCutout: {
		enabled: boolean;
		applyStrokes: boolean;
		strokes: Array<{
			id: string;
			frame: number;
			mode: "foreground" | "background";
			size: number;
			points: Array<{ x: number; y: number }>;
		}>;
		status?: "idle" | "processing" | "ready" | "error";
		error?: string;
		sourceMediaId?: string;
		resultMaskId?: string;
		generatedFrom?: string;
	};
	chromaKey: {
		enabled: boolean;
		color: string;
		similarity: number;
		blend: number;
		shadow: number;
		cleanup: number;
		spill: number;
		keyframes?: Partial<
			Record<
				"similarity" | "blend" | "shadow" | "cleanup" | "spill",
				Array<{
					id: string;
					frame: number;
					value: number;
					easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
				}>
			>
		>;
	};
	enhancements: {
		stabilization: number;
		denoise: number;
		clarity: number;
		upscale: 1 | 2 | 4;
		relight: number;
		beauty: number;
	};
	keyframes?: Partial<
		Record<
			string,
			Array<{
				id: string;
				frame: number;
				value: number;
				easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
			}>
		>
	>;
	keyframeFps: number;
}

export interface VideoSourceInput {
	elementId: string;
	trackId?: string;
	/** UI order, top to bottom. Lower values composite later. */
	trackOrder?: number;
	elementOrder?: number;
	path: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	playbackRate: number;
	speedKeyframes?: Array<{
		id: string;
		frame: number;
		value: number;
		easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
	}>;
	reverse: boolean;
	freezeFrameTime?: number;
	freezeFrameDuration: number;
	visual?: VideoVisualInput;
	effectFilter?: string;
	effectRenderProgram?: EffectRenderProgram;
	effectOverlaySources?: EffectOverlaySourceInput[];
	effectPersonSources?: EffectPersonSourceInput[];
	effectDistortionSources?: EffectDistortionSourceInput[];
	effectAudioReactiveEnvelopes?: EffectAudioReactiveEnvelope[];
}

export interface EffectOverlaySourceInput {
	resourceId: string;
	stageIndex: number;
	path: string;
	animated: boolean;
	/**
	 * Present for baked procedural frame sequences: `path` is then an image2
	 * pattern (…/f_%05d.png) consumed with -framerate instead of -loop.
	 */
	sequence?: { framerate: number };
}

export interface EffectPersonSourceInput {
	stageIndex: number;
	path: string;
	animated: boolean;
}

/**
 * Baked remap coordinate maps for one distortion render stage. Paths are
 * concrete PGM files for static variants or image2 patterns (…/f_%05d.pgm)
 * for animated ones.
 */
export interface EffectDistortionSourceInput {
	stageIndex: number;
	xmapPath: string;
	ymapPath: string;
	animated: boolean;
	sequence?: { framerate: number };
}

/**
 * Audio file input for FFmpeg export.
 * Contains path, timing, and volume information for audio mixing.
 */
export interface AudioFileInput {
	elementId?: string;
	trackId?: string;
	path: string;
	startTime: number;
	volume: number;
	sourceGain?: number;
	trimStart?: number;
	trimEnd?: number;
	duration?: number;
	fadeIn?: number;
	fadeOut?: number;
	normalize?: boolean;
	denoise?: number;
	pan?: number;
	audio?: MediaAudioSettings;
	playbackRate?: number;
	speedKeyframes?: Array<{
		id: string;
		frame: number;
		value: number;
		easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
	}>;
	reverse?: boolean;
	freezeFrameTime?: number;
	freezeFrameDuration?: number;
}

/**
 * Image source input for FFmpeg overlay filter.
 * Contains path, timing, and dimension data for image compositing.
 */
export interface ImageSourceInput {
	path: string; // Local file path for FFmpeg
	trackId?: string;
	trackOrder?: number;
	elementOrder?: number;
	startTime: number; // When image appears on timeline
	duration: number; // How long image is visible
	width?: number; // Original image width
	height?: number; // Original image height
	trimStart: number; // Trim start (usually 0 for images)
	trimEnd: number; // Trim end (usually 0 for images)
	elementId: string; // For debugging
	visual?: VideoVisualInput;
	effectFilter?: string;
	effectRenderProgram?: EffectRenderProgram;
	effectOverlaySources?: EffectOverlaySourceInput[];
	effectPersonSources?: EffectPersonSourceInput[];
	effectDistortionSources?: EffectDistortionSourceInput[];
	effectAudioReactiveEnvelopes?: EffectAudioReactiveEnvelope[];
}

/**
 * Sticker source for FFmpeg overlay filter.
 * Contains all positioning, sizing, timing, and effect data.
 */
export interface StickerSourceForFilter {
	id: string;
	animated?: boolean;
	trackId?: string;
	trackOrder?: number;
	elementOrder?: number;
	path: string;
	x: number;
	y: number;
	width: number;
	height: number;
	startTime: number;
	endTime: number;
	zIndex: number;
	opacity?: number;
	rotation?: number;
	maintainAspectRatio?: boolean;
}

/**
 * Progress callback type for export progress reporting.
 */
export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Font configuration return type for platform-specific resolution.
 * - useFontconfig: true for Linux/macOS (fontconfig name)
 * - useFontconfig: false for Windows (explicit file path)
 */
export type FontConfig =
	| { useFontconfig: true; fontName: string }
	| { useFontconfig: false; fontPath: string };

/**
 * Platform type from Electron API.
 */
export type Platform = "win32" | "darwin" | "linux";

/**
 * Re-export TextElement for use in filter modules (using export from).
 */
export type { TextElement } from "@/types/timeline";
