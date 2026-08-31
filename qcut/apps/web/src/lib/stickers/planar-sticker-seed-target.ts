import type {
	MediaElement,
	NormalizedPoint,
	PlanarQuad,
	StickerElement,
} from "@/types/timeline";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { resolveStickerGeometry } from "./sticker-geometry";
import { DEFAULT_MEDIA_PERSPECTIVE } from "@/lib/video/video-properties";
import { mapPlanarCanvasQuadToSource } from "./planar-source-canvas-transform";
import { resolveTimelineStickerVisualAtTime } from "./timeline-sticker-visual";

function rotateAroundCenter({
	center,
	point,
	rotation,
}: {
	center: NormalizedPoint;
	point: NormalizedPoint;
	rotation: number;
}): NormalizedPoint {
	const radians = (rotation * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const deltaX = point.x - center.x;
	const deltaY = point.y - center.y;
	return {
		x: center.x + deltaX * cosine - deltaY * sine,
		y: center.y + deltaX * sine + deltaY * cosine,
	};
}

function stickerCanvasQuad({
	canvasHeight,
	canvasWidth,
	sticker,
}: {
	canvasHeight: number;
	canvasWidth: number;
	sticker: OverlaySticker;
}): PlanarQuad {
	const geometry = resolveStickerGeometry({
		canvasHeight,
		canvasWidth,
		position: sticker.position,
		size: sticker.size,
	});
	const perspective = sticker.perspective ?? DEFAULT_MEDIA_PERSPECTIVE;
	const center = { x: geometry.centerX, y: geometry.centerY };
	const projectCorner = ({ x, y }: NormalizedPoint): NormalizedPoint =>
		rotateAroundCenter({
			center,
			point: {
				x: geometry.left + x * geometry.pixelWidth,
				y: geometry.top + y * geometry.pixelHeight,
			},
			rotation: sticker.rotation,
		});
	return {
		topLeft: projectCorner({
			x: perspective.topLeftX,
			y: perspective.topLeftY,
		}),
		topRight: projectCorner({
			x: perspective.topRightX,
			y: perspective.topRightY,
		}),
		bottomRight: projectCorner({
			x: perspective.bottomRightX,
			y: perspective.bottomRightY,
		}),
		bottomLeft: projectCorner({
			x: perspective.bottomLeftX,
			y: perspective.bottomLeftY,
		}),
	};
}

export function buildStickerPlanarSeedTargetQuad({
	canvasHeight,
	canvasWidth,
	currentTime,
	fps,
	sourceDisplayHeight,
	sourceDisplayWidth,
	sourceElement,
	sticker,
}: {
	canvasHeight: number;
	canvasWidth: number;
	currentTime: number;
	fps: number;
	sourceDisplayHeight: number;
	sourceDisplayWidth: number;
	sourceElement: MediaElement;
	sticker: OverlaySticker;
}): PlanarQuad | undefined {
	return mapPlanarCanvasQuadToSource({
		canvasHeight,
		canvasWidth,
		currentTime,
		fps,
		quad: stickerCanvasQuad({ canvasHeight, canvasWidth, sticker }),
		sourceDisplayHeight,
		sourceDisplayWidth,
		sourceElement,
	});
}

export function resolvePlanarSourceDisplaySize({
	sourceElement,
	sourceMedia,
}: {
	sourceElement: Pick<MediaElement, "height" | "width">;
	sourceMedia: { height?: number; width?: number };
}): { height: number; width: number } {
	return {
		height: sourceMedia.height ?? sourceElement.height ?? 1080,
		width: sourceMedia.width ?? sourceElement.width ?? 1920,
	};
}

export function buildTimelineStickerPlanarSeedTargetQuad({
	canvasSize,
	currentTime,
	fps,
	sourceDisplaySize,
	sourceElement,
	stickerElement,
}: {
	canvasSize: { height: number; width: number };
	currentTime: number;
	fps: number;
	sourceDisplaySize?: { height: number; width: number };
	sourceElement?: MediaElement;
	stickerElement: StickerElement;
}): PlanarQuad | undefined {
	if (!sourceElement || !sourceDisplaySize) return undefined;
	return buildStickerPlanarSeedTargetQuad({
		canvasHeight: canvasSize.height,
		canvasWidth: canvasSize.width,
		currentTime,
		fps,
		sourceDisplayHeight: sourceDisplaySize.height,
		sourceDisplayWidth: sourceDisplaySize.width,
		sourceElement,
		sticker: resolveTimelineStickerVisualAtTime({
			currentTime,
			element: stickerElement,
			fps,
		}),
	});
}
