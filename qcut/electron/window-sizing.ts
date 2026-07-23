const FULL_HD_WIDTH = 1920;
const FULL_HD_HEIGHT = 1080;
const DEFAULT_SCREEN_FRACTION = 0.8;

export interface WindowSize {
	width: number;
	height: number;
}

export function resolveInitialWindowSize({
	workAreaWidth,
	workAreaHeight,
}: {
	workAreaWidth: number;
	workAreaHeight: number;
}): WindowSize {
	const preferredWidth = Math.max(
		FULL_HD_WIDTH,
		Math.round(workAreaWidth * DEFAULT_SCREEN_FRACTION)
	);
	const preferredHeight = Math.max(
		FULL_HD_HEIGHT,
		Math.round(workAreaHeight * DEFAULT_SCREEN_FRACTION)
	);

	return {
		width: Math.min(workAreaWidth, preferredWidth),
		height: Math.min(workAreaHeight, preferredHeight),
	};
}
