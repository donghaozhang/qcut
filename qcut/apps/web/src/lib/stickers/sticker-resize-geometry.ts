export type StickerResizeHandle =
	| "tl"
	| "tr"
	| "bl"
	| "br"
	| "t"
	| "r"
	| "b"
	| "l";

export interface StickerResizeResult {
	width: number;
	height: number;
	x: number;
	y: number;
}

const MINIMUM_SIZE = 5;
const MAXIMUM_SIZE = 100;

function clamp({
	value,
	minimum,
	maximum,
}: {
	value: number;
	minimum: number;
	maximum: number;
}): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finitePositiveOr({
	value,
	fallback,
}: {
	value: number;
	fallback: number;
}): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasLeftEdge({ handle }: { handle: StickerResizeHandle }): boolean {
	return handle === "tl" || handle === "bl" || handle === "l";
}

function hasRightEdge({ handle }: { handle: StickerResizeHandle }): boolean {
	return handle === "tr" || handle === "br" || handle === "r";
}

function hasTopEdge({ handle }: { handle: StickerResizeHandle }): boolean {
	return handle === "tl" || handle === "tr" || handle === "t";
}

function hasBottomEdge({ handle }: { handle: StickerResizeHandle }): boolean {
	return handle === "bl" || handle === "br" || handle === "b";
}

function isCorner({ handle }: { handle: StickerResizeHandle }): boolean {
	return (
		handle === "tl" || handle === "tr" || handle === "bl" || handle === "br"
	);
}

function availableWidthPercent({
	handle,
	anchorX,
	centerX,
	canvasWidth,
	shortSide,
}: {
	handle: StickerResizeHandle;
	anchorX: number;
	centerX: number;
	canvasWidth: number;
	shortSide: number;
}): number {
	if (hasLeftEdge({ handle })) return (anchorX / shortSide) * 100;
	if (hasRightEdge({ handle })) {
		return ((canvasWidth - anchorX) / shortSide) * 100;
	}
	return (Math.min(centerX, canvasWidth - centerX) * 200) / shortSide;
}

function availableHeightPercent({
	handle,
	anchorY,
	centerY,
	canvasHeight,
	shortSide,
}: {
	handle: StickerResizeHandle;
	anchorY: number;
	centerY: number;
	canvasHeight: number;
	shortSide: number;
}): number {
	if (hasTopEdge({ handle })) return (anchorY / shortSide) * 100;
	if (hasBottomEdge({ handle })) {
		return ((canvasHeight - anchorY) / shortSide) * 100;
	}
	return (Math.min(centerY, canvasHeight - centerY) * 200) / shortSide;
}

function resizedCenter({
	handle,
	anchorX,
	anchorY,
	startCenterX,
	startCenterY,
	width,
	height,
	shortSide,
}: {
	handle: StickerResizeHandle;
	anchorX: number;
	anchorY: number;
	startCenterX: number;
	startCenterY: number;
	width: number;
	height: number;
	shortSide: number;
}): { x: number; y: number } {
	const halfWidth = (width / 100) * shortSide * 0.5;
	const halfHeight = (height / 100) * shortSide * 0.5;
	const x = hasLeftEdge({ handle })
		? anchorX - halfWidth
		: hasRightEdge({ handle })
			? anchorX + halfWidth
			: startCenterX;
	const y = hasTopEdge({ handle })
		? anchorY - halfHeight
		: hasBottomEdge({ handle })
			? anchorY + halfHeight
			: startCenterY;
	return { x, y };
}

