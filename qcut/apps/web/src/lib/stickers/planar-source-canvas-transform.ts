import {
	buildPlanarHomography,
	projectPlanarPoint,
	projectPlanarQuad,
	UNIT_PLANAR_QUAD,
} from "@qcut/editor-core";
import type {
	MediaElement,
	MediaPerspective,
	NormalizedPoint,
	PlanarQuad,
} from "@/types/timeline";
import { getPlanarFitMapping } from "@/lib/tracking/planar-tracking-overlay-geometry";
import { resolveMediaKeyframes } from "@/lib/video/video-properties";

const QUAD_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;

function sourcePointToCanvas({
	canvasHeight,
	canvasWidth,
	fitMode,
	perspective,
	point,
	sourceHeight,
	sourceWidth,
}: {
	canvasHeight: number;
	canvasWidth: number;
	fitMode: "contain" | "cover" | "fill";
	perspective: MediaPerspective;
	point: NormalizedPoint;
	sourceHeight: number;
	sourceWidth: number;
}): NormalizedPoint {
	const mapping = getPlanarFitMapping({
		containerHeight: canvasHeight,
		containerWidth: canvasWidth,
		fitMode,
		sourceHeight,
		sourceWidth,
	});
	const fitted = {
		x: mapping.offsetX + point.x * mapping.displayWidth,
		y: mapping.offsetY + point.y * mapping.displayHeight,
	};
	const matrix = buildPlanarHomography({
		source: {
			topLeft: { x: 0, y: 0 },
			topRight: { x: canvasWidth, y: 0 },
			bottomRight: { x: canvasWidth, y: canvasHeight },
			bottomLeft: { x: 0, y: canvasHeight },
		},
		destination: {
			topLeft: {
				x: perspective.topLeftX * canvasWidth,
				y: perspective.topLeftY * canvasHeight,
			},
			topRight: {
				x: perspective.topRightX * canvasWidth,
				y: perspective.topRightY * canvasHeight,
			},
			bottomRight: {
				x: perspective.bottomRightX * canvasWidth,
				y: perspective.bottomRightY * canvasHeight,
			},
			bottomLeft: {
				x: perspective.bottomLeftX * canvasWidth,
				y: perspective.bottomLeftY * canvasHeight,
			},
		},
	});
	return matrix
		? (projectPlanarPoint({ point: fitted, matrix }) ?? fitted)
		: fitted;
}

function applyMediaTransform({
	canvasHeight,
	canvasWidth,
	flipHorizontal,
	flipVertical,
	point,
	rotation,
	scaleX,
	scaleY,
	x,
	y,
}: {
	canvasHeight: number;
	canvasWidth: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
	point: NormalizedPoint;
	rotation: number;
	scaleX: number;
	scaleY: number;
	x: number;
	y: number;
}): NormalizedPoint {
	const centerX = canvasWidth / 2;
	const centerY = canvasHeight / 2;
	const radians = (rotation * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const deltaX = (point.x - centerX) * scaleX * (flipHorizontal ? -1 : 1);
	const deltaY = (point.y - centerY) * scaleY * (flipVertical ? -1 : 1);
	return {
		x: centerX + x + deltaX * cosine - deltaY * sine,
		y: centerY + y + deltaX * sine + deltaY * cosine,
	};
}

export function mapPlanarSourceQuadToCanvas({
	canvasHeight,
	canvasWidth,
	currentTime,
	fps,
	quad,
	sourceDisplayHeight,
	sourceDisplayWidth,
	sourceElement,
}: {
	canvasHeight: number;
	canvasWidth: number;
	currentTime: number;
	fps: number;
	quad: PlanarQuad;
	sourceDisplayHeight: number;
	sourceDisplayWidth: number;
	sourceElement: MediaElement;
}): PlanarQuad {
	const visual = resolveMediaKeyframes({
		element: sourceElement,
		currentTime,
		fps,
	});
	return Object.fromEntries(
		QUAD_KEYS.map((key) => {
			const fitted = sourcePointToCanvas({
				canvasHeight,
				canvasWidth,
				fitMode: visual.fitMode,
				perspective: visual.perspective,
				point: quad[key],
				sourceHeight: sourceDisplayHeight,
				sourceWidth: sourceDisplayWidth,
			});
			return [
				key,
				applyMediaTransform({
					canvasHeight,
					canvasWidth,
					flipHorizontal: visual.flipHorizontal,
					flipVertical: visual.flipVertical,
					point: fitted,
					rotation: visual.rotation,
					scaleX: visual.scaleX,
					scaleY: visual.scaleY,
					x: visual.x,
					y: visual.y,
				}),
			];
		})
	) as unknown as PlanarQuad;
}

export function mapPlanarCanvasQuadToSource({
	canvasHeight,
	canvasWidth,
	currentTime,
	fps,
	quad,
	sourceDisplayHeight,
	sourceDisplayWidth,
	sourceElement,
}: {
	canvasHeight: number;
	canvasWidth: number;
	currentTime: number;
	fps: number;
	quad: PlanarQuad;
	sourceDisplayHeight: number;
	sourceDisplayWidth: number;
	sourceElement: MediaElement;
}): PlanarQuad | undefined {
	const sourceCanvasQuad = mapPlanarSourceQuadToCanvas({
		canvasHeight,
		canvasWidth,
		currentTime,
		fps,
		quad: UNIT_PLANAR_QUAD,
		sourceDisplayHeight,
		sourceDisplayWidth,
		sourceElement,
	});
	const inverse = buildPlanarHomography({
		source: sourceCanvasQuad,
		destination: UNIT_PLANAR_QUAD,
	});
	return inverse
		? (projectPlanarQuad({ quad, matrix: inverse }) ?? undefined)
		: undefined;
}
