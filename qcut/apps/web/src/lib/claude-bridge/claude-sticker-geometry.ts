export interface ClaudeStickerGeometryPatch {
	height?: number;
	width?: number;
	x?: number;
	y?: number;
}

export interface CanonicalStickerGeometry {
	height: number;
	width: number;
	x: number;
	y: number;
}

export type ClaudeStickerGeometrySpace = "pixels" | "canvas-percent";

const DEFAULT_STICKER_SIZE_PIXELS = 200;

function requireFinite({
	label,
	value,
}: {
	label: string;
	value: number;
}): void {
	if (!Number.isFinite(value)) {
		throw new Error(`${label} must be finite`);
	}
}

/**
 * Resolves external sticker geometry into QCut's canonical percentages.
 * Pixel patches use a top-left x/y origin; canvas-percent patches already use
 * center-based x/y percentages. Width/height are percentages of the short side.
 */
export function resolveClaudeStickerGeometry({
	canvasSize,
	current,
	patch,
	space = "pixels",
}: {
	canvasSize: { height: number; width: number };
	current?: Partial<CanonicalStickerGeometry>;
	patch: ClaudeStickerGeometryPatch;
	space?: ClaudeStickerGeometrySpace;
}): CanonicalStickerGeometry {
	requireFinite({ label: "Canvas width", value: canvasSize.width });
	requireFinite({ label: "Canvas height", value: canvasSize.height });
	if (canvasSize.width <= 0 || canvasSize.height <= 0) {
		throw new Error("Canvas dimensions must be positive");
	}

	const shortSide = Math.min(canvasSize.width, canvasSize.height);
	if (space === "canvas-percent") {
		const defaultSize = (DEFAULT_STICKER_SIZE_PIXELS / shortSide) * 100;
		const width = patch.width ?? current?.width ?? defaultSize;
		const height = patch.height ?? current?.height ?? defaultSize;
		const x =
			patch.x ??
			current?.x ??
			(DEFAULT_STICKER_SIZE_PIXELS / 2 / canvasSize.width) * 100;
		const y =
			patch.y ??
			current?.y ??
			(DEFAULT_STICKER_SIZE_PIXELS / 2 / canvasSize.height) * 100;

		for (const [label, value] of [
			["Sticker x", x],
			["Sticker y", y],
			["Sticker width", width],
			["Sticker height", height],
		] as const) {
			requireFinite({ label, value });
		}
		if (width <= 0 || height <= 0) {
			throw new Error("Sticker dimensions must be positive");
		}
		return { x, y, width, height };
	}

	const currentWidthPixels =
		current?.width === undefined
			? DEFAULT_STICKER_SIZE_PIXELS
			: (current.width / 100) * shortSide;
	const currentHeightPixels =
		current?.height === undefined
			? DEFAULT_STICKER_SIZE_PIXELS
			: (current.height / 100) * shortSide;
	const currentCenterXPixels =
		current?.x === undefined
			? currentWidthPixels / 2
			: (current.x / 100) * canvasSize.width;
	const currentCenterYPixels =
		current?.y === undefined
			? currentHeightPixels / 2
			: (current.y / 100) * canvasSize.height;
	const widthPixels = patch.width ?? currentWidthPixels;
	const heightPixels = patch.height ?? currentHeightPixels;
	const xPixels = patch.x ?? currentCenterXPixels - currentWidthPixels / 2;
	const yPixels = patch.y ?? currentCenterYPixels - currentHeightPixels / 2;

	for (const [label, value] of [
		["Sticker x", xPixels],
		["Sticker y", yPixels],
		["Sticker width", widthPixels],
		["Sticker height", heightPixels],
	] as const) {
		requireFinite({ label, value });
	}
	if (widthPixels <= 0 || heightPixels <= 0) {
		throw new Error("Sticker dimensions must be positive");
	}

	return {
		x: ((xPixels + widthPixels / 2) / canvasSize.width) * 100,
		y: ((yPixels + heightPixels / 2) / canvasSize.height) * 100,
		width: (widthPixels / shortSide) * 100,
		height: (heightPixels / shortSide) * 100,
	};
}
