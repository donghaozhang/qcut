export type EffectRenderStageKind =
	| "filter"
	| "motion"
	| "overlay"
	| "composite"
	| "audio-reactive"
	| "person-tracking";

export type EffectMotionProperty = "x" | "y" | "scale" | "rotation" | "opacity";

export type EffectMotionWaveform = "sine" | "cosine" | "linear";

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
}

export interface EffectMotionRenderStage {
	kind: "motion";
	intensity: number;
	channels: EffectMotionChannel[];
}

export interface EffectOverlayRenderStage {
	kind: "overlay";
	resourceId: string;
	blendMode: "normal" | "screen" | "multiply" | "overlay";
	opacity: number;
	fit: "cover" | "contain" | "stretch";
}

export interface EffectCompositeRenderStage {
	kind: "composite";
	layout: "split-horizontal" | "split-vertical" | "mirror" | "grid";
	copies: 2 | 4;
	gap: number;
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
}

export interface EffectPersonTrackingRenderStage {
	kind: "person-tracking";
	target: "face" | "body" | "person";
	treatment: "outline" | "spotlight" | "background-blur";
	fallback: "center" | "full-frame" | "disable";
}

export type EffectRenderStage =
	| EffectFilterRenderStage
	| EffectMotionRenderStage
	| EffectOverlayRenderStage
	| EffectCompositeRenderStage
	| EffectAudioReactiveRenderStage
	| EffectPersonTrackingRenderStage;

export interface EffectRenderProgram {
	version: 1;
	stages: EffectRenderStage[];
}
