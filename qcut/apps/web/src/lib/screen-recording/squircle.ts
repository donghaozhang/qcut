/**
 * Squircle geometry — iOS-style superellipse rounded corners.
 * Smoother than standard CSS border-radius.
 * Ported from Recordly (AGPL 3.0).
 */

interface SquircleRect {
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
}

interface Point {
	x: number;
	y: number;
}

const EXPONENT = 4.5;
const SEGMENTS_PER_CORNER = 10;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function getClampedRadius(
	width: number,
	height: number,
	radius: number,
): number {
	return clamp(radius, 0, Math.min(width, height) / 2);
}

function getSuperellipsePoint(
	cx: number,
	cy: number,
	radius: number,
	angle: number,
): Point {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const exp = 2 / EXPONENT;
	return {
		x: cx + Math.sign(cos) * radius * Math.abs(cos) ** exp,
		y: cy + Math.sign(sin) * radius * Math.abs(sin) ** exp,
	};
}

/**
 * Generate squircle path points for a given rectangle and corner radius.
 */
export function getSquirclePathPoints(rect: SquircleRect): Point[] {
	const { x, y, width, height, radius } = rect;
	if (width <= 0 || height <= 0) return [];

	const r = getClampedRadius(width, height, radius);
	if (r <= 0.5) {
		return [
			{ x, y },
			{ x: x + width, y },
			{ x: x + width, y: y + height },
			{ x, y: y + height },
		];
	}

	const points: Point[] = [{ x: x + r, y }];
	const corners = [
		{ cx: x + width - r, cy: y + r, start: -Math.PI / 2, end: 0 },
		{
			cx: x + width - r,
			cy: y + height - r,
			start: 0,
			end: Math.PI / 2,
		},
		{
			cx: x + r,
			cy: y + height - r,
			start: Math.PI / 2,
			end: Math.PI,
		},
		{
			cx: x + r,
			cy: y + r,
			start: Math.PI,
			end: (Math.PI * 3) / 2,
		},
	];

	for (const corner of corners) {
		for (let i = 1; i <= SEGMENTS_PER_CORNER; i++) {
			const t = i / SEGMENTS_PER_CORNER;
			const angle = corner.start + (corner.end - corner.start) * t;
			points.push(getSuperellipsePoint(corner.cx, corner.cy, r, angle));
		}
	}

	return points;
}

/**
 * Generate SVG path string for a squircle.
 */
export function getSquircleSvgPath(rect: SquircleRect): string {
	const points = getSquirclePathPoints(rect);
	if (points.length === 0) return "";

	const [first, ...rest] = points;
	return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;
}

/**
 * Draw a squircle clip path on a Canvas2D context.
 * Call ctx.clip() after this to clip rendering to the squircle shape.
 */
export function drawSquircleClipPath(
	ctx: CanvasRenderingContext2D,
	rect: SquircleRect,
): void {
	const points = getSquirclePathPoints(rect);
	if (points.length === 0) return;

	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y);
	}
	ctx.closePath();
}
