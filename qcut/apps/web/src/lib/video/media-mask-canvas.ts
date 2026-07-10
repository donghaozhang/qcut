import type { MediaMask } from "@/types/timeline";
import { mediaMaskSvgUrl } from "./media-mask-svg";

const maskImageCache = new Map<string, Promise<HTMLImageElement>>();

function loadMaskImage(url: string): Promise<HTMLImageElement> {
	const cached = maskImageCache.get(url);
	if (cached) return cached;
	const promise = new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Unable to render media mask"));
		image.src = url;
	});
	maskImageCache.set(url, promise);
	return promise;
}

export async function drawMediaSourceWithMasks({
	context,
	source,
	x,
	y,
	width,
	height,
	masks,
}: {
	context: CanvasRenderingContext2D;
	source: CanvasImageSource;
	x: number;
	y: number;
	width: number;
	height: number;
	masks: MediaMask[];
}): Promise<void> {
	const maskUrl = mediaMaskSvgUrl(masks);
	if (!maskUrl) {
		context.drawImage(source, x, y, width, height);
		return;
	}

	const pixelWidth = Math.max(1, Math.round(Math.abs(width)));
	const pixelHeight = Math.max(1, Math.round(Math.abs(height)));
	const frameCanvas = document.createElement("canvas");
	frameCanvas.width = pixelWidth;
	frameCanvas.height = pixelHeight;
	const frameContext = frameCanvas.getContext("2d");
	if (!frameContext) throw new Error("Unable to create masked frame canvas");
	frameContext.drawImage(source, 0, 0, pixelWidth, pixelHeight);
	frameContext.globalCompositeOperation = "destination-in";
	frameContext.drawImage(
		await loadMaskImage(maskUrl),
		0,
		0,
		pixelWidth,
		pixelHeight
	);
	context.drawImage(frameCanvas, x, y, width, height);
}

export function clearMediaMaskCanvasCache() {
	maskImageCache.clear();
}
