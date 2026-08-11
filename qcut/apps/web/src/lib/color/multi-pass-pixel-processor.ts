import type {
	ColorMultiPassOperation,
	ColorMultiPassSettings,
} from "@/types/timeline";
import { clamp01, sampleCubeLut } from "./color-space-math";

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

function mix({
	left,
	right,
	amount,
}: {
	left: number;
	right: number;
	amount: number;
}) {
	return left + (right - left) * amount;
}

function blurHorizontal({
	data,
	width,
	height,
	radius,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	radius: number;
}) {
	const result = new Uint8ClampedArray(data);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const destination = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				let sum = 0;
				for (let offset = -radius; offset <= radius; offset += 1) {
					const sourceX = clamp({ value: x + offset, min: 0, max: width - 1 });
					sum += data[(y * width + sourceX) * 4 + channel];
				}
				result[destination + channel] = sum / (radius * 2 + 1);
			}
		}
	}
	return result;
}

function boxBlur({
	data,
	width,
	height,
	radius,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	radius: number;
}) {
	if (radius <= 0 || width < 2 || height < 2) return data;
	const horizontal = blurHorizontal({ data, width, height, radius });
	const result = new Uint8ClampedArray(horizontal);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const destination = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				let sum = 0;
				for (let offset = -radius; offset <= radius; offset += 1) {
					const sourceY = clamp({ value: y + offset, min: 0, max: height - 1 });
					sum += horizontal[(sourceY * width + x) * 4 + channel];
				}
				result[destination + channel] = sum / (radius * 2 + 1);
			}
		}
	}
	return result;
}

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
	const blurred = boxBlur({ data, width, height, radius });
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
	const blurred = boxBlur({ data, width, height, radius });
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

export function applyColorMultiPass({
	data,
	width,
	height,
	settings,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	settings: ColorMultiPassSettings | undefined;
}): Uint8ClampedArray {
	if (!settings?.enabled || settings.intensity <= 0) return data;
	const overall = clamp({ value: settings.intensity / 100, min: 0, max: 1 });
	let output = data;
	for (const pass of settings.passes) {
		if (pass.kind === "sharpen") {
			output = sharpen({
				data: output,
				width,
				height,
				amount: clamp({ value: pass.amount * overall, min: 0, max: 2 }),
			});
		} else if (pass.kind === "bilateral-blur") {
			output = applyBilateralApproximation({
				data: output,
				width,
				height,
				pass,
				overall,
			});
		} else if (pass.kind === "fog-blend") {
			output = applyFog({ data: output, width, height, pass, overall });
		} else if (pass.kind === "vignette") {
			output = applyVignette({ data: output, width, height, pass, overall });
		} else {
			output = applyLut({ data: output, pass, overall });
		}
	}
	return output;
}
