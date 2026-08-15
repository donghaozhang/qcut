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

export interface WindowBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Fit window bounds into a display's work area: shrink to fit, then shift
 * the window so it lies fully inside. Never grows the window, so a window
 * that already fits keeps its size and only gets pulled back on-screen.
 */
export function clampBoundsToWorkArea({
	bounds,
	workArea,
}: {
	bounds: WindowBounds;
	workArea: WindowBounds;
}): WindowBounds {
	const width = Math.min(bounds.width, workArea.width);
	const height = Math.min(bounds.height, workArea.height);
	const x = Math.min(
		Math.max(bounds.x, workArea.x),
		workArea.x + workArea.width - width
	);
	const y = Math.min(
		Math.max(bounds.y, workArea.y),
		workArea.y + workArea.height - height
	);
	return { x, y, width, height };
}
