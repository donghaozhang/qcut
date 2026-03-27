/**
 * SVG path data for figure annotations (arrows, circles, rectangles).
 * Arrow paths ported from Recordly (AGPL 3.0).
 * All paths use a 100×100 viewBox coordinate system.
 */

export type ArrowDirection =
	| "up"
	| "down"
	| "left"
	| "right"
	| "up-left"
	| "up-right"
	| "down-left"
	| "down-right";

export type FigureType = "arrow" | "circle" | "rectangle";

/** SVG path data for each arrow direction (100×100 viewBox) */
export const ARROW_PATHS: Record<ArrowDirection, string> = {
	up: "M 50 20 L 50 80 M 50 20 L 35 35 M 50 20 L 65 35",
	down: "M 50 20 L 50 80 M 50 80 L 35 65 M 50 80 L 65 65",
	left: "M 80 50 L 20 50 M 20 50 L 35 35 M 20 50 L 35 65",
	right: "M 20 50 L 80 50 M 80 50 L 65 35 M 80 50 L 65 65",
	"up-right": "M 25 75 L 75 25 M 75 25 L 60 30 M 75 25 L 70 40",
	"up-left": "M 75 75 L 25 25 M 25 25 L 40 30 M 25 25 L 30 40",
	"down-right": "M 25 25 L 75 75 M 75 75 L 70 60 M 75 75 L 60 70",
	"down-left": "M 75 25 L 25 75 M 25 75 L 30 60 M 25 75 L 40 70",
};

/** All arrow directions in display order */
export const ARROW_DIRECTIONS: ArrowDirection[] = [
	"up-left",
	"up",
	"up-right",
	"left",
	"right",
	"down-left",
	"down",
	"down-right",
];

/**
 * Parse an SVG path string into canvas drawing commands.
 * Supports M (moveTo) and L (lineTo) commands.
 */
export function drawSvgPathOnCanvas(
	ctx: CanvasRenderingContext2D,
	pathData: string,
	x: number,
	y: number,
	width: number,
	height: number,
): void {
	const scaleX = width / 100;
	const scaleY = height / 100;

	ctx.beginPath();
	const commands = pathData.match(/[ML]\s+[\d.]+\s+[\d.]+/g);
	if (!commands) return;

	for (const cmd of commands) {
		const parts = cmd.trim().split(/\s+/);
		const type = parts[0];
		const px = x + parseFloat(parts[1]) * scaleX;
		const py = y + parseFloat(parts[2]) * scaleY;

		if (type === "M") {
			ctx.moveTo(px, py);
		} else {
			ctx.lineTo(px, py);
		}
	}
}

/**
 * Draw an arrow figure on a canvas context.
 */
export function drawArrow(
	ctx: CanvasRenderingContext2D,
	direction: ArrowDirection,
	x: number,
	y: number,
	width: number,
	height: number,
	strokeColor: string,
	strokeWidth: number,
): void {
	const pathData = ARROW_PATHS[direction];
	if (!pathData) return;

	ctx.save();
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	// Drop shadow
	ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 2;

	drawSvgPathOnCanvas(ctx, pathData, x, y, width, height);
	ctx.stroke();
	ctx.restore();
}

/**
 * Draw a circle figure on a canvas context.
 */
export function drawCircle(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	strokeColor: string,
	strokeWidth: number,
	fillColor?: string,
	fillOpacity = 1,
): void {
	ctx.save();
	const cx = x + width / 2;
	const cy = y + height / 2;
	const rx = width / 2;
	const ry = height / 2;

	ctx.beginPath();
	ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

	if (fillColor) {
		ctx.globalAlpha = fillOpacity;
		ctx.fillStyle = fillColor;
		ctx.fill();
		ctx.globalAlpha = 1;
	}

	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.stroke();
	ctx.restore();
}

/**
 * Draw a rectangle figure on a canvas context.
 */
export function drawRectangle(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	strokeColor: string,
	strokeWidth: number,
	fillColor?: string,
	fillOpacity = 1,
	cornerRadius = 0,
): void {
	ctx.save();
	ctx.beginPath();

	if (cornerRadius > 0) {
		const r = Math.min(cornerRadius, width / 2, height / 2);
		ctx.roundRect(x, y, width, height, r);
	} else {
		ctx.rect(x, y, width, height);
	}

	if (fillColor) {
		ctx.globalAlpha = fillOpacity;
		ctx.fillStyle = fillColor;
		ctx.fill();
		ctx.globalAlpha = 1;
	}

	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.stroke();
	ctx.restore();
}
