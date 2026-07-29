import { resolveTextStyle } from "@/lib/text/text-style";
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
	if (element.type === "text") {
		// Mirror the renderer's fallbacks: writing a different default back to
		// the store (200x100 vs the rendered 640x180) rewraps the text on the
		// first interaction.
		const style = resolveTextStyle(element);
		return {
			x: element.x ?? 0,
			y: element.y ?? 0,
			width: style.width,
			height: style.height,
			rotation: element.rotation ?? 0,
		};
	}
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

export interface ElementContentBounds {
	/** Content-rect center offset from the element center, project px, unrotated. */
	offsetX: number;
	offsetY: number;
	width: number;
	height: number;
}

export function getInteractiveElementOverlayStyle({
	canvasSize,
	previewDimensions,
	transform,
	contentBounds,
}: {
	canvasSize: { width: number; height: number };
	previewDimensions: { width: number; height: number };
	transform: ElementTransform;
	contentBounds?: ElementContentBounds;
}): ElementOverlayStyle {
	const scale = getInteractiveElementPreviewScale({
		canvasSize,
		previewDimensions,
	});
	// The element rotates about its own center, so a content rect whose center
	// is offset from the element center orbits that pivot when rotated.
	const radians = ((transform.rotation || 0) * Math.PI) / 180;
	const offsetX = contentBounds?.offsetX ?? 0;
	const offsetY = contentBounds?.offsetY ?? 0;
	const rotatedOffsetX =
		offsetX * Math.cos(radians) - offsetY * Math.sin(radians);
	const rotatedOffsetY =
		offsetX * Math.sin(radians) + offsetY * Math.cos(radians);
	const centerX = transform.x + rotatedOffsetX;
	const centerY = transform.y + rotatedOffsetY;
	const width = contentBounds?.width ?? transform.width;
	const height = contentBounds?.height ?? transform.height;
	const left = canvasSize.width > 0 ? 50 + (centerX / canvasSize.width) * 100 : 50;
	const top =
		canvasSize.height > 0 ? 50 + (centerY / canvasSize.height) * 100 : 50;

	return {
		left: `${left}%`,
		top: `${top}%`,
		width: `${width * scale}px`,
		height: `${height * scale}px`,
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
