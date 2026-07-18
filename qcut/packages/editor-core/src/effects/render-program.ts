import type {
	EffectRenderProgram,
	EffectRenderStage,
	EffectRenderStageKind,
} from "../types/effect-render.js";

export interface EffectRenderProgramValidation {
	valid: boolean;
	errors: string[];
}

function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value);
}

function validateStage({
	stage,
	index,
}: {
	stage: EffectRenderStage;
	index: number;
}): string[] {
	const prefix = `stages[${index}]`;
	if (stage.kind === "filter") return [];

	if (stage.kind === "motion") {
		const errors: string[] = [];
		if (!isFiniteNumber(stage.intensity) || stage.intensity < 0) {
			errors.push(`${prefix}.intensity must be a non-negative number`);
		}
		if (stage.channels.length === 0) {
			errors.push(`${prefix}.channels must not be empty`);
		}
		for (const [channelIndex, channel] of stage.channels.entries()) {
			if (!isFiniteNumber(channel.amplitude)) {
				errors.push(
					`${prefix}.channels[${channelIndex}].amplitude must be finite`
				);
			}
			if (
				channel.frequencyHz !== undefined &&
				(!isFiniteNumber(channel.frequencyHz) || channel.frequencyHz < 0)
			) {
				errors.push(
					`${prefix}.channels[${channelIndex}].frequencyHz must be non-negative`
				);
			}
			if (channel.phase !== undefined && !isFiniteNumber(channel.phase)) {
				errors.push(`${prefix}.channels[${channelIndex}].phase must be finite`);
			}
		}
		return errors;
	}

	if (stage.kind === "overlay") {
		const errors: string[] = [];
		if (stage.resourceId.trim().length === 0) {
			errors.push(`${prefix}.resourceId must not be empty`);
		}
		if (
			!isFiniteNumber(stage.opacity) ||
			stage.opacity < 0 ||
			stage.opacity > 1
		) {
			errors.push(`${prefix}.opacity must be between 0 and 1`);
		}
		return errors;
	}

	if (stage.kind === "composite") {
		const errors: string[] = [];
		if (!isFiniteNumber(stage.gap) || stage.gap < 0 || stage.gap > 0.25) {
			errors.push(`${prefix}.gap must be between 0 and 0.25`);
		}
		if (stage.layout === "grid" && stage.copies !== 4) {
			errors.push(`${prefix}.copies must be 4 for grid layouts`);
		}
		if (
			(stage.layout === "split-horizontal" ||
				stage.layout === "split-vertical") &&
			stage.copies !== 2
		) {
			errors.push(`${prefix}.copies must be 2 for split layouts`);
		}
		return errors;
	}

	if (stage.kind === "audio-reactive") {
		const errors: string[] = [];
		if (!isFiniteNumber(stage.minimum) || !isFiniteNumber(stage.maximum)) {
			errors.push(`${prefix}.minimum and maximum must be finite`);
		}
		if (stage.minimum > stage.maximum) {
			errors.push(`${prefix}.minimum must not exceed maximum`);
		}
		if (stage.attackMs < 0 || stage.releaseMs < 0) {
			errors.push(`${prefix}.attackMs and releaseMs must be non-negative`);
		}
		return errors;
	}

	return [];
}

export function validateEffectRenderProgram({
	program,
}: {
	program: EffectRenderProgram;
}): EffectRenderProgramValidation {
	const errors = program.stages.flatMap((stage, index) =>
		validateStage({ stage, index })
	);
	if (program.version !== 1) {
		errors.unshift("version must be 1");
	}
	if (program.stages.length === 0) {
		errors.unshift("stages must not be empty");
	}
	return { valid: errors.length === 0, errors };
}

export function combineEffectRenderPrograms({
	programs,
}: {
	programs: readonly EffectRenderProgram[];
}): EffectRenderProgram | undefined {
	const stages = programs.flatMap((program) => program.stages);
	if (stages.length === 0) return undefined;
	return { version: 1, stages };
}

export function collectEffectRenderStageKinds({
	program,
}: {
	program: EffectRenderProgram;
}): Set<EffectRenderStageKind> {
	return new Set(program.stages.map((stage) => stage.kind));
}
