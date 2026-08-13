import type {
	ColorMultiPassOperation,
	ColorMultiPassSettings,
} from "@/types/timeline";
import { clamp01, sampleCubeLut } from "./color-space-math";
import {
	applyLongTailMultiPassOperation,
	type ColorLongTailMultiPassOperation,
} from "./multi-pass-long-tail-operations";
import {
	boxBlurRgba,
	clampNumber as clamp,
	mixNumber as mix,
	resizeRgba,
} from "./multi-pass-spatial-utils";

function sharpen({
	data,
	width,
	height,
	amount,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	amount: number;
}) {
	if (amount <= 0 || width < 3 || height < 3) return data;
	const source = new Uint8ClampedArray(data);
	const result = new Uint8ClampedArray(data);
	for (let y = 1; y < height - 1; y += 1) {
		for (let x = 1; x < width - 1; x += 1) {
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				const average =
					(source[index - width * 4 + channel] +
						source[index + width * 4 + channel] +
						source[index - 4 + channel] +
						source[index + 4 + channel]) /
					4;
				result[index + channel] =
					source[index + channel] +
					(source[index + channel] - average) * amount;
			}
		}
	}
	return result;
}

function applyLut({
	data,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	pass: Extract<ColorMultiPassOperation, { kind: "lut" }>;
	overall: number;
}) {
	const output = new Uint8ClampedArray(data);
	const amount = clamp({
		value: (pass.intensity / 100) * overall,
		min: 0,
		max: 1,
	});
	for (let index = 0; index < data.length; index += 4) {
		const transformed = sampleCubeLut({
			cube: pass.cube,
			color: {
				r: data[index] / 255,
				g: data[index + 1] / 255,
				b: data[index + 2] / 255,
			},
		});
		output[index] = mix({
			left: data[index],
			right: clamp01(transformed.r) * 255,
			amount,
		});
		output[index + 1] = mix({
			left: data[index + 1],
			right: clamp01(transformed.g) * 255,
			amount,
		});
		output[index + 2] = mix({
			left: data[index + 2],
			right: clamp01(transformed.b) * 255,
			amount,
		});
	}
	return output;
}

function applyBilateralApproximation({
	data,
	width,
	height,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorMultiPassOperation, { kind: "bilateral-blur" }>;
	overall: number;
}) {
	const radius = Math.max(1, Math.round(pass.radius * overall));
	const blurred = boxBlurRgba({
		data,
		width,
		height,
		radius,
		edgeMode: pass.edgeMode,
	});
	const output = new Uint8ClampedArray(data);
	const threshold = Math.max(0.001, pass.threshold * 2.5);
	for (let index = 0; index < data.length; index += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			const difference = Math.abs(
				data[index + channel] - blurred[index + channel]
			);
			const edgeWeight = clamp({
				value: 1 - difference / threshold,
				min: 0,
				max: 1,
			});
			output[index + channel] = mix({
				left: data[index + channel],
				right: blurred[index + channel],
				amount: edgeWeight * overall,
			});
		}
	}
	return output;
}

function applyFog({
	data,
	width,
	height,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorMultiPassOperation, { kind: "fog-blend" }>;
	overall: number;
}) {
	const radius = Math.max(1, Math.round(pass.radius * overall));
	const blurred = boxBlurRgba({
		data,
		width,
		height,
		radius,
		edgeMode: pass.edgeMode,
	});
	const output = new Uint8ClampedArray(data);
	const amount = clamp({
		value: (pass.amount / 100) * overall,
		min: 0,
		max: 1,
	});
	for (let index = 0; index < data.length; index += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			output[index + channel] = mix({
				left: data[index + channel],
				right: blurred[index + channel],
				amount,
			});
		}
	}
	return output;
}

function applyVignette({
	data,
	width,
	height,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorMultiPassOperation, { kind: "vignette" }>;
	overall: number;
}) {
	const output = new Uint8ClampedArray(data);
	const amount = clamp({
		value: (pass.amount / 100) * overall,
		min: 0,
		max: 1,
	});
	const softness = clamp({ value: pass.softness / 100, min: 0, max: 1 });
	const start = 0.34 + softness * 0.2;
	const exponent = 1.1 + softness * 1.1;
	for (let pixel = 0; pixel < width * height; pixel += 1) {
		const x = (pixel % width) / Math.max(1, width - 1);
		const y = Math.floor(pixel / width) / Math.max(1, height - 1);
		const distance = Math.hypot((x - 0.5) * 1.15, y - 0.5) / 0.72;
		const alpha = clamp({
			value: Math.max(0, distance - start) ** exponent * amount * 1.4,
			min: 0,
			max: 0.96,
		});
		const index = pixel * 4;
		output[index] = data[index] * (1 - alpha);
		output[index + 1] = data[index + 1] * (1 - alpha);
		output[index + 2] = data[index + 2] * (1 - alpha);
	}
	return output;
}

