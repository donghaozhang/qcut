import type { VideoVisual } from "./types";
import {
	normalizeVideoColorSettings,
	type VideoColorSettings,
} from "./color-settings";
import {
	escapeFfmpegFilterPath,
	materializeVideoCubeLut,
} from "./color-lut-file";
import {
	buildColorKeyframeExpression,
	buildRuntimeColorFilter,
	hasColorKeyframes,
} from "./color-keyframe-filter";
import { buildColorManagementFilters } from "./color-management-filter";
import { materializeSecondaryColorLut } from "./secondary-color-lut";
import { buildSmartFilters } from "./color-smart-filter";

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

export function buildBasicFilters({
	visual,
	color,
	instancePrefix = "color",
}: {
	visual: VideoVisual;
	color: VideoColorSettings;
	instancePrefix?: string;
}): string[] {
	if (!color.basic.enabled) return [];
	const colorVisual = { ...visual, color };
	const values = color.basic;
	const value = (
		property: keyof Omit<typeof values, "enabled">,
		fallback: number
	) =>
		buildColorKeyframeExpression({
			visual: colorVisual,
			property: `basic.${property}`,
			fallback,
		});
	const smartCorrection =
		color.smart.enabled &&
		color.smart.status === "ready" &&
		hasColorKeyframes({ visual: colorVisual, property: "smart.intensity" })
			? color.smart.correction
			: undefined;
	const smartMix = smartCorrection
		? `clip((${buildColorKeyframeExpression({
				visual: colorVisual,
				property: "smart.intensity",
				fallback: color.smart.intensity,
			})})/100,0,1)`
		: "0";
	const smartValue = ({
		property,
		fallback,
		correction,
		enabled,
	}: {
		property: keyof Omit<typeof values, "enabled">;
		fallback: number;
		correction: number;
		enabled: boolean;
	}) =>
		`(${value(property, fallback)})+(${enabled ? correction : 0})*(${smartMix})`;
	const exposure = smartValue({
		property: "exposure",
		fallback: values.exposure,
		correction: smartCorrection?.exposure ?? 0,
		enabled: color.smart.autoTone,
	});
	const brightnessValue = value("brightness", values.brightness);
	const contrastValue = smartValue({
		property: "contrast",
		fallback: values.contrast,
		correction: smartCorrection?.contrast ?? 0,
		enabled: color.smart.autoTone,
	});
	const highlights = value("highlights", values.highlights);
	const shadows = value("shadows", values.shadows);
	const whites = value("whites", values.whites);
	const blacks = value("blacks", values.blacks);
	const temperature = smartValue({
		property: "temperature",
		fallback: values.temperature,
		correction: smartCorrection?.temperature ?? 0,
		enabled: color.smart.autoWhiteBalance,
	});
	const tint = smartValue({
		property: "tint",
		fallback: values.tint,
		correction: smartCorrection?.tint ?? 0,
		enabled: color.smart.autoWhiteBalance,
	});
	const saturationValue = smartValue({
		property: "saturation",
		fallback: values.saturation,
		correction: smartCorrection?.saturation ?? 0,
		enabled: color.smart.autoTone,
	});
	const fade = value("fade", values.fade);
	const vignette = value("vignette", values.vignette);
	const grain = value("grain", values.grain);
	const brightness =
		`clip((${brightnessValue})/100+(${shadows})/400+(${highlights})/600+` +
		`(${whites})/500+(${blacks})/500+clip((${fade})/100,0,1)*0.06,-1,1)`;
	const contrast =
		`clip(1+(${contrastValue})/100+(${whites})/500-(${blacks})/500-` +
		`clip((${fade})/100,0,1)*0.25,0,3)`;
	const saturation = `clip(1+(${saturationValue})/100-clip((${fade})/100,0,1)*0.15,0,3)`;
	const filters = [
		`eq=brightness='${brightness}':contrast='${contrast}':saturation='${saturation}':` +
			`gamma='clip(pow(2,(${exposure})/2),0.1,10)':` +
			`gamma_r='clip(1-(${temperature})/600-(${tint})/900,0.5,1.5)':` +
			`gamma_g='clip(1+(${tint})/450,0.5,1.5)':` +
			`gamma_b='clip(1+(${temperature})/600-(${tint})/900,0.5,1.5)':eval=frame`,
	];
	if (
		values.vibrance !== 0 ||
		hasColorKeyframes({ visual: colorVisual, property: "basic.vibrance" })
	) {
		const vibranceProperty = {
			property: "basic.vibrance",
			fallback: values.vibrance,
		};
		filters.push(
			buildRuntimeColorFilter({
				visual: colorVisual,
				filterName: "vibrance",
				instanceId: `${instancePrefix}_vibrance`,
				properties: [vibranceProperty],
				optionsAtFrame: ({ value: valueAtFrame }) => ({
					intensity: clamp({
						value: valueAtFrame(vibranceProperty) / 50,
						min: -2,
						max: 2,
					}),
				}),
			})
		);
	}
	if (
		values.sharpness > 0 &&
		!hasColorKeyframes({ visual: colorVisual, property: "basic.sharpness" })
	) {
		filters.push(
			`unsharp=5:5:${clamp({ value: values.sharpness / 50, min: 0, max: 2 })}`
		);
	}
	if (
		values.vignette > 0 ||
		hasColorKeyframes({ visual: colorVisual, property: "basic.vignette" })
	) {
		filters.push(
			`vignette=angle='PI/2-PI/3*clip((${vignette})/100,0,1)':eval=frame`
		);
	}
	if (
		values.grain > 0 ||
		hasColorKeyframes({ visual: colorVisual, property: "basic.grain" })
	) {
		filters.push(
			`geq=r='clip(r(X,Y)+(random(1)-0.5)*51*clip((${grain})/100,0,1),0,255)':` +
				`g='clip(g(X,Y)+(random(2)-0.5)*51*clip((${grain})/100,0,1),0,255)':` +
				`b='clip(b(X,Y)+(random(3)-0.5)*51*clip((${grain})/100,0,1),0,255)':a='alpha(X,Y)'`
		);
	}
	return filters;
}

