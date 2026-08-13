import type { ColorMultiPassOperation } from "@/types/timeline";
import {
	clampNumber,
	mixNumber,
	resolveEdgeCoordinate,
	sampleRgbaChannel,
	type MultiPassEdgeMode,
} from "./multi-pass-spatial-utils";

export type ColorLongTailMultiPassOperation = Extract<
	ColorMultiPassOperation,
	{
		kind:
			| "grain-noise"
			| "light-leak"
			| "bloom"
			| "chromatic-aberration"
			| "lens-distortion";
	}
>;

function noiseAt({ x, y, seed }: { x: number; y: number; seed: number }) {
	const value =
		Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 37.719) * 43758.5453;
	return (value - Math.floor(value)) * 2 - 1;
}

function applyGrain({
	data,
	width,
	height,
	pass,
	overall,
	frameSeed,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorLongTailMultiPassOperation, { kind: "grain-noise" }>;
	overall: number;
	frameSeed: number;
}) {
	const output = new Uint8ClampedArray(data);
	const amount =
		clampNumber({ value: pass.amount / 100, min: 0, max: 1 }) * overall * 32;
	const size = Math.max(1, Math.round(pass.size));
	const temporalSeed = pass.timeVarying ? frameSeed * 9973 : 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const noise =
				noiseAt({
					x: Math.floor(x / size),
					y: Math.floor(y / size),
					seed: pass.seed + temporalSeed,
				}) * amount;
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				output[index + channel] = data[index + channel] + noise;
			}
		}
	}
	return output;
}

function applyLightLeak({
	data,
	width,
	height,
	pass,
	overall,
	timestampSeconds,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorLongTailMultiPassOperation, { kind: "light-leak" }>;
	overall: number;
	timestampSeconds: number;
}) {
	const output = new Uint8ClampedArray(data);
	const phase = pass.timeVarying
		? timestampSeconds * pass.speed * Math.PI * 2
		: 0;
	const centerX = pass.centerX + Math.sin(phase) * 0.08;
	const centerY = pass.centerY + Math.cos(phase * 0.73) * 0.05;
	const radius = Math.max(0.01, pass.radius);
	const strength =
		clampNumber({ value: pass.amount / 100, min: 0, max: 1 }) * overall;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const normalizedX = x / Math.max(1, width - 1);
			const normalizedY = y / Math.max(1, height - 1);
			const distanceSquared =
				(normalizedX - centerX) ** 2 + (normalizedY - centerY) ** 2;
			const alpha =
				Math.exp(-distanceSquared / (2 * radius * radius)) * strength;
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				const leak =
					clampNumber({ value: pass.color[channel], min: 0, max: 1 }) * alpha;
				output[index + channel] =
					255 - (255 - data[index + channel]) * (1 - leak);
			}
		}
	}
	return output;
}

function quantizeFloat16({ value }: { value: number }) {
	if (!Number.isFinite(value) || value === 0) return value;
	const exponent = Math.floor(Math.log2(Math.abs(value)));
	const step = 2 ** (exponent - 10);
	return Math.round(value / step) * step;
}

function quantizeIntermediate({
	value,
	pixelFormat,
}: {
	value: number;
	pixelFormat: "rgba8" | "float16" | "float32";
}) {
	if (pixelFormat === "rgba8") {
		return Math.round(clampNumber({ value, min: 0, max: 1 }) * 255) / 255;
	}
	if (pixelFormat === "float16") return quantizeFloat16({ value });
	return Math.fround(value);
}

function blurFloat({
	data,
	width,
	height,
	radius,
	edgeMode,
	pixelFormat,
}: {
	data: Float32Array;
	width: number;
	height: number;
	radius: number;
	edgeMode: MultiPassEdgeMode;
	pixelFormat: "rgba8" | "float16" | "float32";
}) {
	const sample = ({
		source,
		x,
		y,
		channel,
	}: {
		source: Float32Array;
		x: number;
		y: number;
		channel: number;
	}) => {
		const resolvedX = Math.round(
			resolveEdgeCoordinate({ value: x, size: width, edgeMode })
		);
		const resolvedY = Math.round(
			resolveEdgeCoordinate({ value: y, size: height, edgeMode })
		);
		return source[(resolvedY * width + resolvedX) * 4 + channel];
	};
	const horizontal = new Float32Array(data.length);
	const vertical = new Float32Array(data.length);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				let sum = 0;
				for (let offset = -radius; offset <= radius; offset += 1) {
					sum += sample({ source: data, x: x + offset, y, channel });
				}
				horizontal[index + channel] = quantizeIntermediate({
					value: sum / (radius * 2 + 1),
					pixelFormat,
				});
			}
			horizontal[index + 3] = 1;
		}
	}
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				let sum = 0;
				for (let offset = -radius; offset <= radius; offset += 1) {
					sum += sample({
						source: horizontal,
						x,
						y: y + offset,
						channel,
					});
				}
				vertical[index + channel] = quantizeIntermediate({
					value: sum / (radius * 2 + 1),
					pixelFormat,
				});
			}
			vertical[index + 3] = 1;
		}
	}
	return vertical;
}

