import { measureFilterLabMasks } from "../../electron/native-pipeline/filters/filter-lab-image-metrics.js";

export const UI_MASK_MINIMUM_COLOR_DISTANCE_SQUARED = 64;

function assertRgbaFrames({
	background,
	skin,
	filtered,
}: {
	background: Uint8Array;
	skin: Uint8Array;
	filtered: Uint8Array;
}) {
	if (
		background.length === 0 ||
		background.length % 4 !== 0 ||
		background.length !== skin.length ||
		background.length !== filtered.length
	) {
		throw new Error("Dual-LUT inference requires matching RGBA frames");
	}
}

export function inferDualLutMaskFrame({
	background,
	skin,
	filtered,
	minimumColorDistanceSquared = UI_MASK_MINIMUM_COLOR_DISTANCE_SQUARED,
}: {
	background: Uint8Array;
	skin: Uint8Array;
	filtered: Uint8Array;
	minimumColorDistanceSquared?: number;
}) {
	assertRgbaFrames({ background, skin, filtered });
	if (
		!(
			Number.isFinite(minimumColorDistanceSquared) &&
			minimumColorDistanceSquared >= 0
		)
	) {
		throw new Error("Mask inference color-distance threshold is invalid");
	}
	const pixelCount = background.length / 4;
	const mask = new Uint8Array(pixelCount);
	let confidentPixels = 0;
	let reconstructionSquaredError = 0;
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const offset = pixel * 4;
		let numerator = 0;
		let denominator = 0;
		for (let channel = 0; channel < 3; channel += 1) {
			const difference = skin[offset + channel] - background[offset + channel];
			numerator +=
				(filtered[offset + channel] - background[offset + channel]) *
				difference;
			denominator += difference * difference;
		}
		const amount =
			denominator > minimumColorDistanceSquared
				? Math.max(0, Math.min(1, numerator / denominator))
				: 0;
		if (denominator > minimumColorDistanceSquared) confidentPixels += 1;
		mask[pixel] = Math.floor(amount * 255);
		for (let channel = 0; channel < 3; channel += 1) {
			const reconstructed =
				background[offset + channel] +
				(skin[offset + channel] - background[offset + channel]) * amount;
			const error = filtered[offset + channel] - reconstructed;
			reconstructionSquaredError += error * error;
		}
	}
	return {
		mask,
		confidenceCoverage: confidentPixels / pixelCount,
		reconstructionRgbRmse: Math.sqrt(
			reconstructionSquaredError / (pixelCount * 3)
		),
	};
}

export function summarizeMaskReferenceComparison({
	reference,
	candidate,
	width,
	height,
}: {
	reference: Uint8Array[];
	candidate: Uint8Array[];
	width: number;
	height: number;
}) {
	if (reference.length === 0 || reference.length !== candidate.length) {
		throw new Error("Mask reference sequences must have matching frames");
	}
	const perFrame = reference.map((pixels, index) =>
		measureFilterLabMasks({
			reference: { width, height, pixels },
			candidate: { width, height, pixels: candidate[index] },
		})
	);
	const mean = ({ values }: { values: number[] }) =>
		values.reduce((sum, value) => sum + value, 0) / values.length;
	let referenceSum = 0;
	let candidateSum = 0;
	let referenceSquaredSum = 0;
	let candidateSquaredSum = 0;
	let productSum = 0;
	let sampleCount = 0;
	for (let frame = 0; frame < reference.length; frame += 1) {
		const referencePixels = reference[frame];
		const candidatePixels = candidate[frame];
		for (let index = 0; index < referencePixels.length; index += 1) {
			const left = referencePixels[index];
			const right = candidatePixels[index];
			referenceSum += left;
			candidateSum += right;
			referenceSquaredSum += left * left;
			candidateSquaredSum += right * right;
			productSum += left * right;
			sampleCount += 1;
		}
	}
	const covariance = productSum - (referenceSum * candidateSum) / sampleCount;
	const referenceVariance =
		referenceSquaredSum - (referenceSum * referenceSum) / sampleCount;
	const candidateVariance =
		candidateSquaredSum - (candidateSum * candidateSum) / sampleCount;
	return {
		maskIou: mean({ values: perFrame.map((metrics) => metrics.maskIou) }),
		maskMae: mean({ values: perFrame.map((metrics) => metrics.maskMae) }),
		maskEdgeMae: mean({
			values: perFrame.map((metrics) => metrics.maskEdgeMae),
		}),
		maskEdgeMaeMax: Math.max(...perFrame.map((metrics) => metrics.maskEdgeMae)),
		maskCorrelation:
			referenceVariance <= 0 || candidateVariance <= 0
				? 0
				: covariance / Math.sqrt(referenceVariance * candidateVariance),
		perFrame,
	};
}
