export const COLOR_PREVIEW_MAX_WIDTH = 480;

export function colorPreviewCanvasSize({
	width,
	height,
}: {
	width: number;
	height: number;
}) {
	if (width <= 0 || height <= 0) return { width: 0, height: 0 };
	const scale = Math.min(1, COLOR_PREVIEW_MAX_WIDTH / width);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}
