export interface FilterLabRgbFrame {
	width: number;
	height: number;
	pixels: Uint8Array;
}

export interface FilterLabMaskFrame {
	width: number;
	height: number;
	pixels: Uint8Array;
}

export interface FilterLabFrameMetrics {
	rgbRmse: number;
	psnr: number;
	ssim: number;
	deltaE: number;
	deltaESamples: number;
}

export interface FilterLabMaskMetrics {
	maskIou: number;
	maskMae: number;
	maskEdgeMae: number;
}

export interface FilterLabTemporalMetrics {
	frameCount: number;
	temporalRmse: number;
	temporalRmseStdDev: number;
	temporalRmseMax: number;
	temporalMotionDelta: number;
}

const SSIM_WINDOW_SIZE = 8;
const DELTA_E_MAX_SAMPLES = 1_000_000;

function assertFrameShape({
	frame,
	channels,
	label,
}: {
	frame: FilterLabRgbFrame | FilterLabMaskFrame;
	channels: number;
	label: string;
}) {
	const expected = frame.width * frame.height * channels;
	if (
		!Number.isInteger(frame.width) ||
		!Number.isInteger(frame.height) ||
		frame.width <= 0 ||
		frame.height <= 0 ||
		frame.pixels.length !== expected
	) {
		throw new Error(`${label} has invalid dimensions or pixel data`);
	}
}

function assertMatchingFrames({
	reference,
	candidate,
	channels,
}: {
	reference: FilterLabRgbFrame | FilterLabMaskFrame;
	candidate: FilterLabRgbFrame | FilterLabMaskFrame;
	channels: number;
}) {
	assertFrameShape({ frame: reference, channels, label: "Reference frame" });
	assertFrameShape({ frame: candidate, channels, label: "Candidate frame" });
	if (
		reference.width !== candidate.width ||
		reference.height !== candidate.height
	) {
		throw new Error(
			"Reference and candidate frames must have identical dimensions"
		);
	}
}

function calculateRgbRmse({
	left,
	right,
}: {
	left: Uint8Array;
	right: Uint8Array;
}): number {
	let squaredError = 0;
	for (let index = 0; index < left.length; index += 1) {
		const delta = (left[index] ?? 0) - (right[index] ?? 0);
		squaredError += delta * delta;
	}
	return Math.sqrt(squaredError / left.length);
}

function luminanceAt({
	pixels,
	offset,
}: {
	pixels: Uint8Array;
	offset: number;
}) {
	return (
		0.2126 * (pixels[offset] ?? 0) +
		0.7152 * (pixels[offset + 1] ?? 0) +
		0.0722 * (pixels[offset + 2] ?? 0)
	);
}

function calculateWindowedSsim({
	reference,
	candidate,
}: {
	reference: FilterLabRgbFrame;
	candidate: FilterLabRgbFrame;
}): number {
	const c1 = (0.01 * 255) ** 2;
	const c2 = (0.03 * 255) ** 2;
	let score = 0;
	let windows = 0;
	for (let top = 0; top < reference.height; top += SSIM_WINDOW_SIZE) {
		for (let left = 0; left < reference.width; left += SSIM_WINDOW_SIZE) {
			let count = 0;
			let sumReference = 0;
			let sumCandidate = 0;
			let sumReferenceSquared = 0;
			let sumCandidateSquared = 0;
			let sumProduct = 0;
			const bottom = Math.min(top + SSIM_WINDOW_SIZE, reference.height);
			const right = Math.min(left + SSIM_WINDOW_SIZE, reference.width);
			for (let y = top; y < bottom; y += 1) {
				for (let x = left; x < right; x += 1) {
					const offset = (y * reference.width + x) * 3;
					const referenceY = luminanceAt({
						pixels: reference.pixels,
						offset,
					});
					const candidateY = luminanceAt({
						pixels: candidate.pixels,
						offset,
					});
					count += 1;
					sumReference += referenceY;
					sumCandidate += candidateY;
					sumReferenceSquared += referenceY * referenceY;
					sumCandidateSquared += candidateY * candidateY;
					sumProduct += referenceY * candidateY;
				}
			}
			const meanReference = sumReference / count;
			const meanCandidate = sumCandidate / count;
			const varianceReference = Math.max(
				0,
				sumReferenceSquared / count - meanReference * meanReference
			);
			const varianceCandidate = Math.max(
				0,
				sumCandidateSquared / count - meanCandidate * meanCandidate
			);
			const covariance = sumProduct / count - meanReference * meanCandidate;
			const numerator =
				(2 * meanReference * meanCandidate + c1) * (2 * covariance + c2);
			const denominator =
				(meanReference ** 2 + meanCandidate ** 2 + c1) *
				(varianceReference + varianceCandidate + c2);
			score += denominator === 0 ? 1 : numerator / denominator;
			windows += 1;
		}
	}
	return score / windows;
}

function srgbToLinear({ value }: { value: number }) {
	const normalized = value / 255;
	return normalized <= 0.04045
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
}

function labPivot({ value }: { value: number }) {
	const epsilon = 216 / 24_389;
	const kappa = 24_389 / 27;
	return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
}