export function buildLutFilter({
	color,
}: {
	color: VideoColorSettings;
}): string | undefined {
	if (!color.lut.enabled || !color.lut.cube) return;
	const filePath = materializeVideoCubeLut({
		name: color.lut.name,
		cube: color.lut.cube,
		dual: color.lut.dual,
		intensity: color.lut.intensity,
		skinProtection: color.lut.skinProtection,
	});
	return `lut3d=file='${escapeFfmpegFilterPath(filePath)}':interp=tetrahedral`;
}

const HSL_FLAGS: Record<string, string> = {
	red: "r",
	orange: "r+y",
	yellow: "y",
	green: "g",
	cyan: "c",
	blue: "b",
	purple: "b+m",
	magenta: "m",
};

export function buildHslFilters({
	visual,
	color,
	instancePrefix = "color",
}: {
	visual: VideoVisual;
	color: VideoColorSettings;
	instancePrefix?: string;
}): string[] {
	if (!color.hsl.enabled) return [];
	const colorVisual = { ...visual, color };
	const filters: string[] = [];
	for (const [range, values] of Object.entries(color.hsl.ranges)) {
		const properties = [
			{ property: `hsl.${range}.hue`, fallback: values.hue },
			{ property: `hsl.${range}.saturation`, fallback: values.saturation },
			{ property: `hsl.${range}.luminance`, fallback: values.luminance },
		];
		const animated = properties.some(({ property }) =>
			hasColorKeyframes({ visual: colorVisual, property })
		);
		if (
			!animated &&
			values.hue === 0 &&
			values.saturation === 0 &&
			values.luminance === 0
		) {
			continue;
		}
		filters.push(
			buildRuntimeColorFilter({
				visual: colorVisual,
				filterName: "huesaturation",
				instanceId: `${instancePrefix}_hsl_${range}`,
				properties,
				fixedOptions: { colors: HSL_FLAGS[range] ?? "a", strength: 1 },
				optionsAtFrame: ({ value }) => ({
					hue: clamp({
						value: value(properties[0]) * 1.8,
						min: -180,
						max: 180,
					}),
					saturation: clamp({
						value: value(properties[1]) / 100,
						min: -1,
						max: 1,
					}),
					intensity: clamp({
						value: value(properties[2]) / 100,
						min: -1,
						max: 1,
					}),
				}),
			})
		);
	}
	return filters;
}

function curvePoints({
	points,
	mix,
}: {
	points: VideoColorSettings["curves"]["master"];
	mix: number;
}): string {
	return [...points]
		.sort((left, right) => left.x - right.x)
		.map((point) => `${point.x}/${point.x + (point.y - point.x) * mix}`)
		.join(" ");
}

