import type { VideoColorCurveShapeKeyframe } from "./color-settings";
import { buildColorKeyframeExpression } from "./color-keyframe-filter";
import type { VideoVisual } from "./types";

export interface ColorShapeFilterGraph {
	filterSteps: string[];
	outputLabel: string;
}

function easingExpression({
	progress,
	easing,
}: {
	progress: string;
	easing: VideoColorCurveShapeKeyframe["easing"];
}): string {
	if (easing === "easeIn") return `(${progress})*(${progress})`;
	if (easing === "easeOut") return `1-(1-(${progress}))*(1-(${progress}))`;
	if (easing === "easeInOut") {
		return `(${progress})*(${progress})*(3-2*(${progress}))`;
	}
	if (easing === "spring") {
		return `${progress}+sin(${progress}*PI)*0.15*(1-${progress})`;
	}
	return progress;
}

export function buildColorShapeFilterGraph({
	visual,
	inputLabel,
	labelPrefix,
	stage,
	frames,
	mixProperty,
	mixFallback,
	filterAtFrame,
	easingAtFrame,
}: {
	visual: VideoVisual;
	inputLabel: string;
	labelPrefix: string;
	stage: string;
	frames: number[];
	mixProperty: string;
	mixFallback: number;
	filterAtFrame: (frame: number) => string | undefined;
	easingAtFrame: (frame: number) => VideoColorCurveShapeKeyframe["easing"];
}): ColorShapeFilterGraph {
	if (frames.length === 0) {
		return { filterSteps: [], outputLabel: inputLabel };
	}
	const prefix = `${labelPrefix}_${stage}_shape`;
	const fps = Math.max(1, visual.keyframeFps || 30);
	const amount = buildColorKeyframeExpression({
		visual,
		property: mixProperty,
		fallback: mixFallback,
		timeVariable: "T",
	});
	const mix = `clip((${amount})/100,0,1)`;
	if (frames.length === 1) {
		const base = `${prefix}_base`;
		const input = `${prefix}_input`;
		const graded = `${prefix}_graded`;
		const output = `${prefix}_output`;
		return {
			filterSteps: [
				`[${inputLabel}]split=2[${base}][${input}]`,
				`[${input}]${filterAtFrame(frames[0]) ?? "null"}[${graded}]`,
				`[${base}][${graded}]blend=all_expr='A*(1-(${mix}))+B*(${mix})':shortest=1[${output}]`,
			],
			outputLabel: output,
		};
	}
	const branchCount = 1 + (frames.length - 1) * 2;
	const base = `${prefix}_base`;
	const branches = Array.from(
		{ length: branchCount - 1 },
		(_, index) => `${prefix}_branch_${index}`
	);
	const filterSteps = [
		`[${inputLabel}]split=${branchCount}[${base}]${branches.map((label) => `[${label}]`).join("")}`,
	];
	const intervalOutputs: string[] = [];
	for (let index = 0; index < frames.length - 1; index += 1) {
		const fromFrame = frames[index];
		const toFrame = frames[index + 1];
		const fromGraded = `${prefix}_from_${index}`;
		const toGraded = `${prefix}_to_${index}`;
		const interval = `${prefix}_interval_${index}`;
		filterSteps.push(
			`[${branches[index * 2]}]${filterAtFrame(fromFrame) ?? "null"}[${fromGraded}]`,
			`[${branches[index * 2 + 1]}]${filterAtFrame(toFrame) ?? "null"}[${toGraded}]`
		);
		const rawProgress = `clip((T-${fromFrame / fps})/${Math.max(0.001, (toFrame - fromFrame) / fps)},0,1)`;
		const progress = easingExpression({
			progress: rawProgress,
			easing: easingAtFrame(toFrame),
		});
		filterSteps.push(
			`[${fromGraded}][${toGraded}]blend=all_expr='A*(1-(${progress}))+B*(${progress})':shortest=1[${interval}]`
		);
		intervalOutputs.push(interval);
	}
	let shapeOutput = intervalOutputs[0];
	for (let index = 1; index < intervalOutputs.length; index += 1) {
		const combined = `${prefix}_combined_${index}`;
		const start = frames[index] / fps;
		filterSteps.push(
			`[${shapeOutput}][${intervalOutputs[index]}]blend=all_expr='if(gte(T,${start}),B,A)':shortest=1[${combined}]`
		);
		shapeOutput = combined;
	}
	const output = `${prefix}_output`;
	filterSteps.push(
		`[${base}][${shapeOutput}]blend=all_expr='A*(1-(${mix}))+B*(${mix})':shortest=1[${output}]`
	);
	return { filterSteps, outputLabel: output };
}
