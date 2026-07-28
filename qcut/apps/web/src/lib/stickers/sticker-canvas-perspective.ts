import type { MediaPerspective } from "@/types/timeline";
import {
	buildPerspectiveMatrix3d,
	isDefaultMediaPerspective,
	projectMediaPerspectivePoint,
} from "@/lib/video/video-perspective";

interface Point {
	x: number;
	y: number;
}

function drawImageTriangle({
	ctx,
	image,
	source,
	destination,
}: {
	ctx: CanvasRenderingContext2D;
	image: CanvasImageSource;
	source: [Point, Point, Point];
	destination: [Point, Point, Point];
}): void {
	const [sourceA, sourceB, sourceC] = source;
	const [destinationA, destinationB, destinationC] = destination;
	const denominator =
		sourceA.x * (sourceB.y - sourceC.y) +
		sourceB.x * (sourceC.y - sourceA.y) +
		sourceC.x * (sourceA.y - sourceB.y);
	if (Math.abs(denominator) < 1e-9) return;
	const a =
		(destinationA.x * (sourceB.y - sourceC.y) +
			destinationB.x * (sourceC.y - sourceA.y) +
			destinationC.x * (sourceA.y - sourceB.y)) /
		denominator;
	const c =
		(destinationA.x * (sourceC.x - sourceB.x) +
			destinationB.x * (sourceA.x - sourceC.x) +
			destinationC.x * (sourceB.x - sourceA.x)) /
		denominator;
	const e =
		(destinationA.x * (sourceB.x * sourceC.y - sourceC.x * sourceB.y) +
			destinationB.x * (sourceC.x * sourceA.y - sourceA.x * sourceC.y) +
			destinationC.x * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)) /
		denominator;
	const b =
		(destinationA.y * (sourceB.y - sourceC.y) +
			destinationB.y * (sourceC.y - sourceA.y) +
			destinationC.y * (sourceA.y - sourceB.y)) /
		denominator;
	const d =
		(destinationA.y * (sourceC.x - sourceB.x) +
			destinationB.y * (sourceA.x - sourceC.x) +
			destinationC.y * (sourceB.x - sourceA.x)) /
		denominator;
	const f =
		(destinationA.y * (sourceB.x * sourceC.y - sourceC.x * sourceB.y) +
			destinationB.y * (sourceC.x * sourceA.y - sourceA.x * sourceC.y) +
			destinationC.y * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)) /
		denominator;

	ctx.save();
	ctx.beginPath();
	ctx.moveTo(destinationA.x, destinationA.y);
	ctx.lineTo(destinationB.x, destinationB.y);
	ctx.lineTo(destinationC.x, destinationC.y);
	ctx.closePath();
	ctx.clip();
	ctx.transform(a, b, c, d, e, f);
	ctx.drawImage(image, 0, 0);
	ctx.restore();
}

export function drawStickerWithPerspective({
	ctx,
	image,
	sourceWidth,
	sourceHeight,
	width,
	height,
	perspective,
	maintainAspectRatio = false,
	gridSize = 12,
}: {
	ctx: CanvasRenderingContext2D;
	image: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
	width: number;
	height: number;
	perspective: MediaPerspective;
	maintainAspectRatio?: boolean;
	gridSize?: number;
}): void {
	if (width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
		return;
	}
	const contentScale = maintainAspectRatio
		? Math.min(width / sourceWidth, height / sourceHeight)
		: 1;
	const contentWidth = maintainAspectRatio ? sourceWidth * contentScale : width;
	const contentHeight = maintainAspectRatio
		? sourceHeight * contentScale
		: height;
	const contentLeft = (width - contentWidth) / 2;
	const contentTop = (height - contentHeight) / 2;
	if (isDefaultMediaPerspective(perspective)) {
		ctx.drawImage(
			image,
			contentLeft - width / 2,
			contentTop - height / 2,
			contentWidth,
			contentHeight
		);
		return;
	}
	const matrix = buildPerspectiveMatrix3d({ width, height, perspective });
	if (!matrix) {
		ctx.drawImage(
			image,
			contentLeft - width / 2,
			contentTop - height / 2,
			contentWidth,
			contentHeight
		);
		return;
	}
	const steps = Math.max(1, Math.round(gridSize));
	const pointAt = ({ column, row }: { column: number; row: number }) => {
		const targetX = contentLeft + (column / steps) * contentWidth;
		const targetY = contentTop + (row / steps) * contentHeight;
		const projected = projectMediaPerspectivePoint({
			x: targetX,
			y: targetY,
			matrix,
		});
		return {
			source: {
				x: (column / steps) * sourceWidth,
				y: (row / steps) * sourceHeight,
			},
			destination: {
				x: projected.x - width / 2,
				y: projected.y - height / 2,
			},
		};
	};
	for (let row = 0; row < steps; row++) {
		for (let column = 0; column < steps; column++) {
			const topLeft = pointAt({ column, row });
			const topRight = pointAt({ column: column + 1, row });
			const bottomLeft = pointAt({ column, row: row + 1 });
			const bottomRight = pointAt({
				column: column + 1,
				row: row + 1,
			});
			drawImageTriangle({
				ctx,
				image,
				source: [topLeft.source, topRight.source, bottomRight.source],
				destination: [
					topLeft.destination,
					topRight.destination,
					bottomRight.destination,
				],
			});
			drawImageTriangle({
				ctx,
				image,
				source: [topLeft.source, bottomRight.source, bottomLeft.source],
				destination: [
					topLeft.destination,
					bottomRight.destination,
					bottomLeft.destination,
				],
			});
		}
	}
}
