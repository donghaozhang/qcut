import type { VideoVisual } from "./types";
import { buildNumericKeyframeExpression } from "./keyframe-expression";

type VideoChromaKey = NonNullable<VideoVisual["chromaKey"]>;
type ChromaKeyProperty = keyof NonNullable<VideoChromaKey["keyframes"]>;

const DEFAULT_CHROMA_KEY: VideoChromaKey = {
	enabled: false,
	color: "#00ff00",
	similarity: 0.2,
	blend: 0.1,
	shadow: 0,
	cleanup: 0,
	spill: 0,
};

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeChromaKey({
	chromaKey,
}: {
	chromaKey?: Partial<VideoChromaKey>;
}): VideoChromaKey {
	return {
		...DEFAULT_CHROMA_KEY,
		...chromaKey,
		color:
			chromaKey?.color && /^#[0-9a-f]{6}$/i.test(chromaKey.color)
				? chromaKey.color
				: DEFAULT_CHROMA_KEY.color,
		similarity: clamp({
			value: chromaKey?.similarity ?? DEFAULT_CHROMA_KEY.similarity,
			min: 0.01,
			max: 1,
		}),
		blend: clamp({
			value: chromaKey?.blend ?? DEFAULT_CHROMA_KEY.blend,
			min: 0,
			max: 1,
		}),
		shadow: clamp({
			value: chromaKey?.shadow ?? DEFAULT_CHROMA_KEY.shadow,
			min: 0,
			max: 1,
		}),
		cleanup: clamp({
			value: chromaKey?.cleanup ?? DEFAULT_CHROMA_KEY.cleanup,
			min: 0,
			max: 1,
		}),
		spill: clamp({
			value: chromaKey?.spill ?? DEFAULT_CHROMA_KEY.spill,
			min: 0,
			max: 1,
		}),
	};
}

function ffmpegColor({ color }: { color: string }): string {
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	return match ? `0x${match[1]}` : "black";
}

function screenType({ color }: { color: string }): "green" | "blue" {
	const green = Number.parseInt(color.slice(3, 5), 16);
	const blue = Number.parseInt(color.slice(5, 7), 16);
	return blue > green ? "blue" : "green";
}

function hasKeyframes({
	chromaKey,
	property,
}: {
	chromaKey: VideoChromaKey;
	property: ChromaKeyProperty;
}): boolean {
	return (chromaKey.keyframes?.[property]?.length ?? 0) > 0;
}

function propertyExpression({
	chromaKey,
	property,
	fps,
	timeVariable,
}: {
	chromaKey: VideoChromaKey;
	property: ChromaKeyProperty;
	fps: number;
	timeVariable: string;
}): string {
	return buildNumericKeyframeExpression({
		keyframes: chromaKey.keyframes?.[property],
		fps,
		fallback: chromaKey[property],
		timeVariable,
	});
}

function effectiveSimilarityExpression({
	chromaKey,
	fps,
	timeVariable,
}: {
	chromaKey: VideoChromaKey;
	fps: number;
	timeVariable: string;
}): string {
	const similarity = propertyExpression({
		chromaKey,
		property: "similarity",
		fps,
		timeVariable,
	});
	const shadow = propertyExpression({
		chromaKey,
		property: "shadow",
		fps,
		timeVariable,
	});
	return `(${similarity})+(1-(${similarity}))*(${shadow})*0.35`;
}

function escapeSendCommandExpression({ expression }: { expression: string }) {
	return expression.replace(/\\/g, "\\\\").replace(/,/g, "\\\\,");
}

export interface ChromaKeyFilterGraph {
	filterSteps: string[];
	outputLabel: string;
}

