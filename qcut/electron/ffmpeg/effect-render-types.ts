export type EffectMotionProperty = "x" | "y" | "scale" | "rotation" | "opacity";

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
}

export type EffectRenderStage =
	| { kind: "filter" }
	| EffectMotionRenderStage
	| {
			kind: "overlay";
			resourceId: string;
			blendMode: "normal" | "screen" | "multiply" | "overlay";
			opacity: number;
			fit: "cover" | "contain" | "stretch";
	  }
	| {
			kind: "composite";
			layout: "split-horizontal" | "split-vertical" | "mirror" | "grid";
			copies: 2 | 4;
			gap: number;
	  }
	| {
			kind: "audio-reactive";
			driver: "source" | "timeline";
			band: "bass" | "mid" | "treble" | "full";
			property: "brightness" | "scale" | "opacity";
			minimum: number;
			maximum: number;
			attackMs: number;
			releaseMs: number;
	  }
	| {
			kind: "person-tracking";
			target: "face" | "body" | "person";
			treatment: "outline" | "spotlight" | "background-blur";
			fallback: "center" | "full-frame" | "disable";
	  };

export interface EffectRenderProgram {
	version: 1;
	stages: EffectRenderStage[];
}