export function buildCurvesFilter({
	color,
	mix: mixOverride,
}: {
	color: VideoColorSettings;
	mix?: number;
}): string | undefined {
	if (!color.curves.enabled) return;
	const mix = clamp({
		value: mixOverride ?? color.curves.mix / 100,
		min: 0,
		max: 1,
	});
	return (
		`curves=master='${curvePoints({ points: color.curves.master, mix })}':` +
		`red='${curvePoints({ points: color.curves.red, mix })}':` +
		`green='${curvePoints({ points: color.curves.green, mix })}':` +
		`blue='${curvePoints({ points: color.curves.blue, mix })}':interp=pchip`
	);
}

export function buildSecondaryCurvesFilter({
	color,
	mix,
}: {
	color: VideoColorSettings;
	mix?: number;
}): string | undefined {
	if (!color.secondaryCurves.enabled) return;
	const filePath = materializeSecondaryColorLut({
		settings: color.secondaryCurves,
		mix: mix ?? color.secondaryCurves.mix,
	});
	return `lut3d=file='${escapeFfmpegFilterPath(filePath)}':interp=tetrahedral`;
}

function wheelOffset({
	x,
	y,
}: {
	x: number;
	y: number;
}): [number, number, number] {
	return [
		clamp({ value: x * 0.8 - y * 0.25, min: -1, max: 1 }),
		clamp({ value: -x * 0.45 - y * 0.25, min: -1, max: 1 }),
		clamp({ value: y * 0.8 - x * 0.15, min: -1, max: 1 }),
	];
}

function buildLiftGammaGainFilter({
	visual,
	color,
}: {
	visual: VideoVisual;
	color: VideoColorSettings;
}): string {
	const colorVisual = { ...visual, color };
	const time = `(N/${Math.max(1, visual.keyframeFps || 30)})`;
	const wheelValue = ({
		wheel,
		parameter,
	}: {
		wheel: "shadows" | "midtones" | "highlights";
		parameter: "x" | "y" | "luminance";
	}) =>
		buildColorKeyframeExpression({
			visual: colorVisual,
			property: `wheels.${wheel}.${parameter}`,
			fallback: color.wheels[wheel][parameter],
			timeVariable: time,
		});
	const offsets = (wheel: "shadows" | "midtones" | "highlights") => {
		const x = wheelValue({ wheel, parameter: "x" });
		const y = wheelValue({ wheel, parameter: "y" });
		return [
			`clip((${x})*0.8-(${y})*0.25,-1,1)`,
			`clip(-(${x})*0.45-(${y})*0.25,-1,1)`,
			`clip((${y})*0.8-(${x})*0.15,-1,1)`,
		];
	};
	const lift = offsets("shadows");
	const gamma = offsets("midtones");
	const gain = offsets("highlights");
	const strength = buildColorKeyframeExpression({
		visual: colorVisual,
		property: "wheels.strength",
		fallback: color.wheels.strength,
		timeVariable: time,
	});
	const offsetX = buildColorKeyframeExpression({
		visual: colorVisual,
		property: "wheels.offset.x",
		fallback: color.wheels.offset.x,
		timeVariable: time,
	});
	const offsetY = buildColorKeyframeExpression({
		visual: colorVisual,
		property: "wheels.offset.y",
		fallback: color.wheels.offset.y,
		timeVariable: time,
	});
	const offsetLuma = buildColorKeyframeExpression({
		visual: colorVisual,
		property: "wheels.offset.luminance",
		fallback: color.wheels.offset.luminance,
		timeVariable: time,
	});
	const offset = [
		`clip((${offsetX})*0.8-(${offsetY})*0.25,-1,1)`,
		`clip(-(${offsetX})*0.45-(${offsetY})*0.25,-1,1)`,
		`clip((${offsetY})*0.8-(${offsetX})*0.15,-1,1)`,
	];
	const liftLuma = wheelValue({ wheel: "shadows", parameter: "luminance" });
	const gammaLuma = wheelValue({ wheel: "midtones", parameter: "luminance" });
	const gainLuma = wheelValue({ wheel: "highlights", parameter: "luminance" });
	const channel = ({
		accessor,
		index,
	}: {
		accessor: "r" | "g" | "b";
		index: number;
	}) => {
		const lifted = `max(0,${accessor}(X,Y)/255+(${lift[index]})*0.35+(${liftLuma})/100*0.3)`;
		const gammaValue = `max(0.2,min(3,1+(${gamma[index]})*0.8+(${gammaLuma})/100*0.5))`;
		const gainValue = `max(0,1+(${gain[index]})*0.8+(${gainLuma})/100*0.5)`;
		const graded = `(pow(${lifted},1/(${gammaValue}))*(${gainValue}))`;
		const mixed = `${accessor}(X,Y)/255+(${strength})/100*((${graded})-${accessor}(X,Y)/255+(${offset[index]})+(${offsetLuma})/100*0.3)`;
		return `clip(255*(${mixed}),0,255)`;
	};
	return (
		`geq=r='${channel({ accessor: "r", index: 0 })}':` +
		`g='${channel({ accessor: "g", index: 1 })}':` +
		`b='${channel({ accessor: "b", index: 2 })}':a='alpha(X,Y)'`
	);
}

