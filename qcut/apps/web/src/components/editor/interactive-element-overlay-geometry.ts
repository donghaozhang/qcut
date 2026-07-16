import type { TimelineElement } from "@/types/timeline";

export interface ElementTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
}

export type ElementResizeHandle =
	| "nw"
	| "ne"
	| "sw"
	| "se"
	| "n"
	| "e"
	| "s"
	| "w";

interface ElementOverlayStyle {
	left: string;
	top: string;
	width: string;
	height: string;
	transform: string;
	transformOrigin: string;
}

export function getTimelineElementTransform({
	element,
}: {
	element: TimelineElement;
}): ElementTransform {
	return {
		x: element.x ?? 0,
		y: element.y ?? 0,
		width: element.width ?? 200,
		height: element.height ?? 100,
		rotation: element.rotation ?? 0,
	};
}

export function getInteractiveElementPreviewScale({
	canvasSize,
	previewDimensions,
}: {
	canvasSize: { width: number; height: number };
	previewDimensions: { width: number; height: number };
}): number {
	if (canvasSize.width > 0 && previewDimensions.width > 0) {
		return previewDimensions.width / canvasSize.width;
	}
	if (canvasSize.height > 0 && previewDimensions.height > 0) {
		return previewDimensions.height / canvasSize.height;
	}
	return 1;
}

export function getInteractiveElementOverlayStyle({
	canvasSize,
	previewDimensions,
	transform,
}: {
	canvasSize: { width: number; height: number };
	previewDimensions: { width: number; height: number };
	transform: ElementTransform;
}): ElementOverlayStyle {
	const scale = getInteractiveElementPreviewScale({
		canvasSize,
		previewDimensions,
	});
	const left =
		canvasSize.width > 0 ? 50 + (transform.x / canvasSize.width) * 100 : 50;
	const top =
		canvasSize.height > 0 ? 50 + (transform.y / canvasSize.height) * 100 : 50;

	return {
		left: `${left}%`,
		top: `${top}%`,
		width: `${transform.width * scale}px`,
		height: `${transform.height * scale}px`,
		transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
		transformOrigin: "center",
	};
}

export function resizeInteractiveElementFromCenter({
	delta,
	handle,
	minimumSize = 50,
	transform,
}: {
	delta: { x: number; y: number };
	handle: ElementResizeHandle;
	minimumSize?: number;
	transform: ElementTransform;
}): ElementTransform {
	let { x, y, width, height } = transform;

	if (handle.includes("e")) {
		const nextWidth = Math.max(minimumSize, transform.width + delta.x);
		x += (nextWidth - transform.width) / 2;
		width = nextWidth;
	}
	if (handle.includes("w")) {
		const nextWidth = Math.max(minimumSize, transform.width - delta.x);
		x += (transform.width - nextWidth) / 2;
		width = nextWidth;
	}
	if (handle.includes("s")) {
		const nextHeight = Math.max(minimumSize, transform.height + delta.y);
		y += (nextHeight - transform.height) / 2;
		height = nextHeight;
	}
	if (handle.includes("n")) {
		const nextHeight = Math.max(minimumSize, transform.height - delta.y);
		y += (transform.height - nextHeight) / 2;
		height = nextHeight;
	}

	return { ...transform, x, y, width, height };
}
