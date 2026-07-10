export interface PersonCutoutMaskOptions {
	threshold: number;
	temporalSmoothing: number;
	edgeShift: number;
	feather: number;
}

export interface ProcessedPersonMask {
	alpha: Float32Array;
	temporalState: Float32Array;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value >= edge1 ? 1 : 0;
	const normalized = clamp01((value - edge0) / (edge1 - edge0));
	return normalized * normalized * (3 - 2 * normalized);
}

export function applyTemporalSmoothing({
	current,
	previous,
	amount,
}: {
	current: Float32Array;
	previous?: Float32Array;
	amount: number;
}): Float32Array {
	const smoothing = clamp01(amount);
	if (!previous || previous.length !== current.length || smoothing === 0) {
		return current.slice();
	}

	const result = new Float32Array(current.length);
	for (let index = 0; index < current.length; index += 1) {
		result[index] =
			previous[index] * smoothing + current[index] * (1 - smoothing);
	}
	return result;
}

function horizontalMorphology({
	input,
	width,
	height,
	radius,
	dilate,
}: {
	input: Float32Array;
	width: number;
	height: number;
	radius: number;
	dilate: boolean;
}): Float32Array {
	const output = new Float32Array(input.length);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let value = dilate ? 0 : 1;
			for (
				let sampleX = Math.max(0, x - radius);
				sampleX <= Math.min(width - 1, x + radius);
				sampleX += 1
			) {
				const sample = input[y * width + sampleX];
				value = dilate ? Math.max(value, sample) : Math.min(value, sample);
			}
			output[y * width + x] = value;
		}
	}
	return output;
}

function verticalMorphology({
	input,
	width,
	height,
	radius,
	dilate,
}: {
	input: Float32Array;
	width: number;
	height: number;
	radius: number;
	dilate: boolean;
}): Float32Array {
	const output = new Float32Array(input.length);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let value = dilate ? 0 : 1;
			for (
				let sampleY = Math.max(0, y - radius);
				sampleY <= Math.min(height - 1, y + radius);
				sampleY += 1
			) {
				const sample = input[sampleY * width + x];
				value = dilate ? Math.max(value, sample) : Math.min(value, sample);
			}
			output[y * width + x] = value;
		}
	}
	return output;
}

export function shiftMaskEdge({
	input,
	width,
	height,
	shift,
}: {
	input: Float32Array;
	width: number;
	height: number;
	shift: number;
}): Float32Array {
	if (width * height !== input.length) {
		throw new Error("Mask dimensions do not match its data length");
	}
	const radius = Math.min(12, Math.round(Math.abs(shift)));
	if (radius === 0) return input.slice();
	const dilate = shift > 0;
	const horizontal = horizontalMorphology({
		input,
		width,
		height,
		radius,
		dilate,
	});
	return verticalMorphology({
		input: horizontal,
		width,
		height,
		radius,
		dilate,
	});
}

export function processPersonConfidenceMask({
	personConfidence,
	width,
	height,
	previous,
	options,
}: {
	personConfidence: Float32Array;
	width: number;
	height: number;
	previous?: Float32Array;
	options: PersonCutoutMaskOptions;
}): ProcessedPersonMask {
	if (width * height !== personConfidence.length) {
		throw new Error("Mask dimensions do not match its data length");
	}

	const foreground = new Float32Array(personConfidence.length);
	for (let index = 0; index < personConfidence.length; index += 1) {
		foreground[index] = clamp01(personConfidence[index]);
	}

	const temporalState = applyTemporalSmoothing({
		current: foreground,
		previous,
		amount: options.temporalSmoothing,
	});
	const shifted = shiftMaskEdge({
		input: temporalState,
		width,
		height,
		shift: options.edgeShift,
	});
	const threshold = clamp01(options.threshold);
	const transition = Math.min(0.45, 0.04 + Math.max(0, options.feather) * 0.04);
	const alpha = new Float32Array(shifted.length);
	for (let index = 0; index < shifted.length; index += 1) {
		alpha[index] = smoothstep(
			threshold - transition,
			threshold + transition,
			shifted[index]
		);
	}

	return { alpha, temporalState };
}