export function buildWheelFilters({
	visual,
	color,
	instancePrefix = "color",
}: {
	visual: VideoVisual;
	color: VideoColorSettings;
	instancePrefix?: string;
}): string[] {
	if (!color.wheels.enabled) return [];
	if (color.wheels.mode === "lift-gamma-gain") {
		return [buildLiftGammaGainFilter({ visual, color })];
	}
	const colorVisual = { ...visual, color };
	const filters: string[] = [];
	const definitions = [
		{ name: "shadows", suffix: "s", balanceDirection: 1 },
		{ name: "midtones", suffix: "m", balanceDirection: 0 },
		{ name: "highlights", suffix: "h", balanceDirection: -1 },
	] as const;
	for (const definition of definitions) {
		const wheel = color.wheels[definition.name];
		const properties = [
			{ property: `wheels.${definition.name}.x`, fallback: wheel.x },
			{ property: `wheels.${definition.name}.y`, fallback: wheel.y },
			{
				property: `wheels.${definition.name}.luminance`,
				fallback: wheel.luminance,
			},
			{ property: "wheels.offset.x", fallback: color.wheels.offset.x },
			{ property: "wheels.offset.y", fallback: color.wheels.offset.y },
			{
				property: "wheels.offset.luminance",
				fallback: color.wheels.offset.luminance,
			},
			{ property: "wheels.strength", fallback: color.wheels.strength },
			{ property: "wheels.balance", fallback: color.wheels.balance },
		];
		const animated = properties.some(({ property }) =>
			hasColorKeyframes({ visual: colorVisual, property })
		);
		const offsetChanged =
			color.wheels.offset.x !== 0 ||
			color.wheels.offset.y !== 0 ||
			color.wheels.offset.luminance !== 0;
		if (
			!animated &&
			wheel.x === 0 &&
			wheel.y === 0 &&
			wheel.luminance === 0 &&
			!offsetChanged
		) {
			continue;
		}
		filters.push(
			buildRuntimeColorFilter({
				visual: colorVisual,
				filterName: "colorbalance",
				instanceId: `${instancePrefix}_wheel_${definition.name}`,
				properties,
				fixedOptions: { pl: 1 },
				optionsAtFrame: ({ value }) => {
					const offset = wheelOffset({
						x: value(properties[0]),
						y: value(properties[1]),
					});
					const luminance = value(properties[2]) / 100;
					const globalOffset = wheelOffset({
						x: value(properties[3]),
						y: value(properties[4]),
					});
					const globalLuminance = value(properties[5]) / 100;
					const strength = value(properties[6]) / 100;
					const balance = value(properties[7]) / 100;
					const balanceScale = clamp({
						value: 1 + balance * definition.balanceDirection * 0.5,
						min: 0.5,
						max: 1.5,
					});
					const channel = (index: number) =>
						clamp({
							value:
								(offset[index] * balanceScale +
									globalOffset[index] +
									luminance * 0.3 +
									globalLuminance * 0.3) *
								strength,
							min: -1,
							max: 1,
						});
					return {
						[`r${definition.suffix}`]: channel(0),
						[`g${definition.suffix}`]: channel(1),
						[`b${definition.suffix}`]: channel(2),
					};
				},
			})
		);
	}
	return filters;
}

export function buildManagementFilters({
	color,
}: {
	color: VideoColorSettings;
}): { input: string[]; output: string[] } {
	return buildColorManagementFilters({ color });
}

export function buildVideoColorFilter({
	visual,
}: {
	visual: VideoVisual;
}): string {
	const color = normalizeVideoColorSettings({
		color: visual.color,
		adjustments: visual.adjustments,
	});
	if (!color.enabled) return "";
	const management = buildManagementFilters({ color });
	const filters = [
		...management.input,
		...buildSmartFilters({ visual, color }),
		...buildBasicFilters({ visual, color }),
		buildLutFilter({ color }),
		...buildHslFilters({ visual, color }),
		buildCurvesFilter({ color }),
		buildSecondaryCurvesFilter({ color }),
		...buildWheelFilters({ visual, color }),
		...management.output,
	].filter((filter): filter is string => Boolean(filter));
	return filters.join(",");
}
