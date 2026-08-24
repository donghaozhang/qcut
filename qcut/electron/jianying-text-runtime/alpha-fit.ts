export interface JianyingTextAlphaBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

const TARGET_MARGIN_RATIO = 0.04;
const CLIPPED_RETRY_SCALE = 0.75;

export function jianyingTextFitMargin({ dimension }: { dimension: number }) {
	return Math.max(2, Math.round(dimension * TARGET_MARGIN_RATIO));
}

export function nextJianyingTextFitValue({
	value,
	bounds,
	frameWidth,
	frameHeight,
	minimumValue = 1,
	fitHorizontal = true,
	fitVertical = true,
}: {
	value: number;
	bounds: JianyingTextAlphaBounds | null;
	frameWidth: number;
	frameHeight: number;
	minimumValue?: number;
	fitHorizontal?: boolean;
	fitVertical?: boolean;
}) {
	if (!bounds) return null;
	const marginX = jianyingTextFitMargin({ dimension: frameWidth });
	const marginY = jianyingTextFitMargin({ dimension: frameHeight });
	const maxX = bounds.x + bounds.width - 1;
	const maxY = bounds.y + bounds.height - 1;
	const fits =
		(!fitHorizontal || (bounds.x >= marginX && maxX < frameWidth - marginX)) &&
		(!fitVertical || (bounds.y >= marginY && maxY < frameHeight - marginY));
	if (fits || value <= minimumValue) return null;
	const touchesFrame =
		(fitHorizontal && (bounds.x === 0 || maxX === frameWidth - 1)) ||
		(fitVertical && (bounds.y === 0 || maxY === frameHeight - 1));
	const availableWidth = Math.max(1, frameWidth - marginX * 2);
	const availableHeight = Math.max(1, frameHeight - marginY * 2);
	const measuredScales = [0.95];
	if (fitHorizontal) measuredScales.push(availableWidth / bounds.width);
	if (fitVertical) measuredScales.push(availableHeight / bounds.height);
	const measuredScale = Math.min(...measuredScales);
	// A clipped frame understates the real bounds, so use a conservative step.
	const scale = touchesFrame
		? Math.min(measuredScale, CLIPPED_RETRY_SCALE)
		: measuredScale;
	const next = Math.max(
		minimumValue,
		Math.floor(value * Math.max(0.1, scale) * 1000) / 1000
	);
	return next < value ? next : null;
}
