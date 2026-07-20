export type EffectRenderStageKind =
	| "filter"
	| "motion"
	| "overlay"
	| "composite"
	| "audio-reactive"
	| "person-tracking"
	| "particles"
	| "decoration"
	| "distortion";

export type EffectMotionProperty = "x" | "y" | "scale" | "rotation" | "opacity";

export type EffectMotionWaveform = "sine" | "cosine" | "linear";

/** Clip-local output time in seconds. */
export interface EffectRenderWindow {
	startSeconds: number;
	endSeconds: number;
}

export interface EffectMotionChannel {
	/** x/y amplitudes are canvas ratios; scale/opacity are ratios; rotation is degrees. */
	property: EffectMotionProperty;
	waveform: EffectMotionWaveform;
	amplitude: number;
	frequencyHz?: number;
	phase?: number;
}

export interface EffectFilterRenderStage {
	kind: "filter";
	window?: EffectRenderWindow;
}

export interface EffectMotionRenderStage {
	kind: "motion";
	intensity: number;
	channels: EffectMotionChannel[];
	window?: EffectRenderWindow;
}

export interface EffectOverlayRenderStage {
	kind: "overlay";
	resourceId: string;
	blendMode: "normal" | "screen" | "multiply" | "overlay";
	opacity: number;
	fit: "cover" | "contain" | "stretch";
	window?: EffectRenderWindow;
}

export interface EffectCompositeRenderStage {
	kind: "composite";
	layout: "split-horizontal" | "split-vertical" | "mirror" | "grid";
	copies: 2 | 4;
	gap: number;
	window?: EffectRenderWindow;
}

export interface EffectAudioReactiveRenderStage {
	kind: "audio-reactive";
	driver: "source" | "timeline";
	band: "bass" | "mid" | "treble" | "full";
	property: "brightness" | "scale" | "opacity";
	minimum: number;
	maximum: number;
	attackMs: number;
	releaseMs: number;
	window?: EffectRenderWindow;
}

export interface EffectAudioReactiveKeyframe {
	timeSeconds: number;
	value: number;
}

/** Export-time normalized audio envelope for one audio-reactive stage. */
export interface EffectAudioReactiveEnvelope {
	stageIndex: number;
	keyframes: EffectAudioReactiveKeyframe[];
}

export interface EffectPersonTrackingRenderStage {
	kind: "person-tracking";
	target: "face" | "body" | "person";
	treatment: "outline" | "spotlight" | "background-blur";
	fallback: "center" | "full-frame" | "disable";
	window?: EffectRenderWindow;
}

export type EffectParticleVariant =
	| "snow"
	| "sakura"
	| "embers"
	| "stars"
	| "confetti"
	| "fog"
	| "coins"
	| "butterfly";

/**
 * Procedural particle field (氛围-style overlays: snow, sakura, embers, …).
 * Rendered deterministically from clip-local time so the catalog thumbnail,
 * timeline preview, and frame-based export all agree.
 */
export interface EffectParticleRenderStage {
	kind: "particles";
	variant: EffectParticleVariant;
	/** Relative particle count, 0–1 (scaled to canvas area at render time). */
	density: number;
	/** Fall/drift speed multiplier. */
	speed: number;
	/** CSS color of the particles. */
	color: string;
	/** Overall layer opacity, 0–1. */
	opacity: number;
	window?: EffectRenderWindow;
}

export type EffectDecorationVariant =
	| "grid"
	| "rainbow-rays"
	| "film-end"
	| "iris"
	| "standby"
	| "burst"
	| "lens-flare"
	| "floating-text";

/**
 * Procedural non-particle overlays (上下网格 / 彩虹射线 / 全剧终) drawn on a
 * canvas from clip-local time. Like particles, the preview is complete and
 * frame-based export burn-in is a tracked follow-up.
 */
export interface EffectDecorationRenderStage {
	kind: "decoration";
	variant: EffectDecorationVariant;
	/** Primary CSS color (grid lines, ray tint, letterbox text). */
	color: string;
	/** Overall layer opacity, 0–1. */
	opacity: number;
	window?: EffectRenderWindow;
}

export type EffectDistortionVariant =
	| "fisheye"
	| "ripple"
	| "shockwave"
	| "magnifier";

/**
 * Radial displacement distortion (鱼眼 / 水波纹 / 冲击波). Sampled per output
 * pixel from clip-local time via sampleDistortionSource; the canvas preview
 * remaps the source frame and frame-based export burn-in is a follow-up.
 */
export interface EffectDistortionRenderStage {
	kind: "distortion";
	variant: EffectDistortionVariant;
	/** Distortion amount, 0–1. */
	strength: number;
	window?: EffectRenderWindow;
}

export type EffectRenderStage =
	| EffectFilterRenderStage
	| EffectMotionRenderStage
	| EffectOverlayRenderStage
	| EffectCompositeRenderStage
	| EffectAudioReactiveRenderStage
	| EffectPersonTrackingRenderStage
	| EffectParticleRenderStage
	| EffectDecorationRenderStage
	| EffectDistortionRenderStage;

export interface EffectRenderProgram {
	version: 1;
	stages: EffectRenderStage[];
}