function resolvePassIntensity({
	pass,
	settingsIntensity,
}: {
	pass: ColorMultiPassOperation;
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
		const span = Math.max(Number.EPSILON, rightInput - leftInput);
		return clamp({
			value: mix({
				left: leftOutput,
				right: rightOutput,
				amount: (settingsIntensity - leftInput) / span,
			}),
			min: 0,
			max: 1,
		});
	}
	return clamp({ value: points.at(-1)?.[1] ?? linear, min: 0, max: 1 });
}

function isLongTailOperation(
	pass: ColorMultiPassOperation
): pass is ColorLongTailMultiPassOperation {
	return (
		pass.kind === "grain-noise" ||
		pass.kind === "light-leak" ||
		pass.kind === "bloom" ||
		pass.kind === "chromatic-aberration" ||
		pass.kind === "lens-distortion"
	);
}

function applyOperation({
	data,
	width,
	height,
	pass,
	overall,
	frameSeed,
	timestampSeconds,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: ColorMultiPassOperation;
	overall: number;
	frameSeed: number;
	timestampSeconds: number;
}) {
	if (pass.kind === "sharpen") {
		return sharpen({
			data,
			width,
			height,
			amount: clamp({ value: pass.amount * overall, min: 0, max: 2 }),
		});
	}
	if (pass.kind === "bilateral-blur") {
		return applyBilateralApproximation({
			data,
			width,
			height,
			pass,
			overall,
		});
	}
	if (pass.kind === "fog-blend") {
		return applyFog({ data, width, height, pass, overall });
	}
	if (pass.kind === "vignette") {
		return applyVignette({ data, width, height, pass, overall });
	}
	if (isLongTailOperation(pass)) {
		return applyLongTailMultiPassOperation({
			data,
			width,
			height,
			pass,
			overall,
			frameSeed,
			timestampSeconds,
		});
	}
	return applyLut({ data, pass, overall });
}

function applyOperationAtScale({
	data,
	width,
	height,
	pass,
	overall,
	frameSeed,
	timestampSeconds,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: ColorMultiPassOperation;
	overall: number;
	frameSeed: number;
	timestampSeconds: number;
}) {
	const scale = pass.scale ?? 1;
	if (scale === 1) {
		return applyOperation({
			data,
			width,
			height,
			pass,
			overall,
			frameSeed,
			timestampSeconds,
		});
	}
	const scaledWidth = Math.max(1, Math.round(width * scale));
	const scaledHeight = Math.max(1, Math.round(height * scale));
	const scaled = resizeRgba({
		data,
		width,
		height,
		targetWidth: scaledWidth,
		targetHeight: scaledHeight,
		edgeMode: pass.edgeMode,
	});
	const rendered = applyOperation({
		data: scaled,
		width: scaledWidth,
		height: scaledHeight,
		pass,
		overall,
		frameSeed,
		timestampSeconds,
	});
	return resizeRgba({
		data: rendered,
		width: scaledWidth,
		height: scaledHeight,
		targetWidth: width,
		targetHeight: height,
		edgeMode: pass.edgeMode,
	});
}

export function applyColorMultiPass({
	data,
	width,
	height,
	settings,
	frameSeed = 0,
	timestampSeconds = frameSeed / 30,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	settings: ColorMultiPassSettings | undefined;
	frameSeed?: number;
	timestampSeconds?: number;
}): Uint8ClampedArray {
	if (!settings?.enabled || settings.intensity <= 0) return data;
	let output = data;
	for (const pass of settings.passes) {
		const overall = resolvePassIntensity({
			pass,
			settingsIntensity: settings.intensity,
		});
		if (overall <= 0) continue;
		output = applyOperationAtScale({
			data: output,
			width,
			height,
			pass,
			overall,
			frameSeed,
			timestampSeconds,
		});
	}
	return output;
}
