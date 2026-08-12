import type {
	VideoColorMultiPassOperation,
	VideoColorMultiPassSettings,
} from "./color-settings";
import {
	escapeFfmpegFilterPath,
	materializeVideoCubeLut,
} from "./color-lut-file";

export interface VideoColorMultiPassGraph {
	filterSteps: string[];
	outputLabel: string;
	applied: boolean;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function appendSingleInputFilter({
	filterSteps,
	inputLabel,
	outputLabel,
	filter,
}: {
	filterSteps: string[];
	inputLabel: string;
	outputLabel: string;
	filter: string;
}) {
	filterSteps.push(`[${inputLabel}]${filter}[${outputLabel}]`);
}

function buildLutPass({
	pass,
	settings,
	overall,
}: {
	pass: Extract<VideoColorMultiPassOperation, { kind: "lut" }>;
	settings: VideoColorMultiPassSettings;
	overall: number;
}) {
	const filePath = materializeVideoCubeLut({
		name: `${settings.name} multi-pass`,
		cube: pass.cube,
		intensity: clamp({ value: pass.intensity * overall, min: 0, max: 100 }),
		skinProtection: 0,
	});
	return `lut3d=file='${escapeFfmpegFilterPath(filePath)}':interp=tetrahedral`;
}

function vignetteAngle({
	amount,
	softness,
}: {
	amount: number;
	softness: number;
}) {
	const softnessFactor =
		0.75 + clamp({ value: softness, min: 0, max: 100 }) / 400;
	return clamp({
		value: Math.PI / 2 - (Math.PI / 3) * amount * softnessFactor,
		min: Math.PI / 20,
		max: Math.PI / 2,
	});
}

function resolvePassIntensity({
	pass,
	settingsIntensity,
}: {
	pass: VideoColorMultiPassOperation;
	settingsIntensity: number;
}) {
	const linear = clamp({ value: settingsIntensity / 100, min: 0, max: 1 });
	if (pass.intensityCurve?.kind !== "piecewise") return linear;
	const points = [...pass.intensityCurve.points].sort(
		([left], [right]) => left - right
	);
	if (points.length === 0) return linear;
	if (settingsIntensity <= points[0][0]) {
		return clamp({ value: points[0][1], min: 0, max: 1 });
	}
	for (let index = 1; index < points.length; index += 1) {
		const [rightInput, rightOutput] = points[index];
		const [leftInput, leftOutput] = points[index - 1];
		if (settingsIntensity > rightInput) continue;
		const progress =
			(settingsIntensity - leftInput) /
			Math.max(Number.EPSILON, rightInput - leftInput);
		return clamp({
			value: leftOutput + (rightOutput - leftOutput) * progress,
			min: 0,
			max: 1,
		});
	}
	return clamp({
		value: points[points.length - 1]?.[1] ?? linear,
		min: 0,
		max: 1,
	});
}

function buildBloomPass({
	filterSteps,
	inputLabel,
	pass,
	overall,
	nextLabel,
}: {
	filterSteps: string[];
	inputLabel: string;
	pass: Extract<VideoColorMultiPassOperation, { kind: "bloom" }>;
	overall: number;
	nextLabel: ({ name }: { name: string }) => string;
}) {
	const base = nextLabel({ name: "bloom_base" });
	const brightInput = nextLabel({ name: "bloom_input" });
	const bright = nextLabel({ name: "bloom_bright" });
	const threshold = Math.round(
		clamp({ value: pass.threshold, min: 0, max: 1 }) * 255
	);
	const scale = pass.scale ?? 1;
	const downscale =
		scale === 1 ? "" : `,scale=iw*${scale}:ih*${scale}:flags=bicubic`;
	const intermediateFormat =
		pass.pixelFormat === "float16" || pass.pixelFormat === "float32"
			? ",format=gbrpf32le"
			: ",format=rgba";
	filterSteps.push(`[${inputLabel}]split=2[${base}][${brightInput}]`);
	filterSteps.push(
		`[${brightInput}]lutrgb=r='if(gte(val\\,${threshold})\\,val\\,0)':` +
			`g='if(gte(val\\,${threshold})\\,val\\,0)':` +
			`b='if(gte(val\\,${threshold})\\,val\\,0)'${downscale}${intermediateFormat}[${bright}]`
	);

	const levels = Math.round(
		clamp({ value: pass.mipLevels ?? 1, min: 1, max: 4 })
	);
	const levelInputs = Array.from({ length: levels }, (_, index) =>
		nextLabel({ name: `bloom_level_input_${index}` })
	);
	if (levels > 1) {
		filterSteps.push(
			`[${bright}]split=${levels}${levelInputs.map((label) => `[${label}]`).join("")}`
		);
	} else {
		levelInputs[0] = bright;
	}
	const blurredLevels = levelInputs.map((label, index) => {
		const blurred = nextLabel({ name: `bloom_blur_${index}` });
		appendSingleInputFilter({
			filterSteps,
			inputLabel: label,
			outputLabel: blurred,
			filter: `gblur=sigma=${clamp({ value: pass.radius * 2 ** index, min: 0.1, max: 64 }).toFixed(4)}`,
		});
		return blurred;
	});
	let combined = blurredLevels[0];
	for (let index = 1; index < blurredLevels.length; index += 1) {
		const averaged = nextLabel({ name: `bloom_average_${index}` });
		filterSteps.push(
			`[${combined}][${blurredLevels[index]}]blend=all_expr='(A*${index}+B)/${index + 1}':shortest=1[${averaged}]`
		);
		combined = averaged;
	}
	const restored = nextLabel({ name: "bloom_restored" });
	const upscale =
		scale === 1
			? "format=rgba"
			: `scale=iw*${1 / scale}:ih*${1 / scale}:flags=bicubic,format=rgba`;
	appendSingleInputFilter({
		filterSteps,
		inputLabel: combined,
		outputLabel: restored,
		filter: upscale,
	});
	const output = nextLabel({ name: "bloom_screen" });
	const amount = clamp({
		value: (pass.amount / 100) * overall,
		min: 0,
		max: 1,
	});
	filterSteps.push(
		`[${base}][${restored}]blend=all_mode=screen:all_opacity=${amount.toFixed(6)}:shortest=1[${output}]`
	);
	return output;
}

function buildLightLeakFilter({
	pass,
	overall,
}: {
	pass: Extract<VideoColorMultiPassOperation, { kind: "light-leak" }>;
	overall: number;
}) {
	const strength = clamp({
		value: (pass.amount / 100) * overall,
		min: 0,
		max: 1,
	});
	const speed = pass.timeVarying ? pass.speed : 0;
	const centerX = `(${pass.centerX}+0.08*sin(T*${speed}*2*PI))`;
	const centerY = `(${pass.centerY}+0.05*cos(T*${speed}*1.46*PI))`;
	const radius = Math.max(0.01, pass.radius);
	const alpha =
		`${strength}*exp(-(((X/W-${centerX})*(X/W-${centerX})+` +
		`(Y/H-${centerY})*(Y/H-${centerY}))/(2*${radius}*${radius})))`;
	const channel = ({
		accessor,
		color,
	}: {
		accessor: "r" | "g" | "b";
		color: number;
	}) =>
		`255-(255-${accessor}(X\\,Y))*(1-${clamp({ value: color, min: 0, max: 1 })}*(${alpha}))`;
	return (
		`geq=r='${channel({ accessor: "r", color: pass.color[0] })}':` +
		`g='${channel({ accessor: "g", color: pass.color[1] })}':` +
		`b='${channel({ accessor: "b", color: pass.color[2] })}':a='alpha(X\\,Y)'`
	);
}

function buildGrainFilter({
	pass,
	overall,
}: {
	pass: Extract<VideoColorMultiPassOperation, { kind: "grain-noise" }>;
	overall: number;
}) {
	const size = Math.max(1, Math.round(pass.size));
	const temporalSeed = pass.timeVarying ? "+N*9973" : "";
	const hash =
		`sin((floor(X/${size})+1)*12.9898+(floor(Y/${size})+1)*78.233+` +
		`(${pass.seed}${temporalSeed})*37.719)*43758.5453`;
	const amount =
		clamp({ value: pass.amount / 100, min: 0, max: 1 }) * overall * 32;
	const noise = `(2*(${hash}-floor(${hash}))-1)*${amount.toFixed(6)}`;
	const channel = ({ accessor }: { accessor: "r" | "g" | "b" }) =>
		`clip(${accessor}(X\\,Y)+${noise}\\,0\\,255)`;
	return (
		`geq=r='${channel({ accessor: "r" })}':` +
		`g='${channel({ accessor: "g" })}':` +
		`b='${channel({ accessor: "b" })}':a='alpha(X\\,Y)'`
	);
}

function buildChromaticAberrationFilter({
	pass,
	overall,
}: {
	pass: Extract<VideoColorMultiPassOperation, { kind: "chromatic-aberration" }>;
	overall: number;
}) {
	const radians = (pass.angle * Math.PI) / 180;
	const offsetX = Math.cos(radians) * pass.offset * overall;
	const offsetY = Math.sin(radians) * pass.offset * overall;
	const sample = ({
		accessor,
		direction,
	}: {
		accessor: "r" | "b";
		direction: -1 | 1;
	}) =>
		`${accessor}(clip(X+${(offsetX * direction).toFixed(6)}\\,0\\,W-1)\\,` +
		`clip(Y+${(offsetY * direction).toFixed(6)}\\,0\\,H-1))`;
	return (
		`geq=r='${sample({ accessor: "r", direction: 1 })}':` +
		`g='g(X\\,Y)':b='${sample({ accessor: "b", direction: -1 })}':a='alpha(X\\,Y)'`
	);
}

export function buildVideoColorMultiPassGraph({
	settings,
	inputLabel,
	labelPrefix,
}: {
	settings: VideoColorMultiPassSettings | undefined;
	inputLabel: string;
	labelPrefix: string;
}): VideoColorMultiPassGraph {
	if (
		!settings?.enabled ||
		settings.intensity <= 0 ||
		settings.passes.length === 0
	) {
		return { filterSteps: [], outputLabel: inputLabel, applied: false };
	}
	const prefix = labelPrefix.replace(/[^a-zA-Z0-9_]/g, "_");
	const filterSteps: string[] = [];
	let current = inputLabel;
	let labelIndex = 0;
	const nextLabel = ({ name }: { name: string }) =>
		`${prefix}_multi_${name}_${labelIndex++}`;

	for (const pass of settings.passes) {
		const overall = resolvePassIntensity({
			pass,
			settingsIntensity: settings.intensity,
		});
		if (overall <= 0) continue;
		if (pass.kind === "fog-blend") {
			const base = nextLabel({ name: "fog_base" });
			const blurInput = nextLabel({ name: "fog_input" });
			const blurred = nextLabel({ name: "fog_blurred" });
			const output = nextLabel({ name: "fog_mix" });
			const radius = clamp({
				value: pass.radius * overall,
				min: 0.01,
				max: 20,
			});
			const amount = clamp({
				value: (pass.amount / 100) * overall,
				min: 0,
				max: 1,
			});
			filterSteps.push(`[${current}]split=2[${base}][${blurInput}]`);
			appendSingleInputFilter({
				filterSteps,
				inputLabel: blurInput,
				outputLabel: blurred,
				filter: `gblur=sigma=${radius.toFixed(4)}`,
			});
			filterSteps.push(
				`[${base}][${blurred}]blend=all_expr='A*(1-${amount.toFixed(6)})+B*${amount.toFixed(6)}':shortest=1[${output}]`
			);
			current = output;
			continue;
		}
		if (pass.kind === "bloom") {
			current = buildBloomPass({
				filterSteps,
				inputLabel: current,
				pass,
				overall,
				nextLabel,
			});
			continue;
		}

		const output = nextLabel({ name: pass.kind.replace(/-/g, "_") });
		if (pass.kind === "sharpen") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: `unsharp=5:5:${clamp({ value: pass.amount * overall, min: 0, max: 2 }).toFixed(4)}`,
			});
		} else if (pass.kind === "bilateral-blur") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter:
					`smartblur=luma_radius=${clamp({ value: pass.radius, min: 0.1, max: 5 }).toFixed(3)}:` +
					`luma_strength=${overall.toFixed(4)}:` +
					`luma_threshold=${Math.round(clamp({ value: pass.threshold, min: -30, max: 30 }))}`,
			});
		} else if (pass.kind === "vignette") {
			const amount = clamp({
				value: (pass.amount / 100) * overall,
				min: 0,
				max: 1,
			});
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: `vignette=angle=${vignetteAngle({ amount, softness: pass.softness }).toFixed(6)}:eval=frame`,
			});
		} else if (pass.kind === "grain-noise") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: buildGrainFilter({ pass, overall }),
			});
		} else if (pass.kind === "light-leak") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: buildLightLeakFilter({ pass, overall }),
			});
		} else if (pass.kind === "chromatic-aberration") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: buildChromaticAberrationFilter({ pass, overall }),
			});
		} else if (pass.kind === "lens-distortion") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter:
					`lenscorrection=cx=${clamp({ value: pass.centerX, min: 0, max: 1 }).toFixed(6)}:` +
					`cy=${clamp({ value: pass.centerY, min: 0, max: 1 }).toFixed(6)}:` +
					`k1=${clamp({ value: pass.distortion * overall, min: -1, max: 1 }).toFixed(6)}:k2=0:i=bilinear`,
			});
		} else {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: buildLutPass({ pass, settings, overall }),
			});
		}
		current = output;
	}

	return {
		filterSteps,
		outputLabel: current,
		applied: filterSteps.length > 0,
	};
}
