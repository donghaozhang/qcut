import {
	Brush,
	Circle,
	Columns2,
	Heart,
	PanelTop,
	PenTool,
	RectangleHorizontal,
	Square,
	Star,
	Type,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import { generateUUID } from "@/lib/utils";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import type {
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaMaskType,
} from "@/types/timeline";

export type AddableMaskType = Exclude<MediaMaskType, "none">;

export const MASK_SHAPES: Array<{
	type: AddableMaskType;
	label: string;
	icon: LucideIcon;
}> = [
	{ type: "linear", label: "线性", icon: PanelTop },
	{ type: "mirror", label: "镜面", icon: Columns2 },
	{ type: "ellipse", label: "圆形", icon: Circle },
	{ type: "rectangle", label: "矩形", icon: RectangleHorizontal },
	{ type: "text", label: "文字", icon: Type },
	{ type: "object", label: "抠像", icon: Brush },
	{ type: "pen", label: "钢笔", icon: PenTool },
	{ type: "star", label: "星形", icon: Star },
	{ type: "heart", label: "爱心", icon: Heart },
	{ type: "person", label: "人物", icon: UserRound },
];

export const MASK_PROPERTY_FALLBACKS: Record<
	MediaMaskKeyframeProperty,
	number
> = {
	centerX: 0.5,
	centerY: 0.5,
	width: 0.8,
	height: 0.8,
	rotation: 0,
	feather: 0,
	roundness: 0,
	expansion: 0,
	opacity: 1,
};

export function maskIcon({ type }: { type: MediaMaskType }): LucideIcon {
	return MASK_SHAPES.find((shape) => shape.type === type)?.icon ?? Square;
}

export function createMaskForShape({
	type,
	index,
}: {
	type: AddableMaskType;
	index: number;
}): MediaMask {
	const id = `mask-${generateUUID()}`;
	const mask = createMediaMask({ id, type, index });
	if (type === "pen") {
		return {
			...mask,
			points: [
				{
					id: `${id}-point-1`,
					x: 0.5,
					y: 0.15,
					handleIn: { x: 0.35, y: 0.15 },
					handleOut: { x: 0.65, y: 0.15 },
				},
				{
					id: `${id}-point-2`,
					x: 0.85,
					y: 0.5,
					handleIn: { x: 0.85, y: 0.35 },
					handleOut: { x: 0.85, y: 0.65 },
				},
				{
					id: `${id}-point-3`,
					x: 0.5,
					y: 0.85,
					handleIn: { x: 0.65, y: 0.85 },
					handleOut: { x: 0.35, y: 0.85 },
				},
				{
					id: `${id}-point-4`,
					x: 0.15,
					y: 0.5,
					handleIn: { x: 0.15, y: 0.65 },
					handleOut: { x: 0.15, y: 0.35 },
				},
			],
			closed: true,
		};
	}
	if (type === "text") {
		return { ...mask, text: "文本", fontFamily: "sans-serif" };
	}
	return mask;
}

export function changeMediaMaskShape({
	mask,
	type,
	index,
}: {
	mask: MediaMask;
	type: AddableMaskType;
	index: number;
}): MediaMask {
	const {
		points: previousPoints,
		text: previousText,
		fontFamily: previousFontFamily,
		...shared
	} = mask;
	if (type === "pen") {
		const defaults = createMaskForShape({ type, index });
		return {
			...shared,
			type,
			text: undefined,
			fontFamily: undefined,
			points:
				mask.type === "pen" && previousPoints?.length
					? previousPoints
					: defaults.points,
		};
	}
	if (type === "text") {
		return {
			...shared,
			type,
			points: undefined,
			text: mask.type === "text" ? (previousText ?? "文本") : "文本",
			fontFamily:
				mask.type === "text"
					? (previousFontFamily ?? "sans-serif")
					: "sans-serif",
		};
	}
	return {
		...shared,
		type,
		points: undefined,
		text: undefined,
		fontFamily: undefined,
	};
}
