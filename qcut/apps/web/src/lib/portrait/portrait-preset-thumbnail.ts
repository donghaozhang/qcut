/** Long edge of a stored preset thumbnail, in pixels. */
const THUMBNAIL_LONG_EDGE = 96;

/**
 * Captures a small preview of the current preview frame for a preset card.
 *
 * Returns undefined rather than throwing: a preset must still save when the
 * preview is not on screen, so a missing thumbnail is a normal outcome, not an
 * error the user needs to see.
 */
export function capturePortraitPresetThumbnail(): string | undefined {
	if (typeof document === "undefined") return undefined;
	const source = document.querySelector<HTMLCanvasElement>(
		'[data-testid="color-preview-canvas"]'
	);
	if (!source || source.width === 0 || source.height === 0) return undefined;
	const scale = THUMBNAIL_LONG_EDGE / Math.max(source.width, source.height);
	const width = Math.max(1, Math.round(source.width * scale));
	const height = Math.max(1, Math.round(source.height * scale));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) return undefined;
	try {
		context.drawImage(source, 0, 0, width, height);
		// JPEG keeps the stored preset well under the inline size bound; the
		// thumbnail is decorative, so quality is deliberately low.
		return canvas.toDataURL("image/jpeg", 0.7);
	} catch {
		// A tainted canvas throws on export; a preset without a picture is fine.
		return undefined;
	}
}
