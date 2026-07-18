import type {
	EffectAudioReactiveEnvelope,
	EffectRenderProgram,
} from "./effect-render-types";
import { buildNumericKeyframeExpression } from "./keyframe-expression";
import { gateEffectExpression } from "./effect-render-window";

type AudioReactiveProperty = "brightness" | "scale" | "opacity";

function normalizedEnvelopeExpression({
	envelope,
	timeVariable,
}: {
	envelope?: EffectAudioReactiveEnvelope;
	timeVariable: string;
}): string {
	if (!envelope || envelope.keyframes.length === 0) return "0";
	const keyframesByFrame = new Map<
		number,
		{ frame: number; value: number; easing: "linear" }
	>();
	for (const keyframe of envelope.keyframes) {
		const frame = Math.max(0, Math.round(keyframe.timeSeconds * 1_000));
		keyframesByFrame.set(frame, {
			frame,
			value: Math.min(1, Math.max(0, keyframe.value)),
			easing: "linear",
		});
	}
	return buildNumericKeyframeExpression({
		keyframes: [...keyframesByFrame.values()],
		fps: 1_000,
		fallback: 0,
		timeVariable,
	});
}

export function hasEffectAudioReactiveProperty({
	program,
	property,
}: {
	program?: EffectRenderProgram;
	property: AudioReactiveProperty;
}): boolean {
	return (
		program?.stages.some(
			(stage) => stage.kind === "audio-reactive" && stage.property === property
		) ?? false
	);
}

export function buildEffectAudioReactiveExpression({
	program,
	envelopes,
	property,
	timeVariable,
}: {
	program?: EffectRenderProgram;
	envelopes?: readonly EffectAudioReactiveEnvelope[];
	property: AudioReactiveProperty;
	timeVariable: string;
}): string {
	if (!program) return "1";
	const expressions: string[] = [];
	for (const [stageIndex, stage] of program.stages.entries()) {
		if (stage.kind !== "audio-reactive" || stage.property !== property)
			continue;
		const envelope = envelopes?.find(
			(candidate) => candidate.stageIndex === stageIndex
		);
		const level = normalizedEnvelopeExpression({ envelope, timeVariable });
		const active =
			`(${stage.minimum})+` +
			`((${stage.maximum})-(${stage.minimum}))*(${level})`;
		expressions.push(
			gateEffectExpression({
				active,
				inactive: "1",
				window: stage.window,
				timeVariable,
			})
		);
	}
	return expressions.length === 0
		? "1"
		: expressions.map((expression) => `(${expression})`).join("*");
}
