import type {
	EffectAudioReactiveRenderStage,
	EffectRenderProgram,
} from "@qcut/editor-core";
import type { EffectMotionState } from "./effect-motion-preview";

export interface EffectAudioReactiveState {
	brightness: number;
	scale: number;
	opacity: number;
}

export interface EffectAudioReactiveStageReference {
	stageIndex: number;
	stage: EffectAudioReactiveRenderStage;
}

export const IDENTITY_EFFECT_AUDIO_REACTIVE_STATE: EffectAudioReactiveState = {
	brightness: 1,
	scale: 1,
	opacity: 1,
};

export function getEffectAudioReactiveStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectAudioReactiveStageReference[] {
	if (!program) return [];
	return program.stages.flatMap((stage, stageIndex) =>
		stage.kind === "audio-reactive" ? [{ stageIndex, stage }] : []
	);
}

export function getEffectAudioReactiveState({
	program,
	levelByStageIndex,
}: {
	program?: EffectRenderProgram;
	levelByStageIndex: ReadonlyMap<number, number>;
}): EffectAudioReactiveState {
	const state = { ...IDENTITY_EFFECT_AUDIO_REACTIVE_STATE };
	for (const { stageIndex, stage } of getEffectAudioReactiveStages({
		program,
	})) {
		const level = Math.min(
			1,
			Math.max(0, levelByStageIndex.get(stageIndex) ?? 0)
		);
		const value = stage.minimum + (stage.maximum - stage.minimum) * level;
		state[stage.property] *= value;
	}
	return state;
}

export function mergeEffectMotionWithAudioReactive({
	motion,
	audioReactive,
}: {
	motion: EffectMotionState;
	audioReactive: EffectAudioReactiveState;
}): EffectMotionState {
	return {
		...motion,
		scale: motion.scale * audioReactive.scale,
		opacity: motion.opacity * audioReactive.opacity,
	};
}

export function appendAudioReactiveBrightnessFilter({
	filter,
	audioReactive,
}: {
	filter: string;
	audioReactive: EffectAudioReactiveState;
}): string {
	if (Math.abs(audioReactive.brightness - 1) < 0.0001) return filter;
	return [filter, `brightness(${audioReactive.brightness.toFixed(4)})`]
		.filter(Boolean)
		.join(" ");
}
