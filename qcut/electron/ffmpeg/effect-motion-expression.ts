import type {
	EffectMotionChannel,
	EffectMotionProperty,
	EffectRenderProgram,
} from "./effect-render-types";

export interface EffectMotionExpressions {
	x: string;
	y: string;
	scale: string;
	rotation: string;
	opacity: string;
}

function numberExpression(value: number): string {
	if (!Number.isFinite(value)) return "0";
	return String(Number(value.toFixed(8)));
}

function buildWaveExpression({
	channel,
	timeVariable,
	duration,
}: {
	channel: EffectMotionChannel;
	timeVariable: string;
	duration: number;
}): string {
	if (channel.waveform === "linear") {
		return `min(1,max(0,(${timeVariable})/${numberExpression(Math.max(0.001, duration))}))`;
	}

	const frequency = numberExpression(channel.frequencyHz ?? 1);
	const phase = numberExpression(channel.phase ?? 0);
	const functionName = channel.waveform === "cosine" ? "cos" : "sin";
	return `${functionName}((${timeVariable})*2*PI*${frequency}+${phase})`;
}

function buildChannelValue({
	channel,
	intensity,
	timeVariable,
	duration,
}: {
	channel: EffectMotionChannel;
	intensity: number;
	timeVariable: string;
	duration: number;
}): string {
	const amplitude = numberExpression(channel.amplitude * intensity);
	const wave = buildWaveExpression({ channel, timeVariable, duration });
	return `(${amplitude})*(${wave})`;
}

export function hasEffectMotionProperty({
	program,
	property,
}: {
	program?: EffectRenderProgram;
	property: EffectMotionProperty;
}): boolean {
	return Boolean(
		program?.stages.some(
			(stage) =>
				stage.kind === "motion" &&
				stage.channels.some((channel) => channel.property === property)
		)
	);
}

export function buildEffectMotionExpressions({
	program,
	timeVariable,
	duration,
	width,
	height,
}: {
	program?: EffectRenderProgram;
	timeVariable: string;
	duration: number;
	width: number;
	height: number;
}): EffectMotionExpressions {
	const expressions: Record<EffectMotionProperty, string[]> = {
		x: [],
		y: [],
		scale: [],
		rotation: [],
		opacity: [],
	};

	for (const stage of program?.stages ?? []) {
		if (stage.kind !== "motion") continue;
		for (const channel of stage.channels) {
			const value = buildChannelValue({
				channel,
				intensity: stage.intensity,
				timeVariable,
				duration,
			});
			if (channel.property === "x") {
				expressions.x.push(`(${numberExpression(width)})*(${value})`);
			}
			if (channel.property === "y") {
				expressions.y.push(`(${numberExpression(height)})*(${value})`);
			}
			if (channel.property === "scale") {
				expressions.scale.push(`max(0.01,1+(${value}))`);
			}
			if (channel.property === "rotation") {
				expressions.rotation.push(value);
			}
			if (channel.property === "opacity") {
				expressions.opacity.push(`max(0,min(1,1+(${value})))`);
			}
		}
	}

	const additive = ({ values }: { values: string[] }) =>
		values.length > 0 ? values.map((value) => `(${value})`).join("+") : "0";
	const multiplicative = ({ values }: { values: string[] }) =>
		values.length > 0 ? values.map((value) => `(${value})`).join("*") : "1";

	return {
		x: additive({ values: expressions.x }),
		y: additive({ values: expressions.y }),
		scale: multiplicative({ values: expressions.scale }),
		rotation: additive({ values: expressions.rotation }),
		opacity: multiplicative({ values: expressions.opacity }),
	};
}
