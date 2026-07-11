import type { MediaItem } from "@/stores/media/media-store";
import { rgbToHsl } from "./color-space-math";

export interface ColorFrameStatistics {
	meanRed: number;
	meanGreen: number;
	meanBlue: number;
	meanLuminance: number;
	meanSaturation: number;
	lowLuminance: number;
	highLuminance: number;
}

export interface SuggestedColorCorrection {
	exposure: number;
	contrast: number;
	temperature: number;
	tint: number;
	saturation: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function imageDataFromSource({
	source,
	width,
	height,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
}): ImageData {
	const maximumWidth = 320;
	const scale = Math.min(1, maximumWidth / Math.max(1, width));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Unable to create color analysis canvas");
	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Unable to load color reference"));
		image.src = url;
	});
}

async function loadVideoFrame({
	url,
	time,
}: {
	url: string;
	time: number;
}): Promise<HTMLVideoElement> {
	const video = document.createElement("video");
	video.crossOrigin = "anonymous";
	video.muted = true;
	video.preload = "auto";
	video.src = url;
	await new Promise<void>((resolve, reject) => {
		video.onloadeddata = () => resolve();
		video.onerror = () => reject(new Error("Unable to load video frame"));
	});
	video.currentTime = clamp(time, 0, Math.max(0, video.duration - 0.01));
	await new Promise<void>((resolve, reject) => {
		video.onseeked = () => resolve();
		video.onerror = () => reject(new Error("Unable to seek video frame"));
	});
	return video;
}

export async function captureMediaColorFrame({
	mediaItem,
	sourceTime,
}: {
	mediaItem: MediaItem;
	sourceTime: number;
}): Promise<ImageData> {
	if (mediaItem.type === "video") {
		const mounted = document.querySelector<HTMLVideoElement>(
			`video[data-video-id="${CSS.escape(mediaItem.id)}"]`
		);
		if (mounted && mounted.readyState >= 2 && mounted.videoWidth > 0) {
			return imageDataFromSource({
				source: mounted,
				width: mounted.videoWidth,
				height: mounted.videoHeight,
			});
		}
		const temporaryUrl = mediaItem.url
			? undefined
			: URL.createObjectURL(mediaItem.file);
		try {
			const video = await loadVideoFrame({
				url: mediaItem.url ?? temporaryUrl ?? "",
				time: sourceTime,
			});
			return imageDataFromSource({
				source: video,
				width: video.videoWidth,
				height: video.videoHeight,
			});
		} finally {
			if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
		}
	}
	const temporaryUrl = mediaItem.url
		? undefined
		: URL.createObjectURL(mediaItem.file);
	try {
		const image = await loadImage(mediaItem.url ?? temporaryUrl ?? "");
		return imageDataFromSource({
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
		});
	} finally {
		if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
	}
}

export async function captureReferenceImage(file: File): Promise<ImageData> {
	const url = URL.createObjectURL(file);
	try {
		const image = await loadImage(url);
		return imageDataFromSource({
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function analyzeColorFrame({
	imageData,
}: {
	imageData: ImageData;
}): ColorFrameStatistics {
	let red = 0;
	let green = 0;
	let blue = 0;
	let luminanceTotal = 0;
	let saturation = 0;
	let count = 0;
	const histogram = new Uint32Array(256);
	for (let index = 0; index < imageData.data.length; index += 16) {
		if (imageData.data[index + 3] === 0) continue;
		const r = imageData.data[index] / 255;
		const g = imageData.data[index + 1] / 255;
		const b = imageData.data[index + 2] / 255;
		const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
		red += r;
		green += g;
		blue += b;
		luminanceTotal += luma;
		saturation += rgbToHsl({ r, g, b }).s;
		histogram[Math.min(255, Math.round(luma * 255))] += 1;
		count += 1;
	}
	if (count === 0)
		throw new Error("The selected frame contains no visible pixels");
	const percentile = (target: number) => {
		let accumulated = 0;
		for (let index = 0; index < histogram.length; index += 1) {
			accumulated += histogram[index];
			if (accumulated >= count * target) return index / 255;
		}
		return 1;
	};
	return {
		meanRed: red / count,
		meanGreen: green / count,
		meanBlue: blue / count,
		meanLuminance: luminanceTotal / count,
		meanSaturation: saturation / count,
		lowLuminance: percentile(0.05),
		highLuminance: percentile(0.95),
	};
}

export function suggestAutoColor({
	statistics,
}: {
	statistics: ColorFrameStatistics;
}): SuggestedColorCorrection {
	const neutral = (statistics.meanRed + statistics.meanBlue) / 2;
	const range = statistics.highLuminance - statistics.lowLuminance;
	return {
		exposure: clamp(
			Math.log2(0.45 / Math.max(0.03, statistics.meanLuminance)),
			-2,
			2
		),
		contrast: clamp((0.72 / Math.max(0.1, range) - 1) * 35, -35, 35),
		temperature: clamp(
			(statistics.meanBlue - statistics.meanRed) * 180,
			-50,
			50
		),
		tint: clamp((neutral - statistics.meanGreen) * 180, -50, 50),
		saturation: clamp((0.38 - statistics.meanSaturation) * 65, -30, 30),
	};
}

export function suggestColorMatch({
	source,
	reference,
}: {
	source: ColorFrameStatistics;
	reference: ColorFrameStatistics;
}): SuggestedColorCorrection {
	const sourceNeutral = (source.meanRed + source.meanBlue) / 2;
	const referenceNeutral = (reference.meanRed + reference.meanBlue) / 2;
	const sourceRange = Math.max(0.1, source.highLuminance - source.lowLuminance);
	const referenceRange = Math.max(
		0.1,
		reference.highLuminance - reference.lowLuminance
	);
	return {
		exposure: clamp(
			Math.log2(reference.meanLuminance / Math.max(0.03, source.meanLuminance)),
			-2,
			2
		),
		contrast: clamp((referenceRange / sourceRange - 1) * 60, -50, 50),
		temperature: clamp(
			(source.meanBlue -
				source.meanRed -
				(reference.meanBlue - reference.meanRed)) *
				180,
			-70,
			70
		),
		tint: clamp(
			(referenceNeutral -
				reference.meanGreen -
				(sourceNeutral - source.meanGreen)) *
				180,
			-70,
			70
		),
		saturation: clamp(
			(reference.meanSaturation - source.meanSaturation) * 100,
			-50,
			50
		),
	};
}