export function calculateStickerResize({
	canvasHeight,
	canvasWidth,
	deltaX,
	deltaY,
	handle,
	maintainAspectRatio,
	startHeight,
	startWidth,
	startX,
	startY,
}: {
	canvasHeight: number;
	canvasWidth: number;
	deltaX: number;
	deltaY: number;
	handle: StickerResizeHandle;
	maintainAspectRatio: boolean;
	startHeight: number;
	startWidth: number;
	startX: number;
	startY: number;
}): StickerResizeResult {
	const safeCanvasWidth = finitePositiveOr({ value: canvasWidth, fallback: 1 });
	const safeCanvasHeight = finitePositiveOr({
		value: canvasHeight,
		fallback: 1,
	});
	const shortSide = Math.min(safeCanvasWidth, safeCanvasHeight);
	const safeStartWidth = finitePositiveOr({
		value: startWidth,
		fallback: MINIMUM_SIZE,
	});
	const safeStartHeight = finitePositiveOr({
		value: startHeight,
		fallback: MINIMUM_SIZE,
	});
	const startCenterX =
		(clamp({ value: startX, minimum: 0, maximum: 100 }) / 100) *
		safeCanvasWidth;
	const startCenterY =
		(clamp({ value: startY, minimum: 0, maximum: 100 }) / 100) *
		safeCanvasHeight;
	const startPixelWidth = (safeStartWidth / 100) * shortSide;
	const startPixelHeight = (safeStartHeight / 100) * shortSide;
	const anchorX = hasLeftEdge({ handle })
		? startCenterX + startPixelWidth / 2
		: hasRightEdge({ handle })
			? startCenterX - startPixelWidth / 2
			: startCenterX;
	const anchorY = hasTopEdge({ handle })
		? startCenterY + startPixelHeight / 2
		: hasBottomEdge({ handle })
			? startCenterY - startPixelHeight / 2
			: startCenterY;
	const widthDelta = (deltaX / shortSide) * 200;
	const heightDelta = (deltaY / shortSide) * 200;
	let width = safeStartWidth;
	let height = safeStartHeight;

	if (hasLeftEdge({ handle })) width -= widthDelta;
	if (hasRightEdge({ handle })) width += widthDelta;
	if (hasTopEdge({ handle })) height -= heightDelta;
	if (hasBottomEdge({ handle })) height += heightDelta;

	const maximumWidth = Math.max(
		MINIMUM_SIZE,
		Math.min(
			MAXIMUM_SIZE,
			availableWidthPercent({
				handle,
				anchorX,
				centerX: startCenterX,
				canvasWidth: safeCanvasWidth,
				shortSide,
			})
		)
	);
	const maximumHeight = Math.max(
		MINIMUM_SIZE,
		Math.min(
			MAXIMUM_SIZE,
			availableHeightPercent({
				handle,
				anchorY,
				centerY: startCenterY,
				canvasHeight: safeCanvasHeight,
				shortSide,
			})
		)
	);

	if (maintainAspectRatio && isCorner({ handle })) {
		const horizontalScale = width / safeStartWidth;
		const verticalScale = height / safeStartHeight;
		const requestedScale =
			Math.abs(widthDelta / safeStartWidth) >=
			Math.abs(heightDelta / safeStartHeight)
				? horizontalScale
				: verticalScale;
		const minimumScale = Math.max(
			MINIMUM_SIZE / safeStartWidth,
			MINIMUM_SIZE / safeStartHeight
		);
		const maximumScale = Math.min(
			maximumWidth / safeStartWidth,
			maximumHeight / safeStartHeight
		);
		const scale = clamp({
			value: requestedScale,
			minimum: Math.min(minimumScale, maximumScale),
			maximum: maximumScale,
		});
		width = safeStartWidth * scale;
		height = safeStartHeight * scale;
	} else {
		width = clamp({
			value: width,
			minimum: MINIMUM_SIZE,
			maximum: maximumWidth,
		});
		height = clamp({
			value: height,
			minimum: MINIMUM_SIZE,
			maximum: maximumHeight,
		});
	}

	const center = resizedCenter({
		handle,
		anchorX,
		anchorY,
		startCenterX,
		startCenterY,
		width,
		height,
		shortSide,
	});
	return {
		width,
		height,
		x: clamp({
			value: (center.x / safeCanvasWidth) * 100,
			minimum: 0,
			maximum: 100,
		}),
		y: clamp({
			value: (center.y / safeCanvasHeight) * 100,
			minimum: 0,
			maximum: 100,
		}),
	};
}
