import type { TimelineStore } from "@/stores/timeline/types";
import type { StickerElement, StickerKeyframeProperty } from "@/types/timeline";

export type StickerUpdates = Parameters<
	TimelineStore["updateStickerElement"]
>[2];

export type UpdateStickerProperties = ({
	clearKeyframes,
	history,
	keyframeValues,
	updates,
}: {
	clearKeyframes?: StickerKeyframeProperty[];
	history?: boolean;
	keyframeValues?: Partial<Record<StickerKeyframeProperty, number>>;
	updates: StickerUpdates;
}) => void;

export interface StickerKeyframeControls {
	isKeyframed: ({ property }: { property: StickerKeyframeProperty }) => boolean;
	toggleKeyframe: ({
		property,
		value,
	}: {
		property: StickerKeyframeProperty;
		value: number;
	}) => void;
}

export function clamp({
	max,
	min,
	value,
}: {
	max: number;
	min: number;
	value: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

function finitePositiveOr({
	value,
	fallback,
}: {
	value: number;
	fallback: number;
}): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function aspectSizeUpdates({
	axis,
	height,
	maintainAspectRatio,
	value,
	width,
}: {
	axis: "width" | "height";
	height: number;
	maintainAspectRatio: boolean;
	value: number;
	width: number;
}): Pick<StickerElement, "width" | "height"> {
	const nextValue = clamp({ value, min: 5, max: 100 });
	if (!maintainAspectRatio) {
		return axis === "width"
			? { width: nextValue, height }
			: { width, height: nextValue };
	}

	const safeWidth = finitePositiveOr({ value: width, fallback: 1 });
	const safeHeight = finitePositiveOr({ value: height, fallback: 1 });
	if (axis === "width") {
		const ratio = safeHeight / safeWidth;
		const nextHeight = nextValue * ratio;
		if (nextHeight > 100) return { width: 100 / ratio, height: 100 };
		if (nextHeight < 5) return { width: 5 / ratio, height: 5 };
		return { width: nextValue, height: nextHeight };
	}
	const ratio = safeWidth / safeHeight;
	const nextWidth = nextValue * ratio;
	if (nextWidth > 100) return { width: 100, height: 100 / ratio };
	if (nextWidth < 5) return { width: 5, height: 5 / ratio };
	return { width: nextWidth, height: nextValue };
}

export function alignedPosition({
	alignment,
	canvasLength,
	size,
	shortEdge,
}: {
	alignment: "start" | "center" | "end";
	canvasLength: number;
	size: number;
	shortEdge: number;
}): number {
	if (alignment === "center") return 50;
	const canvasPercent =
		(finitePositiveOr({ value: size, fallback: 15 }) *
			finitePositiveOr({ value: shortEdge, fallback: 1 })) /
		finitePositiveOr({ value: canvasLength, fallback: 1 });
	return alignment === "start" ? canvasPercent / 2 : 100 - canvasPercent / 2;
}
