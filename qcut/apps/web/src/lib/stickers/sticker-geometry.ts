export interface StickerPercentagePoint {
	x: number;
	y: number;
}

export interface StickerPercentageSize {
	width: number;
	height: number;
}

export interface StickerPixelGeometry {
	centerX: number;
	centerY: number;
	pixelWidth: number;
	pixelHeight: number;
	left: number;
	top: number;
}

export interface StickerCssGeometry {
	left: string;
	top: string;
	width: string;
	height: string;
}

const EMPTY_STICKER_GEOMETRY: StickerPixelGeometry = {
	centerX: 0,
	centerY: 0,
	pixelWidth: 0,
	pixelHeight: 0,
	left: 0,
	top: 0,
};

function finiteOrZero({ value }: { value: number }): number {
	return Number.isFinite(value) ? value : 0;
}

function finiteNonNegativeOrZero({ value }: { value: number }): number {
	return Math.max(0, finiteOrZero({ value }));
}

export function resolveStickerGeometry({
	position,
	size,
	canvasWidth,
	canvasHeight,
}: {
	position: StickerPercentagePoint;
	size: StickerPercentageSize;
	canvasWidth: number;
	canvasHeight: number;
}): StickerPixelGeometry {
	const safeCanvasWidth = finiteNonNegativeOrZero({ value: canvasWidth });
	const safeCanvasHeight = finiteNonNegativeOrZero({ value: canvasHeight });
	if (safeCanvasWidth === 0 || safeCanvasHeight === 0) {
		return { ...EMPTY_STICKER_GEOMETRY };
	}

	const shortSide = Math.min(safeCanvasWidth, safeCanvasHeight);
	const centerX = (finiteOrZero({ value: position.x }) / 100) * safeCanvasWidth;
	const centerY =
		(finiteOrZero({ value: position.y }) / 100) * safeCanvasHeight;
	const pixelWidth =
		(finiteNonNegativeOrZero({ value: size.width }) / 100) * shortSide;
	const pixelHeight =
		(finiteNonNegativeOrZero({ value: size.height }) / 100) * shortSide;

	return {
		centerX,
		centerY,
		pixelWidth,
		pixelHeight,
		left: centerX - pixelWidth / 2,
		top: centerY - pixelHeight / 2,
	};
}

export function getStickerCssGeometry({
	geometry,
}: {
	geometry: StickerPixelGeometry;
}): StickerCssGeometry {
	const left = finiteOrZero({ value: geometry.left });
	const top = finiteOrZero({ value: geometry.top });
	const width = finiteNonNegativeOrZero({ value: geometry.pixelWidth });
	const height = finiteNonNegativeOrZero({ value: geometry.pixelHeight });

	return {
		left: `${left}px`,
		top: `${top}px`,
		width: `${width}px`,
		height: `${height}px`,
	};
}