export function buildChromaKeyFilterGraph({
	inputLabel,
	labelPrefix,
	chromaKey: sourceChromaKey,
	fps,
	duration,
}: {
	inputLabel: string;
	labelPrefix: string;
	chromaKey?: Partial<VideoChromaKey>;
	fps: number;
	duration: number;
}): ChromaKeyFilterGraph {
	const chromaKey = normalizeChromaKey({ chromaKey: sourceChromaKey });
	if (!chromaKey.enabled) return { filterSteps: [], outputLabel: inputLabel };

	const filterSteps: string[] = [];
	const chromaFilterName = `${labelPrefix}_filter`;
	const despillFilterName = `${labelPrefix}_despill_filter`;
	const similarityAnimated =
		hasKeyframes({ chromaKey, property: "similarity" }) ||
		hasKeyframes({ chromaKey, property: "shadow" });
	const blendAnimated = hasKeyframes({ chromaKey, property: "blend" });
	const spillAnimated = hasKeyframes({ chromaKey, property: "spill" });
	const commands: string[] = [];
	if (similarityAnimated) {
		commands.push(
			`[expr] chromakey@${chromaFilterName} similarity ${escapeSendCommandExpression(
				{
					expression: effectiveSimilarityExpression({
						chromaKey,
						fps,
						timeVariable: "T",
					}),
				}
			)}`
		);
	}
	if (blendAnimated) {
		commands.push(
			`[expr] chromakey@${chromaFilterName} blend ${escapeSendCommandExpression(
				{
					expression: propertyExpression({
						chromaKey,
						property: "blend",
						fps,
						timeVariable: "T",
					}),
				}
			)}`
		);
	}
	if (spillAnimated) {
		commands.push(
			`[expr] despill@${despillFilterName} mix ${escapeSendCommandExpression({
				expression: propertyExpression({
					chromaKey,
					property: "spill",
					fps,
					timeVariable: "T",
				}),
			})}`
		);
	}

	let current = inputLabel;
	if (commands.length > 0) {
		const commanded = `${labelPrefix}_commanded`;
		const commandDuration = Math.max(duration, 1 / Math.max(1, fps));
		filterSteps.push(
			`[${current}]sendcmd=c='0-${commandDuration} ${commands.join(",")}'[${commanded}]`
		);
		current = commanded;
	}

	const keyed = `${labelPrefix}_keyed`;
	const staticSimilarity =
		chromaKey.similarity + (1 - chromaKey.similarity) * chromaKey.shadow * 0.35;
	filterSteps.push(
		`[${current}]chromakey@${chromaFilterName}=` +
			`color=${ffmpegColor({ color: chromaKey.color })}:` +
			`similarity=${staticSimilarity}:blend=${chromaKey.blend}[${keyed}]`
	);
	current = keyed;

	const cleanupAnimated = hasKeyframes({ chromaKey, property: "cleanup" });
	if (chromaKey.cleanup > 0 || cleanupAnimated) {
		const color = `${labelPrefix}_cleanup_color`;
		const alphaSource = `${labelPrefix}_cleanup_alpha_source`;
		let alpha = `${labelPrefix}_cleanup_alpha_0`;
		filterSteps.push(`[${current}]split=2[${color}][${alphaSource}]`);
		filterSteps.push(`[${alphaSource}]alphaextract[${alpha}]`);
		const cleanupExpression = propertyExpression({
			chromaKey,
			property: "cleanup",
			fps,
			timeVariable: "t",
		});
		for (let pass = 1; pass <= 4; pass += 1) {
			const nextAlpha = `${labelPrefix}_cleanup_alpha_${pass}`;
			filterSteps.push(
				`[${alpha}]erosion=coordinates=255:threshold0=255:` +
					`enable='gte(${cleanupExpression},${pass / 4})'[${nextAlpha}]`
			);
			alpha = nextAlpha;
		}
		const cleaned = `${labelPrefix}_cleaned`;
		filterSteps.push(`[${color}][${alpha}]alphamerge[${cleaned}]`);
		current = cleaned;
	}

	if (chromaKey.spill > 0 || spillAnimated) {
		const despilled = `${labelPrefix}_despilled`;
		filterSteps.push(
			`[${current}]despill@${despillFilterName}=` +
				`type=${screenType({ color: chromaKey.color })}:` +
				`mix=${chromaKey.spill}:expand=0.15[${despilled}]`
		);
		current = despilled;
	}

	return { filterSteps, outputLabel: current };
}
