import type { PersonCutoutFrameResult } from "./person-cutout-client";

export function writePersonAlphaMask({
	canvas,
	alpha,
	width,
	height,
}: {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	alpha: Float32Array;
	width: number;
	height: number;
}) {
	if (alpha.length !== width * height) {
		throw new Error("Alpha mask dimensions do not match its data length");
	}
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to create mask canvas context");
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (let index = 0; index < alpha.length; index += 1) {
		const pixel = index * 4;
		pixels[pixel] = 255;
		pixels[pixel + 1] = 255;
		pixels[pixel + 2] = 255;
		pixels[pixel + 3] = Math.round(
			Math.min(1, Math.max(0, alpha[index])) * 255
		);
	}
	context.putImageData(new ImageData(pixels, width, height), 0, 0);
}

export function drawPersonCutoutFrame({
	outputCanvas,
	maskCanvas,
	source,
	mask,
}: {
	outputCanvas: HTMLCanvasElement | OffscreenCanvas;
	maskCanvas: HTMLCanvasElement | OffscreenCanvas;
	source: CanvasImageSource;
	mask: PersonCutoutFrameResult;
}) {
	writePersonAlphaMask({
		canvas: maskCanvas,
		alpha: mask.alpha,
		width: mask.width,
		height: mask.height,
	});
	const context = outputCanvas.getContext("2d");
	if (!context) throw new Error("Unable to create output canvas context");
	context.save();
	context.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
	context.globalCompositeOperation = "source-over";
	context.filter = "none";
	context.drawImage(source, 0, 0, outputCanvas.width, outputCanvas.height);
	context.globalCompositeOperation = "destination-in";
	context.drawImage(maskCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
	context.restore();
}