function applyBloom({
	data,
	width,
	height,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorLongTailMultiPassOperation, { kind: "bloom" }>;
	overall: number;
}) {
	const threshold = clampNumber({ value: pass.threshold, min: 0, max: 0.99 });
	const bright = new Float32Array(data.length);
	for (let index = 0; index < data.length; index += 4) {
		const luminance =
			(data[index] * 0.2126 +
				data[index + 1] * 0.7152 +
				data[index + 2] * 0.0722) /
			255;
		const weight = clampNumber({
			value: (luminance - threshold) / (1 - threshold),
			min: 0,
			max: 1,
		});
		for (let channel = 0; channel < 3; channel += 1) {
			bright[index + channel] = (data[index + channel] / 255) * weight;
		}
		bright[index + 3] = 1;
	}
	const pixelFormat = pass.pixelFormat ?? "rgba8";
	const edgeMode = pass.edgeMode ?? "clamp";
	const levels = Math.round(
		clampNumber({ value: pass.mipLevels ?? 1, min: 1, max: 5 })
	);
	const accumulated = new Float32Array(data.length);
	for (let level = 0; level < levels; level += 1) {
		const blurred = blurFloat({
			data: bright,
			width,
			height,
			radius: Math.max(1, Math.round(pass.radius * 2 ** level)),
			edgeMode,
			pixelFormat,
		});
		for (let index = 0; index < accumulated.length; index += 1) {
			accumulated[index] += blurred[index] / levels;
		}
	}
	const output = new Uint8ClampedArray(data);
	const amount =
		clampNumber({ value: pass.amount / 100, min: 0, max: 2 }) * overall;
	for (let index = 0; index < data.length; index += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			const source = data[index + channel] / 255;
			const glow = clampNumber({
				value: accumulated[index + channel] * amount,
				min: 0,
				max: 1,
			});
			output[index + channel] = (1 - (1 - source) * (1 - glow)) * 255;
		}
	}
	return output;
}

function applyChromaticAberration({
	data,
	width,
	height,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<
		ColorLongTailMultiPassOperation,
		{ kind: "chromatic-aberration" }
	>;
	overall: number;
}) {
	const output = new Uint8ClampedArray(data);
	const radians = (pass.angle * Math.PI) / 180;
	const offsetX = Math.cos(radians) * pass.offset * overall;
	const offsetY = Math.sin(radians) * pass.offset * overall;
	const edgeMode = pass.edgeMode ?? "clamp";
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			output[index] = sampleRgbaChannel({
				data,
				width,
				height,
				x: x + offsetX,
				y: y + offsetY,
				channel: 0,
				edgeMode,
			});
			output[index + 2] = sampleRgbaChannel({
				data,
				width,
				height,
				x: x - offsetX,
				y: y - offsetY,
				channel: 2,
				edgeMode,
			});
		}
	}
	return output;
}

function applyLensDistortion({
	data,
	width,
	height,
	pass,
	overall,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	pass: Extract<ColorLongTailMultiPassOperation, { kind: "lens-distortion" }>;
	overall: number;
}) {
	const output = new Uint8ClampedArray(data.length);
	const edgeMode = pass.edgeMode ?? "clamp";
	const distortion = clampNumber({
		value: pass.distortion * overall,
		min: -1,
		max: 1,
	});
	const aspect = width / Math.max(1, height);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const normalizedX = x / Math.max(1, width - 1);
			const normalizedY = y / Math.max(1, height - 1);
			const deltaX = (normalizedX - pass.centerX) * aspect;
			const deltaY = normalizedY - pass.centerY;
			const factor = 1 + distortion * (deltaX * deltaX + deltaY * deltaY);
			const sourceX =
				(pass.centerX + (deltaX * factor) / aspect) * Math.max(1, width - 1);
			const sourceY =
				(pass.centerY + deltaY * factor) * Math.max(1, height - 1);
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				output[index + channel] = sampleRgbaChannel({
					data,
					width,
					height,
					x: sourceX,
					y: sourceY,
					channel,
					edgeMode,
				});
			}
		}
	}
	return output;
}

export function applyLongTailMultiPassOperation({
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
	pass: ColorLongTailMultiPassOperation;
	overall: number;
	frameSeed: number;
	timestampSeconds: number;
}) {
	if (pass.kind === "grain-noise") {
		return applyGrain({ data, width, height, pass, overall, frameSeed });
	}
	if (pass.kind === "light-leak") {
		return applyLightLeak({
			data,
			width,
			height,
			pass,
			overall,
			timestampSeconds,
		});
	}
	if (pass.kind === "bloom") {
		return applyBloom({ data, width, height, pass, overall });
	}
	if (pass.kind === "chromatic-aberration") {
		return applyChromaticAberration({ data, width, height, pass, overall });
	}
	return applyLensDistortion({ data, width, height, pass, overall });
}
