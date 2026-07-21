export type EffectMotionProperty = "x" | "y" | "scale" | "rotation" | "opacity";

export interface EffectRenderWindow {
	startSeconds: number;
	endSeconds: number;
}

export interface EffectMotionChannel {
	property: EffectMotionProperty;
	waveform: "sine" | "cosine" | "linear";
	amplitude: number;
	frequencyHz?: number;
	phase?: number;
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

export interface EffectAudioReactiveEnvelope {
	stageIndex: number;
	keyframes: Array<{ timeSeconds: number; value: number }>;
}

export interface EffectPersonSource {
	stageIndex: number;
	path: string;
	animated: boolean;
	inputIndex?: number;
}

export interface EffectPersonTrackingRenderStage {
	kind: "person-tracking";
	target: "face" | "body" | "person";
	treatment:
		| "outline"
		| "spotlight"
		| "background-blur"
		| "subject-blur"
		| "subject-pixelate"
		| "echo";
	/** Clone/echo styling for the "echo" treatment. */
	echoVariant?: "strobe" | "trail" | "shatter" | "dots";
	intensity?: number;
	vignette?: boolean;
	stroke?: {
		style: string;
		color: string;
		width: number;
		glow: number;
	};
	fallback: "center" | "full-frame" | "disable";
	window?: EffectRenderWindow;
}

export interface EffectParticleRenderStage {
	kind: "particles";
	variant: string;
	density: number;
	speed: number;
	color: string;
	opacity: number;
	window?: EffectRenderWindow;
}

export interface EffectDecorationRenderStage {
	kind: "decoration";
	variant: string;
	color: string;
	opacity: number;
	window?: EffectRenderWindow;
}

export interface EffectDistortionRenderStage {
	kind: "distortion";
	variant: string;
	/** Distortion amount, 0–1. */
	strength: number;
	window?: EffectRenderWindow;
}

export type EffectRenderStage =
	| { kind: "filter"; window?: EffectRenderWindow }
	| EffectMotionRenderStage
	| EffectOverlayRenderStage
	| EffectCompositeRenderStage
	| {
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
	| EffectPersonTrackingRenderStage
	| EffectParticleRenderStage
	| EffectDecorationRenderStage
	| EffectDistortionRenderStage;

export interface EffectRenderProgram {
	version: 1;
	stages: EffectRenderStage[];
}
