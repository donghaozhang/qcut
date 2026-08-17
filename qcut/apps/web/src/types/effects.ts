import type { EffectEngine } from "@qcut/editor-core";
import type {
	AnimatedParameter,
	EffectAudioCompanion,
	EffectParameters,
	EffectRenderProgram,
	EffectType,
	JianyingAdjustParameter,
} from "@qcut/editor-core";

export type {
	AnimatedParameter,
	EffectAudioCompanion,
	EffectChain,
	EffectInstance,
	EffectKeyframe,
	EffectParameters,
	EffectRenderProgram,
	EffectRenderStage,
	EffectMotionRenderStage,
	EffectType,
	JianyingAdjustParameter,
	JianyingAdjustValue,
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
	audioCompanion?: EffectAudioCompanion;
	preview?: string;
	/** Set for lab presets rendered by the local Jianying runtime. */
	engine?: EffectEngine;
	packageHash?: string;
	/** Slider schema for jianying-local presets, from the package itself. */
	adjustParameters?: JianyingAdjustParameter[];
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

export type { EffectEngine };
