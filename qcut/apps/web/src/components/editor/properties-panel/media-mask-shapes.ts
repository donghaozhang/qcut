import {
	Circle,
	Columns2,
	Heart,
	PanelTop,
	PenTool,
	RectangleHorizontal,
	ScanSearch,
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
	{ type: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
	{ type: "ellipse", label: "Ellipse", icon: Circle },
	{ type: "linear", label: "Linear", icon: PanelTop },
	{ type: "mirror", label: "Mirror", icon: Columns2 },
	{ type: "pen", label: "Pen", icon: PenTool },
	{ type: "text", label: "Text", icon: Type },
	{ type: "star", label: "Star", icon: Star },
	{ type: "heart", label: "Heart", icon: Heart },
	{ type: "person", label: "Person", icon: UserRound },
	{ type: "object", label: "Object", icon: ScanSearch },
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
		return { ...mask, text: "Text", fontFamily: "sans-serif" };
	}
	return mask;
}
