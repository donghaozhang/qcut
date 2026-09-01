import { exportProfiler } from "@/lib/export/export-profiler";
import type { EffectParameters } from "@/types/effects";

/**
 * Advanced canvas-based effects that can't be achieved with CSS filters
 * These are primarily used during export/rendering
 */

/**
 * Apply pixelate effect to canvas
 */
export function applyPixelateEffect(
	ctx: CanvasRenderingContext2D,
	pixelSize: number
): void {
	const canvas = ctx.canvas;
	const width = canvas.width;
	const height = canvas.height;

	if (pixelSize <= 1) return;

	// Get image data
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	// Process pixels in blocks
	for (let y = 0; y < height; y += pixelSize) {
		for (let x = 0; x < width; x += pixelSize) {
			// Get average color in block
			let r = 0,
				g = 0,
				b = 0,
				a = 0;
			let count = 0;

			for (let dy = 0; dy < pixelSize && y + dy < height; dy++) {
				for (let dx = 0; dx < pixelSize && x + dx < width; dx++) {
					const idx = ((y + dy) * width + (x + dx)) * 4;
					r += data[idx];
					g += data[idx + 1];
					b += data[idx + 2];
					a += data[idx + 3];
					count++;
				}
			}

			r = Math.floor(r / count);
			g = Math.floor(g / count);
			b = Math.floor(b / count);
			a = Math.floor(a / count);

			// Set all pixels in block to average color
			for (let dy = 0; dy < pixelSize && y + dy < height; dy++) {
				for (let dx = 0; dx < pixelSize && x + dx < width; dx++) {
					const idx = ((y + dy) * width + (x + dx)) * 4;
					data[idx] = r;
					data[idx + 1] = g;
					data[idx + 2] = b;
					data[idx + 3] = a;
				}
			}
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply wave distortion effect
 */
export function applyWaveEffect(
	ctx: CanvasRenderingContext2D,
	amplitude: number,
	frequency: number
): void {
	const canvas = ctx.canvas;
	const width = canvas.width;
	const height = canvas.height;

	const scratch = acquireDistortionScratch({ width, height });
	if (!scratch) return;
	const tempCanvas = scratch.canvas;

	// Copy original image
	scratch.ctx.drawImage(canvas, 0, 0);

	// Clear original canvas
	ctx.clearRect(0, 0, width, height);

	// Apply wave distortion
	for (let y = 0; y < height; y++) {
		const offsetX =
			Math.sin((y / height) * frequency * Math.PI * 2) * amplitude;
		ctx.drawImage(tempCanvas, 0, y, width, 1, offsetX, y, width, 1);
	}
}

/**
 * Scratch canvas shared by the distortion passes.
 *
 * The wave pass needs an untouched copy of the frame to sample from while it
 * redraws the destination row by row. That copy is written in full on every
 * use and never escapes the call, so one canvas per size can serve every
 * frame instead of allocating a full-resolution canvas per frame — the same
 * lifecycle the export renderer already uses for its adjustment frame.
 */
let distortionScratchCanvas: HTMLCanvasElement | null = null;
let distortionScratchCtx: CanvasRenderingContext2D | null = null;

function acquireDistortionScratch({
	width,
	height,
}: {
	width: number;
	height: number;
}): {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
} | null {
	if (
		!distortionScratchCanvas ||
		distortionScratchCanvas.width !== width ||
		distortionScratchCanvas.height !== height
	) {
		exportProfiler.count("effect-temp-canvas-created");
		distortionScratchCanvas = document.createElement("canvas");
		distortionScratchCanvas.width = width;
		distortionScratchCanvas.height = height;
		distortionScratchCtx = distortionScratchCanvas.getContext("2d");
	}
	if (!distortionScratchCtx) return null;
	// A freshly created canvas starts fully transparent; clearing reproduces
	// that for a reused one, so the copy below is the only content.
	distortionScratchCtx.clearRect(0, 0, width, height);
	return { canvas: distortionScratchCanvas, ctx: distortionScratchCtx };
}

/** Releases the shared scratch canvas (used when an export finishes). */
export function releaseDistortionScratchCanvas(): void {
	distortionScratchCanvas = null;
	distortionScratchCtx = null;
}

/**
 * Apply twist/swirl effect
 */
export function applyTwistEffect(
	ctx: CanvasRenderingContext2D,
	angle: number,
	radius?: number
): void {
	const canvas = ctx.canvas;
	const width = canvas.width;
	const height = canvas.height;
	const centerX = width / 2;
	const centerY = height / 2;
	const maxRadius = radius || Math.min(width, height) / 2;

	const imageData = ctx.getImageData(0, 0, width, height);
	const srcData = new Uint8ClampedArray(imageData.data);
	const destData = imageData.data;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dx = x - centerX;
			const dy = y - centerY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < maxRadius) {
				const percent = (maxRadius - distance) / maxRadius;
				const theta = (percent * percent * angle * Math.PI) / 180;
				const sinTheta = Math.sin(theta);
				const cosTheta = Math.cos(theta);

				const srcX = Math.floor(centerX + cosTheta * dx - sinTheta * dy);
				const srcY = Math.floor(centerY + sinTheta * dx + cosTheta * dy);

				if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
					const srcIdx = (srcY * width + srcX) * 4;
					const destIdx = (y * width + x) * 4;

					destData[destIdx] = srcData[srcIdx];
					destData[destIdx + 1] = srcData[srcIdx + 1];
					destData[destIdx + 2] = srcData[srcIdx + 2];
					destData[destIdx + 3] = srcData[srcIdx + 3];
				}
			}
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply halftone effect
 */
export function applyHalftoneEffect(
	ctx: CanvasRenderingContext2D,
	dotSize: number
): void {
	const canvas = ctx.canvas;
	const width = canvas.width;
	const height = canvas.height;

	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	// Clear canvas and fill with white
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width, height);

	// Process image in dot grid
	for (let y = 0; y < height; y += dotSize * 2) {
		for (let x = 0; x < width; x += dotSize * 2) {
			// Get average brightness in area
			let brightness = 0;
			let count = 0;

			for (let dy = 0; dy < dotSize * 2 && y + dy < height; dy++) {
				for (let dx = 0; dx < dotSize * 2 && x + dx < width; dx++) {
					const idx = ((y + dy) * width + (x + dx)) * 4;
					const r = data[idx];
					const g = data[idx + 1];
					const b = data[idx + 2];
					brightness += (r + g + b) / 3;
					count++;
				}
			}

			brightness = brightness / count / 255;

			// Draw dot based on brightness
			const radius = (1 - brightness) * dotSize;
			if (radius > 0) {
				ctx.fillStyle = "black";
				ctx.beginPath();
				ctx.arc(x + dotSize, y + dotSize, radius, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
}

/**
 * Apply oil painting effect
 */
export function applyOilPaintingEffect(
	ctx: CanvasRenderingContext2D,
	brushSize: number,
	intensity: number
): void {
	const canvas = ctx.canvas;
	const width = canvas.width;
	const height = canvas.height;

	const imageData = ctx.getImageData(0, 0, width, height);
	const srcData = new Uint8ClampedArray(imageData.data);
	const destData = imageData.data;

	// Ensure valid radius and intensity levels
	const radius = Math.max(1, Math.floor(brushSize));
	const levels = Math.min(256, Math.max(1, Math.round(intensity || 1)));

	// Pre-allocate typed arrays outside the loop for better performance
	const hist = new Uint16Array(levels);
	const sumR = new Uint32Array(levels);
	const sumG = new Uint32Array(levels);
	const sumB = new Uint32Array(levels);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Reset histograms for this pixel
			hist.fill(0);
			sumR.fill(0);
			sumG.fill(0);
			sumB.fill(0);

			// Sample colors in brush area
			for (let dy = -radius; dy <= radius; dy++) {
				for (let dx = -radius; dx <= radius; dx++) {
					const px = Math.min(width - 1, Math.max(0, x + dx));
					const py = Math.min(height - 1, Math.max(0, y + dy));
					const idx = (py * width + px) * 4;

					const r = srcData[idx];
					const g = srcData[idx + 1];
					const b = srcData[idx + 2];

					// Calculate bucket index [0..levels-1] based on luminance
					const lum = (r + g + b) / 3; // 0..255
					const bucket = Math.min(
						levels - 1,
						Math.max(0, Math.floor((lum / 255) * (levels - 1)))
					);

					hist[bucket]++;
					sumR[bucket] += r;
					sumG[bucket] += g;
					sumB[bucket] += b;
				}
			}

			// Find most common bucket
			let maxLevel = 0;
			let maxCount = 0;
			for (let i = 0; i < levels; i++) {
				if (hist[i] > maxCount) {
					maxCount = hist[i];
					maxLevel = i;
				}
			}

			// Set pixel to average color of most common intensity (with division by zero protection)
			const destIdx = (y * width + x) * 4;
			const denom = Math.max(1, hist[maxLevel]);
			destData[destIdx] = Math.round(sumR[maxLevel] / denom);
			destData[destIdx + 1] = Math.round(sumG[maxLevel] / denom);
			destData[destIdx + 2] = Math.round(sumB[maxLevel] / denom);
			destData[destIdx + 3] = srcData[destIdx + 3];
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply advanced effects based on parameters
 */
export function applyAdvancedCanvasEffects(
	ctx: CanvasRenderingContext2D,
	parameters: EffectParameters
): void {
	const startedAt = performance.now();
	ctx.save();
	try {
		// Apply distortion effects
		if (parameters.pixelate && parameters.pixelate > 0) {
			applyPixelateEffect(ctx, parameters.pixelate);
		}

		if (parameters.waveAmplitude && parameters.waveFrequency) {
			applyWaveEffect(ctx, parameters.waveAmplitude, parameters.waveFrequency);
		}

		if (parameters.twist && parameters.twistAngle) {
			applyTwistEffect(ctx, parameters.twistAngle);
		}

		// Apply artistic effects
		if (parameters.halftone && parameters.dotSize) {
			applyHalftoneEffect(ctx, parameters.dotSize);
		}

		if (parameters.oilPainting && parameters.brushSize) {
			applyOilPaintingEffect(ctx, parameters.brushSize, parameters.oilPainting);
		}

		// Apply blend modes for composite effects
		if (parameters.blendMode) {
			ctx.globalCompositeOperation =
				parameters.blendMode as GlobalCompositeOperation;
		}
	} finally {
		ctx.restore();
		exportProfiler.record("effect-advanced", performance.now() - startedAt);
	}
}

/**
 * Apply transition effect between two canvases
 */
export function applyTransitionEffect(
	ctx: CanvasRenderingContext2D,
	fromCanvas: HTMLCanvasElement,
	toCanvas: HTMLCanvasElement,
	transitionType: string,
	progress: number
): void {
	const width = ctx.canvas.width;
	const height = ctx.canvas.height;

	ctx.clearRect(0, 0, width, height);

	switch (transitionType) {
		case "fade":
			// Draw from canvas
			ctx.globalAlpha = 1 - progress;
			ctx.drawImage(fromCanvas, 0, 0);

			// Draw to canvas
			ctx.globalAlpha = progress;
			ctx.drawImage(toCanvas, 0, 0);

			ctx.globalAlpha = 1;
			break;

		case "dissolve": {
			// Random pixel dissolve
			ctx.drawImage(fromCanvas, 0, 0);

			const imageData = ctx.getImageData(0, 0, width, height);
			const toCtx = toCanvas.getContext("2d");
			if (!toCtx) {
				// No 2D context available (e.g., tests). Skip dissolve gracefully.
				break;
			}
			const toImageData = toCtx.getImageData(0, 0, width, height);

			for (let i = 0; i < imageData.data.length; i += 4) {
				if (Math.random() < progress) {
					imageData.data[i] = toImageData.data[i];
					imageData.data[i + 1] = toImageData.data[i + 1];
					imageData.data[i + 2] = toImageData.data[i + 2];
					imageData.data[i + 3] = toImageData.data[i + 3];
				}
			}

			ctx.putImageData(imageData, 0, 0);
			break;
		}

		case "wipe": {
			// Horizontal wipe
			const wipeX = width * progress;

			// Draw from canvas
			ctx.drawImage(fromCanvas, 0, 0);

			// Draw to canvas with clipping
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, wipeX, height);
			ctx.clip();
			ctx.drawImage(toCanvas, 0, 0);
			ctx.restore();
			break;
		}

		default:
			// Fallback: simple crossfade
			ctx.globalAlpha = 1 - progress;
			ctx.drawImage(fromCanvas, 0, 0);
			ctx.globalAlpha = progress;
			ctx.drawImage(toCanvas, 0, 0);
			ctx.globalAlpha = 1;
			break;
	}
}
