import type { VideoVisual } from "./types";
import { normalizeVideoColorSettings } from "./color-settings";
import {
	escapeFfmpegFilterPath,
	materializeVideoCubeLut,
} from "./color-lut-file";
import {
	buildBasicFilters,
	buildCurvesFilter,
	buildHslFilters,
	buildLutFilter,
	buildManagementFilters,
	buildSecondaryCurvesFilter,
	buildWheelFilters,
} from "./color-filter";
import {
	buildColorKeyframeExpression,
	hasColorKeyframes,
} from "./color-keyframe-filter";
import {
	curveShapeEasingAtFrame,
	curveShapeFrames,
	resolveVideoCurveShapes,
} from "./color-curve-shape";
import { buildColorShapeFilterGraph } from "./color-shape-keyframe-graph";
import { buildSmartFilters } from "./color-smart-filter";

export interface VideoColorFilterGraph {
	filterSteps: string[];
	outputLabel: string;
	applied: boolean;
}

function blendExpression({ amount }: { amount: string }): string {
	const mix = `clip((${amount})/100,0,1)`;
	return `A*(1-(${mix}))+B*(${mix})`;
}

export function buildVideoColorFilterGraph({
	visual,
	inputLabel,
	labelPrefix,
}: {
	visual: VideoVisual;
	inputLabel: string;
	labelPrefix: string;
}): VideoColorFilterGraph {
	const color = normalizeVideoColorSettings({
		color: visual.color,
		adjustments: visual.adjustments,
	});
	if (!color.enabled) {
		return { filterSteps: [], outputLabel: inputLabel, applied: false };
	}
	const prefix = labelPrefix.replace(/[^a-zA-Z0-9_]/g, "_");
	const colorVisual = { ...visual, color };
	const filterSteps: string[] = [];
	let current = inputLabel;
	let labelIndex = 0;
	const nextLabel = (name: string) => `${prefix}_${name}_${labelIndex++}`;
	const append = ({ filters, name }: { filters: string[]; name: string }) => {
		if (filters.length === 0) return;
		const output = nextLabel(name);
		filterSteps.push(`[${current}]${filters.join(",")}[${output}]`);
		current = output;
	};
	const management = buildManagementFilters({ color });
	append({ filters: management.input, name: "management_in" });
	append({
		filters: buildSmartFilters({ visual: colorVisual, color }),
		name: "smart",
	});
	append({
		filters: buildBasicFilters({
			visual: colorVisual,
			color,
			instancePrefix: prefix,
		}),
		name: "basic",
	});

	if (
		color.basic.enabled &&
		hasColorKeyframes({ visual: colorVisual, property: "basic.sharpness" })
	) {
		const base = nextLabel("sharp_base");
		const input = nextLabel("sharp_input");
		const sharpened = nextLabel("sharpened");
		const output = nextLabel("sharp_mix");
		const amount = buildColorKeyframeExpression({
			visual: colorVisual,
			property: "basic.sharpness",
			fallback: color.basic.sharpness,
			timeVariable: "T",
		});
		filterSteps.push(`[${current}]split=2[${base}][${input}]`);
		filterSteps.push(`[${input}]unsharp=5:5:2[${sharpened}]`);
		filterSteps.push(
			`[${base}][${sharpened}]blend=all_expr='${blendExpression({ amount })}':shortest=1[${output}]`
		);
		current = output;
	}

	if (color.lut.enabled && color.lut.cube) {
		const intensityAnimated = hasColorKeyframes({
			visual: colorVisual,
			property: "lut.intensity",
		});
		const skinAnimated = hasColorKeyframes({
			visual: colorVisual,
			property: "lut.skinProtection",
		});
		if (!intensityAnimated && !skinAnimated) {
			const lut = buildLutFilter({ color });
			append({ filters: lut ? [lut] : [], name: "lut" });
		} else {
			const base = nextLabel("lut_base");
			const unprotectedInput = nextLabel("lut_unprotected_input");
			const protectedInput = nextLabel("lut_protected_input");
			const unprotected = nextLabel("lut_unprotected");
			const protectedGrade = nextLabel("lut_protected");
			const protectionMix = nextLabel("lut_protection_mix");
			const output = nextLabel("lut_intensity_mix");
			const rawPath = materializeVideoCubeLut({
				name: color.lut.name,
				cube: color.lut.cube,
				intensity: 100,
				skinProtection: 0,
			});
			const protectedPath = materializeVideoCubeLut({
				name: color.lut.name,
				cube: color.lut.cube,
				intensity: 100,
				skinProtection: skinAnimated ? 100 : color.lut.skinProtection,
			});
			filterSteps.push(
				`[${current}]split=3[${base}][${unprotectedInput}][${protectedInput}]`
			);
			filterSteps.push(
				`[${unprotectedInput}]lut3d=file='${escapeFfmpegFilterPath(rawPath)}':interp=tetrahedral[${unprotected}]`
			);
			filterSteps.push(
				`[${protectedInput}]lut3d=file='${escapeFfmpegFilterPath(protectedPath)}':interp=tetrahedral[${protectedGrade}]`
			);
			const protection = skinAnimated
				? buildColorKeyframeExpression({
						visual: colorVisual,
						property: "lut.skinProtection",
						fallback: color.lut.skinProtection,
						timeVariable: "T",
					})
				: "100";
			filterSteps.push(
				`[${unprotected}][${protectedGrade}]blend=all_expr='${blendExpression({ amount: protection })}':shortest=1[${protectionMix}]`
			);
			const intensity = buildColorKeyframeExpression({
				visual: colorVisual,
				property: "lut.intensity",
				fallback: color.lut.intensity,
				timeVariable: "T",
			});
			filterSteps.push(
				`[${base}][${protectionMix}]blend=all_expr='${blendExpression({ amount: intensity })}':shortest=1[${output}]`
			);
			current = output;
		}
	}

	append({
		filters: buildHslFilters({
			visual: colorVisual,
			color,
			instancePrefix: prefix,
		}),
		name: "hsl",
	});

	if (color.curves.enabled) {
		const shapeFrames = curveShapeFrames({ color, prefix: "curves." });
		if (shapeFrames.length > 0) {
			const shapeGraph = buildColorShapeFilterGraph({
				visual: colorVisual,
				inputLabel: current,
				labelPrefix: prefix,
				stage: "curves",
				frames: shapeFrames,
				mixProperty: "curves.mix",
				mixFallback: color.curves.mix,
				filterAtFrame: (frame) =>
					buildCurvesFilter({
						color: resolveVideoCurveShapes({ color, frame }),
						mix: 1,
					}),
				easingAtFrame: (frame) =>
					curveShapeEasingAtFrame({ color, prefix: "curves.", frame }),
			});
			filterSteps.push(...shapeGraph.filterSteps);
			current = shapeGraph.outputLabel;
		} else {
			const mixAnimated = hasColorKeyframes({
				visual: colorVisual,
				property: "curves.mix",
			});
			if (!mixAnimated && color.curves.mix >= 100) {
				const curves = buildCurvesFilter({ color, mix: 1 });
				append({ filters: curves ? [curves] : [], name: "curves" });
			} else if (mixAnimated || color.curves.mix > 0) {
				const base = nextLabel("curves_base");
				const input = nextLabel("curves_input");
				const curved = nextLabel("curved");
				const output = nextLabel("curves_mix");
				const curves = buildCurvesFilter({ color, mix: 1 });
				if (curves) {
					filterSteps.push(`[${current}]split=2[${base}][${input}]`);
					filterSteps.push(`[${input}]${curves}[${curved}]`);
					const amount = buildColorKeyframeExpression({
						visual: colorVisual,
						property: "curves.mix",
						fallback: color.curves.mix,
						timeVariable: "T",
					});
					filterSteps.push(
						`[${base}][${curved}]blend=all_expr='${blendExpression({ amount })}':shortest=1[${output}]`
					);
					current = output;
				}
			}
		}
	}

	if (color.secondaryCurves.enabled) {
		const shapeFrames = curveShapeFrames({
			color,
			prefix: "secondaryCurves.",
		});
		if (shapeFrames.length > 0) {
			const shapeGraph = buildColorShapeFilterGraph({
				visual: colorVisual,
				inputLabel: current,
				labelPrefix: prefix,
				stage: "secondary_curves",
				frames: shapeFrames,
				mixProperty: "secondaryCurves.mix",
				mixFallback: color.secondaryCurves.mix,
				filterAtFrame: (frame) =>
					buildSecondaryCurvesFilter({
						color: resolveVideoCurveShapes({ color, frame }),
						mix: 100,
					}),
				easingAtFrame: (frame) =>
					curveShapeEasingAtFrame({
						color,
						prefix: "secondaryCurves.",
						frame,
					}),
			});
			filterSteps.push(...shapeGraph.filterSteps);
			current = shapeGraph.outputLabel;
		} else {
			const mixAnimated = hasColorKeyframes({
				visual: colorVisual,
				property: "secondaryCurves.mix",
			});
			if (!mixAnimated && color.secondaryCurves.mix >= 100) {
				const secondaryCurves = buildSecondaryCurvesFilter({ color, mix: 100 });
				append({
					filters: secondaryCurves ? [secondaryCurves] : [],
					name: "secondary_curves",
				});
			} else if (mixAnimated || color.secondaryCurves.mix > 0) {
				const base = nextLabel("secondary_curves_base");
				const input = nextLabel("secondary_curves_input");
				const graded = nextLabel("secondary_curves_graded");
				const output = nextLabel("secondary_curves_mix");
				const secondaryCurves = buildSecondaryCurvesFilter({ color, mix: 100 });
				if (secondaryCurves) {
					filterSteps.push(`[${current}]split=2[${base}][${input}]`);
					filterSteps.push(`[${input}]${secondaryCurves}[${graded}]`);
					const amount = buildColorKeyframeExpression({
						visual: colorVisual,
						property: "secondaryCurves.mix",
						fallback: color.secondaryCurves.mix,
						timeVariable: "T",
					});
					filterSteps.push(
						`[${base}][${graded}]blend=all_expr='${blendExpression({ amount })}':shortest=1[${output}]`
					);
					current = output;
				}
			}
		}
	}

	append({
		filters: buildWheelFilters({
			visual: colorVisual,
			color,
			instancePrefix: prefix,
		}),
		name: "wheels",
	});
	append({ filters: management.output, name: "management_out" });
	return {
		filterSteps,
		outputLabel: current,
		applied: filterSteps.length > 0,
	};
}
