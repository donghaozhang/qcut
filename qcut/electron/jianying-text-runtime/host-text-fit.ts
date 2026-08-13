export interface JianyingHostTextAlphaBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

const TARGET_MARGIN_RATIO = 0.04;
const CLIPPED_RETRY_SCALE = 0.75;
const MINIMUM_FONT_SIZE = 1;

export function measureJianyingHostTextAlphaBounds({
	bytes,
	width,
	height,
}: {
	bytes: Buffer;
	width: number;
	height: number;
}): JianyingHostTextAlphaBounds | null {
	if (bytes.length !== width * height * 4) {
		throw new Error("Jianying host-text probe has an invalid RGBA frame size.");
	}
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (bytes[(y * width + x) * 4 + 3] === 0) continue;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}
	if (maxX < 0 || maxY < 0) return null;
	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
}

export function nextJianyingHostTextFontSize({
	fontSize,
	bounds,
	width,
	height,
}: {
	fontSize: number;
	bounds: JianyingHostTextAlphaBounds | null;
	width: number;
	height: number;
}) {
	if (!bounds) return null;
	const marginX = Math.max(2, Math.round(width * TARGET_MARGIN_RATIO));
	const marginY = Math.max(2, Math.round(height * TARGET_MARGIN_RATIO));
	const fits =
		bounds.minX >= marginX &&
		bounds.maxX < width - marginX &&
		bounds.minY >= marginY &&
		bounds.maxY < height - marginY;
	if (fits || fontSize <= MINIMUM_FONT_SIZE) return null;
	const touchesFrame =
		bounds.minX === 0 ||
		bounds.maxX === width - 1 ||
		bounds.minY === 0 ||
		bounds.maxY === height - 1;
	const availableWidth = Math.max(1, width - marginX * 2);
	const availableHeight = Math.max(1, height - marginY * 2);
	const measuredScale = Math.min(
		availableWidth / bounds.width,
		availableHeight / bounds.height,
		0.95
	);
	// A clipped frame understates the real bounds, so use a conservative step.
	const scale = touchesFrame
		? Math.min(measuredScale, CLIPPED_RETRY_SCALE)
		: measuredScale;
	const next = Math.max(
		MINIMUM_FONT_SIZE,
		Math.floor(fontSize * Math.max(0.1, scale) * 1000) / 1000
	);
	return next < fontSize ? next : null;
}
