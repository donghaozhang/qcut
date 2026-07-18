import type {
	AnimatedParameter,
	EffectParameters,
	EffectRenderProgram,
	EffectType,
} from "@qcut/editor-core";

export type {
	AnimatedParameter,
	EffectChain,
	EffectInstance,
	EffectKeyframe,
	EffectParameters,
	EffectRenderProgram,
	EffectRenderStage,
	EffectMotionRenderStage,
	EffectType,
} from "@qcut/editor-core";

export interface EffectPreset {
	id: string;
	name: string;
	description: string;
	category: EffectCategory;
	icon: string;
	parameters: EffectParameters;
	effectType?: EffectType;
	renderProgram?: EffectRenderProgram;
	preview?: string;
}

export type EffectCategory =
	| "basic"
	| "color"
	| "artistic"
	| "vintage"
	| "cinematic"
	| "distortion"
	| "transition"
	| "composite";

export interface TimelineEffect {
	id: string;
	elementId: string;
	trackId: string;
	effectType: EffectType;
	parameters: EffectParameters;
	startTime: number;
	endTime: number;
	enabled: boolean;
	animations?: AnimatedParameter[];
}
