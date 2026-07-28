export type CanvasTextContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

export interface CanvasDimensions {
	width: number;
	height: number;
}

export function roundedRectPath({
	ctx,
	x,
	y,
	width,
	height,
	radius,
}: {
	ctx: CanvasTextContext;
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
}): void {
	const resolvedRadius = Math.min(
		Math.max(0, radius),
		Math.max(0, width) / 2,
		Math.max(0, height) / 2
	);
	ctx.beginPath();
	ctx.moveTo(x + resolvedRadius, y);
	ctx.lineTo(x + width - resolvedRadius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
	ctx.lineTo(x + width, y + height - resolvedRadius);
	ctx.quadraticCurveTo(
		x + width,
		y + height,
		x + width - resolvedRadius,
		y + height
	);
	ctx.lineTo(x + resolvedRadius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
	ctx.lineTo(x, y + resolvedRadius);
	ctx.quadraticCurveTo(x, y, x + resolvedRadius, y);
	ctx.closePath();
}
