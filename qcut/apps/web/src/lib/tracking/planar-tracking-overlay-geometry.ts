import type { NormalizedPoint } from "@qcut/editor-core";

export interface PlanarFitMapping {
	displayHeight: number;
	displayWidth: number;
	offsetX: number;
	offsetY: number;
}

export function getPlanarFitMapping({
	containerHeight,
	containerWidth,
	fitMode,
	sourceHeight,
	sourceWidth,
}: {
	containerHeight: number;
	containerWidth: number;
	fitMode: "contain" | "cover" | "fill";
	sourceHeight: number;
	sourceWidth: number;
}): PlanarFitMapping {
	if (fitMode === "fill") {
		return {
			displayHeight: containerHeight,
			displayWidth: containerWidth,
			offsetX: 0,
			offsetY: 0,
		};
	}
	const safeSourceWidth = Math.max(1, sourceWidth);
	const safeSourceHeight = Math.max(1, sourceHeight);
	const scale =
		fitMode === "contain"
			? Math.min(
					containerWidth / safeSourceWidth,
					containerHeight / safeSourceHeight
				)
			: Math.max(
					containerWidth / safeSourceWidth,
					containerHeight / safeSourceHeight
				);
	const displayWidth = safeSourceWidth * scale;
	const displayHeight = safeSourceHeight * scale;
	return {
		displayHeight,
		displayWidth,
		offsetX: (containerWidth - displayWidth) / 2,
		offsetY: (containerHeight - displayHeight) / 2,
	};
}

export function sourcePointToPlanarContainer({
	mapping,
	point,
}: {
	mapping: PlanarFitMapping;
	point: NormalizedPoint;
}): { x: number; y: number } {
	return {
		x: mapping.offsetX + point.x * mapping.displayWidth,
		y: mapping.offsetY + point.y * mapping.displayHeight,
	};
}

export function planarContainerPointToSource({
	mapping,
	point,
}: {
	mapping: PlanarFitMapping;
	point: { x: number; y: number };
}): NormalizedPoint {
	return {
		x: (point.x - mapping.offsetX) / Math.max(1, mapping.displayWidth),
		y: (point.y - mapping.offsetY) / Math.max(1, mapping.displayHeight),
	};
}