function rgbToLab({
	red,
	green,
	blue,
}: {
	red: number;
	green: number;
	blue: number;
}): [number, number, number] {
	const r = srgbToLinear({ value: red });
	const g = srgbToLinear({ value: green });
	const b = srgbToLinear({ value: blue });
	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
	const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
	const fx = labPivot({ value: x });
	const fy = labPivot({ value: y });
	const fz = labPivot({ value: z });
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function calculateMeanDeltaE({
	reference,
	candidate,
}: {
	reference: Uint8Array;
	candidate: Uint8Array;
}): { deltaE: number; samples: number } {
	const pixelCount = reference.length / 3;
	const stride = Math.max(1, Math.ceil(pixelCount / DELTA_E_MAX_SAMPLES));
	let total = 0;
	let samples = 0;
	for (let pixel = 0; pixel < pixelCount; pixel += stride) {
		const offset = pixel * 3;
		const left = rgbToLab({
			red: reference[offset] ?? 0,
			green: reference[offset + 1] ?? 0,
			blue: reference[offset + 2] ?? 0,
		});
		const right = rgbToLab({
			red: candidate[offset] ?? 0,
			green: candidate[offset + 1] ?? 0,
			blue: candidate[offset + 2] ?? 0,
		});
		total += Math.hypot(
			(left[0] ?? 0) - (right[0] ?? 0),
			(left[1] ?? 0) - (right[1] ?? 0),
			(left[2] ?? 0) - (right[2] ?? 0)
		);
		samples += 1;
	}
	return { deltaE: total / samples, samples };
}

export function measureFilterLabFrames({
	reference,
	candidate,
}: {
	reference: FilterLabRgbFrame;
	candidate: FilterLabRgbFrame;
}): FilterLabFrameMetrics {
	assertMatchingFrames({ reference, candidate, channels: 3 });
	const rgbRmse = calculateRgbRmse({
		left: reference.pixels,
		right: candidate.pixels,
	});
	const deltaE = calculateMeanDeltaE({
		reference: reference.pixels,
		candidate: candidate.pixels,
	});
	return {
		rgbRmse,
		psnr: rgbRmse === 0 ? 100 : 20 * Math.log10(255 / rgbRmse),
		ssim: calculateWindowedSsim({ reference, candidate }),
		deltaE: deltaE.deltaE,
		deltaESamples: deltaE.samples,
	};
}

function edgeStrength({
	pixels,
	width,
	x,
	y,
}: {
	pixels: Uint8Array;
	width: number;
	x: number;
	y: number;
}) {
	const center = pixels[y * width + x] ?? 0;
	const horizontal = Math.abs(center - (pixels[y * width + x + 1] ?? center));
	const vertical = Math.abs(center - (pixels[(y + 1) * width + x] ?? center));
	return Math.hypot(horizontal, vertical) / (255 * Math.SQRT2);
}

export function measureFilterLabMasks({
	reference,
	candidate,
}: {
	reference: FilterLabMaskFrame;
	candidate: FilterLabMaskFrame;
}): FilterLabMaskMetrics {
	assertMatchingFrames({ reference, candidate, channels: 1 });
	let intersection = 0;
	let union = 0;
	let absoluteError = 0;
	for (let index = 0; index < reference.pixels.length; index += 1) {
		const left = reference.pixels[index] ?? 0;
		const right = candidate.pixels[index] ?? 0;
		if (left >= 128 && right >= 128) intersection += 1;
		if (left >= 128 || right >= 128) union += 1;
		absoluteError += Math.abs(left - right) / 255;
	}
	let edgeError = 0;
	let edgeSamples = 0;
	for (let y = 0; y < reference.height - 1; y += 1) {
		for (let x = 0; x < reference.width - 1; x += 1) {
			const left = edgeStrength({
				pixels: reference.pixels,
				width: reference.width,
				x,
				y,
			});
			const right = edgeStrength({
				pixels: candidate.pixels,
				width: candidate.width,
				x,
				y,
			});
			if (left <= 1 / 255 && right <= 1 / 255) continue;
			edgeError += Math.abs(left - right);
			edgeSamples += 1;
		}
	}
	return {
		maskIou: union === 0 ? 1 : intersection / union,
		maskMae: absoluteError / reference.pixels.length,
		maskEdgeMae: edgeSamples === 0 ? 0 : edgeError / edgeSamples,
	};
}

function mean({ values }: { values: number[] }) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function measureFilterLabTemporalFrames({
	referenceFrames,
	candidateFrames,
}: {
	referenceFrames: Uint8Array[];
	candidateFrames: Uint8Array[];
}): FilterLabTemporalMetrics {
	const frameCount = Math.min(referenceFrames.length, candidateFrames.length);
	if (frameCount < 2) {
		throw new Error(
			"Temporal verification requires at least two paired frames"
		);
	}
	const pairedRmse: number[] = [];
	const motionDelta: number[] = [];
	for (let index = 0; index < frameCount; index += 1) {
		const reference = referenceFrames[index];
		const candidate = candidateFrames[index];
		if (!reference || !candidate || reference.length !== candidate.length) {
			throw new Error("Temporal frames must have identical decoded dimensions");
		}
		pairedRmse.push(calculateRgbRmse({ left: reference, right: candidate }));
		if (index === 0) continue;
		const previousReference = referenceFrames[index - 1];
		const previousCandidate = candidateFrames[index - 1];
		if (!(previousReference && previousCandidate)) continue;
		const referenceMotion = calculateRgbRmse({
			left: previousReference,
			right: reference,
		});
		const candidateMotion = calculateRgbRmse({
			left: previousCandidate,
			right: candidate,
		});
		motionDelta.push(Math.abs(referenceMotion - candidateMotion));
	}
	const temporalRmse = mean({ values: pairedRmse });
	const variance = mean({
		values: pairedRmse.map((value) => (value - temporalRmse) ** 2),
	});
	return {
		frameCount,
		temporalRmse,
		temporalRmseStdDev: Math.sqrt(variance),
		temporalRmseMax: Math.max(...pairedRmse),
		temporalMotionDelta: mean({ values: motionDelta }),
	};
}
