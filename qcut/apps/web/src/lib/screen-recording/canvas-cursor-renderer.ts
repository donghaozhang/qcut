import type { CursorRenderConfig } from "./cursor-renderer";
import { CURSOR_ASSETS } from "./cursor-assets";
import { clamp01 } from "./math-utils";

const REFERENCE_WIDTH = 1920;
const CLICK_BOUNCE_DURATION_MS = 150;

const cursorImageCache = new Map<string, HTMLImageElement>();

/**
 * Canvas 2D cursor renderer for export pipeline.
 * No PixiJS dependency — uses standard CanvasRenderingContext2D.
 */
export function drawCursor(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	config: CursorRenderConfig,
	clickAnimProgress: number,
	canvasWidth: number,
	swayRotation = 0
): void {
	if (config.cursorStyle === "hidden") return;

	const scaleFactor = canvasWidth / REFERENCE_WIDTH;

	// Click bounce
	let bounceScale = 1;
	if (clickAnimProgress > 0 && clickAnimProgress < 1) {
		const mid = 0.3;
		if (clickAnimProgress < mid) {
			bounceScale = 1 - 0.15 * config.clickBounce * (clickAnimProgress / mid);
		} else {
			const t = clamp01((clickAnimProgress - mid) / (1 - mid));
			bounceScale = 1 - 0.15 * config.clickBounce * (1 - t);
		}
	}

	const radius = config.dotRadius * scaleFactor * bounceScale;

	ctx.save();
	ctx.globalAlpha = config.dotAlpha;

	// Apply sway rotation around cursor position
	if (swayRotation !== 0) {
		ctx.translate(x, y);
		ctx.rotate(swayRotation);
		ctx.translate(-x, -y);
	}

	if (
		config.cursorStyle === "macos-arrow" ||
		config.cursorStyle === "macos-pointer"
	) {
		const img = getCursorImage(config.cursorStyle);
		if (img && img.complete) {
			const size = radius * 2;
			ctx.drawImage(img, x, y, size, size * 1.5);
		} else {
			// Fallback to dot
			drawDot(ctx, x, y, radius, config);
		}
	} else {
		drawDot(ctx, x, y, radius, config);
	}

	// Click ring
	if (clickAnimProgress > 0 && clickAnimProgress < 1) {
		ctx.beginPath();
		ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
		ctx.strokeStyle = colorToCSS(config.dotColor);
		ctx.globalAlpha = config.dotAlpha * 0.4;
		ctx.lineWidth = 2 * scaleFactor;
		ctx.stroke();
	}

	ctx.restore();
}

function drawDot(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	config: CursorRenderConfig
): void {
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fillStyle = colorToCSS(config.dotColor);
	ctx.fill();
}

function getCursorImage(style: string): HTMLImageElement | null {
	if (cursorImageCache.has(style)) return cursorImageCache.get(style)!;

	const dataUrl = CURSOR_ASSETS[style];
	if (!dataUrl) return null;

	const img = new Image();
	img.src = dataUrl;
	cursorImageCache.set(style, img);
	return img;
}

function colorToCSS(hex: number): string {
	return `#${hex.toString(16).padStart(6, "0")}`;
}

/**
 * Draw cursor with motion blur ghost trail for fast movements.
 * Draws N ghost cursors along the movement vector with decreasing opacity.
 */
export function drawCursorWithMotionBlur(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	prevX: number,
	prevY: number,
	config: CursorRenderConfig,
	clickAnimProgress: number,
	canvasWidth: number,
	swayRotation = 0
): void {
	const dx = x - prevX;
	const dy = y - prevY;
	const distance = Math.hypot(dx, dy);
	const blurIntensity = distance * config.motionBlur * 0.08;

	if (blurIntensity < 0.5) {
		drawCursor(ctx, x, y, config, clickAnimProgress, canvasWidth, swayRotation);
		return;
	}

	const ghostCount = Math.min(5, Math.ceil(blurIntensity));

	// Draw ghosts from oldest to newest (increasing opacity)
	for (let i = ghostCount; i >= 1; i--) {
		const t = i / ghostCount;
		const ghostX = x - dx * t * 0.6;
		const ghostY = y - dy * t * 0.6;
		const alpha = (1 - t) * 0.3;
		ctx.save();
		ctx.globalAlpha = alpha;
		drawCursor(ctx, ghostX, ghostY, config, 0, canvasWidth, swayRotation);
		ctx.restore();
	}

	// Draw main cursor on top at full opacity
	drawCursor(ctx, x, y, config, clickAnimProgress, canvasWidth, swayRotation);
}

/**
 * Compute click animation progress (0 = no click, 0–1 = in bounce).
 */
export function getClickAnimProgress(
	timeMs: number,
	clickStartMs: number
): number {
	if (clickStartMs < 0) return 0;
	const elapsed = timeMs - clickStartMs;
	if (elapsed < 0 || elapsed >= CLICK_BOUNCE_DURATION_MS) return 0;
	return elapsed / CLICK_BOUNCE_DURATION_MS;
}
