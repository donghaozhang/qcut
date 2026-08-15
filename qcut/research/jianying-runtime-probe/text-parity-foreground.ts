import {
	decodeCapturePixels,
	type CapturePixels,
} from "../../.agents/skills/qcut-toolkit/jianying-transition-reference/scripts/image-difference";

export const TEXT_PARITY_FOREGROUND_BACKGROUND_THRESHOLD = 8;
export const TEXT_PARITY_GEOMETRY_BACKGROUND_THRESHOLD = 24;

export interface TextForegroundBounds {
	x: number;
	y: number;
	width: number;
	height: number;
	visiblePixels: number;
}

export interface TextForegroundDifferenceMetrics {
	backgroundThreshold: number;
	unionBounds: TextForegroundBounds;
	referenceBounds: TextForegroundBounds;
	candidateBounds: TextForegroundBounds;
	referenceVisiblePixels: number;
	candidateVisiblePixels: number;
	unionVisiblePixels: number;
	intersectionVisiblePixels: number;
	maskIou: number;
	centroidDistance: number;
	maximumBoundsDelta: number;
	roiMae: number;
	roiRmse: number;
	foregroundMae: number;
	foregroundRmse: number;
}

interface ForegroundMask {
	mask: Uint8Array;
	bounds: TextForegroundBounds;
	centroid: { x: number; y: number };
}

function parseBackgroundColor({
	color,
}: {
	color: string;
}): [number, number, number] {
	if (!/^#[a-fA-F0-9]{6}$/.test(color)) {
		throw new Error("Text parity background color must use #RRGGBB");
	}
	return [
		Number.parseInt(color.slice(1, 3), 16),
		Number.parseInt(color.slice(3, 5), 16),
		Number.parseInt(color.slice(5, 7), 16),
	];
}

function foregroundMask({
	pixels,
	width,
	height,
	background,
	threshold,
}: {
	pixels: Uint8Array;
	width: number;
	height: number;
	background: [number, number, number];
	threshold: number;
}): ForegroundMask {
	const mask = new Uint8Array(width * height);
	let minimumX = width;
	let minimumY = height;
	let maximumX = -1;
	let maximumY = -1;
	let visiblePixels = 0;
	let xSum = 0;
	let ySum = 0;
	for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
		const byteIndex = pixelIndex * 3;
		const difference = Math.max(
			Math.abs(pixels[byteIndex] - background[0]),
			Math.abs(pixels[byteIndex + 1] - background[1]),
			Math.abs(pixels[byteIndex + 2] - background[2])
		);
		if (difference <= threshold) continue;
		mask[pixelIndex] = 1;
		const x = pixelIndex % width;
		const y = Math.floor(pixelIndex / width);
		minimumX = Math.min(minimumX, x);
		minimumY = Math.min(minimumY, y);
		maximumX = Math.max(maximumX, x);
		maximumY = Math.max(maximumY, y);
		visiblePixels += 1;
		xSum += x;
		ySum += y;
	}
	if (visiblePixels === 0) {
		// Progress stops 0 and 1 often sample frames before any glyph appears
		// or after every glyph has faded; report an empty mask instead of
		// throwing so the comparison can treat two empty frames as identical.
		return {
			mask,
			bounds: { x: 0, y: 0, width: 0, height: 0, visiblePixels: 0 },
			centroid: { x: 0, y: 0 },
		};
	}
	return {
		mask,
		bounds: {
			x: minimumX,
			y: minimumY,
			width: maximumX - minimumX + 1,
			height: maximumY - minimumY + 1,
			visiblePixels,
		},
		centroid: {
			x: xSum / visiblePixels,
			y: ySum / visiblePixels,
		},
	};
}

function unionBounds({
	reference,
	candidate,
}: {
	reference: TextForegroundBounds;
	candidate: TextForegroundBounds;
}): TextForegroundBounds {
	const x = Math.min(reference.x, candidate.x);
	const y = Math.min(reference.y, candidate.y);
	const maximumX = Math.max(
		reference.x + reference.width,
		candidate.x + candidate.width
	);
	const maximumY = Math.max(
		reference.y + reference.height,
		candidate.y + candidate.height
	);
	return {
		x,
		y,
		width: maximumX - x,
		height: maximumY - y,
		visiblePixels: 0,
	};
}

function maximumBoundsDelta({
	reference,
	candidate,
}: {
	reference: TextForegroundBounds;
	candidate: TextForegroundBounds;
}): number {
	return Math.max(
		Math.abs(reference.x - candidate.x),
		Math.abs(reference.y - candidate.y),
		Math.abs(reference.x + reference.width - (candidate.x + candidate.width)),
		Math.abs(reference.y + reference.height - (candidate.y + candidate.height))
	);
}

function emptyForegroundMatch({
	backgroundThreshold,
}: {
	backgroundThreshold: number;
}): TextForegroundDifferenceMetrics {
	const bounds = { x: 0, y: 0, width: 0, height: 0, visiblePixels: 0 };
	return {
		backgroundThreshold,
		unionBounds: { ...bounds },
		referenceBounds: { ...bounds },
		candidateBounds: { ...bounds },
		referenceVisiblePixels: 0,
		candidateVisiblePixels: 0,
		unionVisiblePixels: 0,
		intersectionVisiblePixels: 0,
		maskIou: 1,
		centroidDistance: 0,
		maximumBoundsDelta: 0,
		roiMae: 0,
		roiRmse: 0,
		foregroundMae: 0,
		foregroundRmse: 0,
	};
}

