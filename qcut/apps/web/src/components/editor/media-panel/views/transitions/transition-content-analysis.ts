import type { MediaItem } from "@/stores/media/media-store-types";

const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 18;
const CONTENT_KEYS = [
	"cameraMotion",
	"caption",
	"description",
	"keywords",
	"prompt",
	"scene",
	"shot",
	"tags",
	"transcript",
] as const;

export interface TransitionFrameMetrics {
	averageBlue: number;
	averageGreen: number;
	averageRed: number;
	contrast: number;
	edgeEnergy: number;
	luminance: number;
	saturation: number;
}

export interface TransitionVisualSignals {
	brightnessDelta: number;
	colorDistance: number;
	contrastDelta: number;
	meanEdgeEnergy: number;
	meanSaturation: number;
	visualSimilarity: number;
}

function clampUnit({ value }: { value: number }): number {
	return Math.max(0, Math.min(1, value));
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function collectContentValue({ value }: { value: unknown }): string[] {
	if (typeof value === "string") {
		const normalized = value.trim();
		return normalized ? [normalized] : [];
	}
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) =>
		typeof item === "string" && item.trim() ? [item.trim()] : []
	);
}

export function buildTransitionContentText({
	fallbackName,
	mediaItem,
}: {
	fallbackName: string;
	mediaItem?: MediaItem;
}): string {
	const values = [fallbackName, mediaItem?.name ?? ""];
	const metadata = asRecord({ value: mediaItem?.metadata });
	if (metadata) {
		for (const key of CONTENT_KEYS) {
			values.push(...collectContentValue({ value: metadata[key] }));
		}
		const generationParams = asRecord({ value: metadata.generationParams });
		if (generationParams) {
			for (const key of CONTENT_KEYS) {
				values.push(...collectContentValue({ value: generationParams[key] }));
			}
		}
	}

	const seen = new Set<string>();
	return values
		.map((value) => value.trim())
		.filter((value) => {
			const key = value.toLocaleLowerCase();
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.join(" ");
}

export function calculateTransitionFrameMetrics({
	height,
	pixels,
	width,
}: {
	height: number;
	pixels: Uint8ClampedArray;
	width: number;
}): TransitionFrameMetrics {
	const pixelCount = width * height;
	if (pixelCount <= 0 || pixels.length < pixelCount * 4) {
		throw new Error(
			"Transition frame pixels do not match the sample dimensions"
		);
	}

	const luminance = new Float32Array(pixelCount);
	let redTotal = 0;
	let greenTotal = 0;
	let blueTotal = 0;
	let luminanceTotal = 0;
	let luminanceSquaredTotal = 0;
	let saturationTotal = 0;
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		const alpha = pixels[offset + 3] / 255;
		const red = (pixels[offset] / 255) * alpha;
		const green = (pixels[offset + 1] / 255) * alpha;
		const blue = (pixels[offset + 2] / 255) * alpha;
		const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
		const maximum = Math.max(red, green, blue);
		const minimum = Math.min(red, green, blue);
		luminance[index] = value;
		redTotal += red;
		greenTotal += green;
		blueTotal += blue;
		luminanceTotal += value;
		luminanceSquaredTotal += value * value;
		saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum;
	}

	let edgeTotal = 0;
	let edgeCount = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (x > 0) {
				edgeTotal += Math.abs(luminance[index] - luminance[index - 1]);
				edgeCount++;
			}
			if (y > 0) {
				edgeTotal += Math.abs(luminance[index] - luminance[index - width]);
				edgeCount++;
			}
		}
	}

	const meanLuminance = luminanceTotal / pixelCount;
	const variance = Math.max(
		0,
		luminanceSquaredTotal / pixelCount - meanLuminance * meanLuminance
	);
	return {
		averageBlue: blueTotal / pixelCount,
		averageGreen: greenTotal / pixelCount,
		averageRed: redTotal / pixelCount,
		contrast: clampUnit({ value: Math.sqrt(variance) * 2 }),
		edgeEnergy: clampUnit({ value: edgeCount > 0 ? edgeTotal / edgeCount : 0 }),
		luminance: clampUnit({ value: meanLuminance }),
		saturation: clampUnit({ value: saturationTotal / pixelCount }),
	};
}

export function buildTransitionVisualSignals({
	from,
	to,
}: {
	from: TransitionFrameMetrics;
	to: TransitionFrameMetrics;
}): TransitionVisualSignals {
	const colorDistance =
		Math.hypot(
			from.averageRed - to.averageRed,
			from.averageGreen - to.averageGreen,
			from.averageBlue - to.averageBlue
		) / Math.sqrt(3);
	return {
		brightnessDelta: Math.abs(from.luminance - to.luminance),
		colorDistance: clampUnit({ value: colorDistance }),
		contrastDelta: Math.abs(from.contrast - to.contrast),
		meanEdgeEnergy: (from.edgeEnergy + to.edgeEnergy) / 2,
		meanSaturation: (from.saturation + to.saturation) / 2,
		visualSimilarity: clampUnit({ value: 1 - colorDistance }),
	};
}

function loadImage({ source }: { source: string }): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		if (/^https?:/i.test(source)) image.crossOrigin = "anonymous";
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(new Error("Transition thumbnail could not be read"));
		image.src = source;
	});
}

export async function analyzeTransitionThumbnail({
	source,
}: {
	source: string;
}): Promise<TransitionFrameMetrics> {
	const image = await loadImage({ source });
	const canvas = document.createElement("canvas");
	canvas.width = SAMPLE_WIDTH;
	canvas.height = SAMPLE_HEIGHT;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Transition thumbnail analysis is unavailable");
	context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
	const imageData = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
	return calculateTransitionFrameMetrics({
		height: SAMPLE_HEIGHT,
		pixels: imageData.data,
		width: SAMPLE_WIDTH,
	});
}
