import type { BackgroundConfig } from "./wallpapers";
import { GRADIENT_PRESETS } from "./wallpapers";

/**
 * Draw the background fill on the export canvas.
 */
export function drawBackground(
	ctx: CanvasRenderingContext2D,
	config: BackgroundConfig,
	width: number,
	height: number
): void {
	if (config.type === "gradient") {
		const colors = resolveGradientColors(config);
		const angle = ((config.gradientAngle ?? 135) * Math.PI) / 180;
		const cx = width / 2;
		const cy = height / 2;
		const len = Math.max(width, height);
		const x1 = cx - Math.cos(angle) * len;
		const y1 = cy - Math.sin(angle) * len;
		const x2 = cx + Math.cos(angle) * len;
		const y2 = cy + Math.sin(angle) * len;

		const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
		gradient.addColorStop(0, colors[0]);
		gradient.addColorStop(1, colors[1]);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	} else if (config.type === "solid") {
		ctx.fillStyle = config.solidColor ?? "#1a1a2e";
		ctx.fillRect(0, 0, width, height);
	}
}

/**
 * Draw a video frame with rounded corners and optional shadow.
 */
export function drawRoundedVideoFrame(
	ctx: CanvasRenderingContext2D,
	videoSource: CanvasImageSource,
	x: number,
	y: number,
	width: number,
	height: number,
	borderRadius: number,
	shadow: boolean
): void {
	ctx.save();

	if (shadow) {
		ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
		ctx.shadowBlur = 30;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 10;

		// Draw shadow shape (filled rect to cast shadow)
		ctx.beginPath();
		roundedRect(ctx, x, y, width, height, borderRadius);
		ctx.fillStyle = "rgba(0, 0, 0, 1)";
		ctx.fill();

		// Reset shadow for actual video draw
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
	}

	// Clip to rounded rect
	ctx.beginPath();
	roundedRect(ctx, x, y, width, height, borderRadius);
	ctx.clip();

	// Draw video frame
	ctx.drawImage(videoSource, x, y, width, height);

	ctx.restore();
}

function roundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function resolveGradientColors(config: BackgroundConfig): [string, string] {
	if (config.gradientColors) return config.gradientColors;
	if (config.gradientId) {
		const preset = GRADIENT_PRESETS.find((g) => g.id === config.gradientId);
		if (preset) return preset.colors;
	}
	return ["#667eea", "#764ba2"];
}