function compareDecodedTextForeground({
	reference,
	candidate,
	backgroundColor,
	backgroundThreshold,
}: {
	reference: CapturePixels;
	candidate: CapturePixels;
	backgroundColor: string;
	backgroundThreshold: number;
}): TextForegroundDifferenceMetrics {
	if (
		reference.width !== candidate.width ||
		reference.height !== candidate.height ||
		reference.channels !== 3 ||
		candidate.channels !== 3
	) {
		throw new Error("Text parity foreground frames have incompatible geometry");
	}
	const background = parseBackgroundColor({ color: backgroundColor });
	const referenceMask = foregroundMask({
		pixels: reference.data,
		width: reference.width,
		height: reference.height,
		background,
		threshold: backgroundThreshold,
	});
	const candidateMask = foregroundMask({
		pixels: candidate.data,
		width: candidate.width,
		height: candidate.height,
		background,
		threshold: backgroundThreshold,
	});
	const referenceEmpty = referenceMask.bounds.visiblePixels === 0;
	const candidateEmpty = candidateMask.bounds.visiblePixels === 0;
	if (referenceEmpty && candidateEmpty) {
		return emptyForegroundMatch({ backgroundThreshold });
	}
	if (referenceEmpty || candidateEmpty) {
		throw new Error("Text parity frame has foreground pixels on only one side");
	}
	const bounds = unionBounds({
		reference: referenceMask.bounds,
		candidate: candidateMask.bounds,
	});
	let unionVisiblePixels = 0;
	let intersectionVisiblePixels = 0;
	let foregroundAbsoluteError = 0;
	let foregroundSquaredError = 0;
	let roiAbsoluteError = 0;
	let roiSquaredError = 0;
	for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
		for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
			const pixelIndex = y * reference.width + x;
			const referenceVisible = referenceMask.mask[pixelIndex] === 1;
			const candidateVisible = candidateMask.mask[pixelIndex] === 1;
			const unionVisible = referenceVisible || candidateVisible;
			if (unionVisible) unionVisiblePixels += 1;
			if (referenceVisible && candidateVisible) intersectionVisiblePixels += 1;
			const byteIndex = pixelIndex * 3;
			for (let channel = 0; channel < 3; channel += 1) {
				const difference = Math.abs(
					reference.data[byteIndex + channel] -
						candidate.data[byteIndex + channel]
				);
				roiAbsoluteError += difference;
				roiSquaredError += difference * difference;
				if (!unionVisible) continue;
				foregroundAbsoluteError += difference;
				foregroundSquaredError += difference * difference;
			}
		}
	}
	if (unionVisiblePixels === 0) {
		throw new Error("Text parity frame has an empty foreground union");
	}
	const roiSamples = bounds.width * bounds.height * 3;
	const foregroundSamples = unionVisiblePixels * 3;
	return {
		backgroundThreshold,
		unionBounds: { ...bounds, visiblePixels: unionVisiblePixels },
		referenceBounds: referenceMask.bounds,
		candidateBounds: candidateMask.bounds,
		referenceVisiblePixels: referenceMask.bounds.visiblePixels,
		candidateVisiblePixels: candidateMask.bounds.visiblePixels,
		unionVisiblePixels,
		intersectionVisiblePixels,
		maskIou: intersectionVisiblePixels / unionVisiblePixels,
		centroidDistance: Math.hypot(
			referenceMask.centroid.x - candidateMask.centroid.x,
			referenceMask.centroid.y - candidateMask.centroid.y
		),
		maximumBoundsDelta: maximumBoundsDelta({
			reference: referenceMask.bounds,
			candidate: candidateMask.bounds,
		}),
		roiMae: roiAbsoluteError / roiSamples,
		roiRmse: Math.sqrt(roiSquaredError / roiSamples),
		foregroundMae: foregroundAbsoluteError / foregroundSamples,
		foregroundRmse: Math.sqrt(foregroundSquaredError / foregroundSamples),
	};
}

async function decodeTextForegroundFrames({
	referencePath,
	candidatePath,
	ffmpegPath,
}: {
	referencePath: string;
	candidatePath: string;
	ffmpegPath?: string;
}) {
	const [reference, candidate] = await Promise.all([
		decodeCapturePixels({ filePath: referencePath, ffmpegPath }),
		decodeCapturePixels({ filePath: candidatePath, ffmpegPath }),
	]);
	return { reference, candidate };
}

export async function compareTextForeground({
	referencePath,
	candidatePath,
	backgroundColor,
	ffmpegPath,
	backgroundThreshold = TEXT_PARITY_FOREGROUND_BACKGROUND_THRESHOLD,
}: {
	referencePath: string;
	candidatePath: string;
	backgroundColor: string;
	ffmpegPath?: string;
	backgroundThreshold?: number;
}): Promise<TextForegroundDifferenceMetrics> {
	const frames = await decodeTextForegroundFrames({
		referencePath,
		candidatePath,
		ffmpegPath,
	});
	return compareDecodedTextForeground({
		...frames,
		backgroundColor,
		backgroundThreshold,
	});
}

export async function compareTextForegroundAndGeometry({
	referencePath,
	candidatePath,
	backgroundColor,
	ffmpegPath,
}: {
	referencePath: string;
	candidatePath: string;
	backgroundColor: string;
	ffmpegPath?: string;
}) {
	const frames = await decodeTextForegroundFrames({
		referencePath,
		candidatePath,
		ffmpegPath,
	});
	return {
		foreground: compareDecodedTextForeground({
			...frames,
			backgroundColor,
			backgroundThreshold: TEXT_PARITY_FOREGROUND_BACKGROUND_THRESHOLD,
		}),
		geometry: compareDecodedTextForeground({
			...frames,
			backgroundColor,
			backgroundThreshold: TEXT_PARITY_GEOMETRY_BACKGROUND_THRESHOLD,
		}),
	};
}
