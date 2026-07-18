import type {
	EffectMotionChannel,
	EffectMotionProperty,
	EffectRenderProgram,
} from "@qcut/editor-core";

export interface EffectMotionState {
	offsetX: number;
	offsetY: number;
	scale: number;
	rotation: number;
	opacity: number;
}

export const IDENTITY_EFFECT_MOTION_STATE: EffectMotionState = {
	offsetX: 0,
	offsetY: 0,
	scale: 1,
	rotation: 0,
	opacity: 1,
};

function sampleWaveform({
	channel,
	localTime,
	duration,
}: {
	channel: EffectMotionChannel;
	localTime: number;
	duration: number;
}): number {
	if (channel.waveform === "linear") {
		return Math.min(1, Math.max(0, localTime / Math.max(0.001, duration)));
	}

	const frequency = channel.frequencyHz ?? 1;
	const angle = localTime * Math.PI * 2 * frequency + (channel.phase ?? 0);
	return channel.waveform === "cosine" ? Math.cos(angle) : Math.sin(angle);
}

function applyChannel({
	state,
	property,
	value,
	canvasWidth,
	canvasHeight,
}: {
	state: EffectMotionState;
	property: EffectMotionProperty;
	value: number;
	canvasWidth: number;
	canvasHeight: number;
}): void {
	if (property === "x") state.offsetX += value * canvasWidth;
	if (property === "y") state.offsetY += value * canvasHeight;
	if (property === "scale") state.scale *= Math.max(0.01, 1 + value);
	if (property === "rotation") state.rotation += value;
	if (property === "opacity") {
		state.opacity *= Math.min(1, Math.max(0, 1 + value));
	}
}

export function getEffectMotionState({
	program,
	localTime,
	duration,
	canvasWidth,
	canvasHeight,
}: {
	program?: EffectRenderProgram;
	localTime: number;
	duration: number;
	canvasWidth: number;
	canvasHeight: number;
}): EffectMotionState {
	if (!program) return { ...IDENTITY_EFFECT_MOTION_STATE };

	const state = { ...IDENTITY_EFFECT_MOTION_STATE };
	for (const stage of program.stages) {
		if (stage.kind !== "motion") continue;
		for (const channel of stage.channels) {
			const sample = sampleWaveform({ channel, localTime, duration });
			applyChannel({
				state,
				property: channel.property,
				value: channel.amplitude * stage.intensity * sample,
				canvasWidth,
				canvasHeight,
			});
		}
	}
	return state;
}
