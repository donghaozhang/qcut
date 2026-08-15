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

export interface ElementContentBoundsSnapshot {
	bounds: ElementContentBounds;
	transform: ElementTransform;
}

function rotateElementContentOffset({
	bounds,
	rotation,
}: {
	bounds: ElementContentBounds;
	rotation: number;
}): { x: number; y: number } {
	const radians = (rotation * Math.PI) / 180;
	return {
		x: bounds.offsetX * Math.cos(radians) - bounds.offsetY * Math.sin(radians),
		y: bounds.offsetX * Math.sin(radians) + bounds.offsetY * Math.cos(radians),
	};
}

export function scaleElementContentBounds({
	bounds,
	sourceTransform,
	targetTransform,
}: {
	bounds: ElementContentBounds;
	sourceTransform: ElementTransform;
	targetTransform: ElementTransform;
}): ElementContentBounds {
	const scaleX =
		sourceTransform.width > 0
			? targetTransform.width / sourceTransform.width
			: 1;
	const scaleY =
		sourceTransform.height > 0
			? targetTransform.height / sourceTransform.height
			: 1;
	return {
		offsetX: bounds.offsetX * scaleX,
		offsetY: bounds.offsetY * scaleY,
		width: bounds.width * scaleX,
		height: bounds.height * scaleY,
	};
}

export function preserveInteractiveElementContentCenter({
	contentBounds,
	sourceTransform,
	targetTransform,
}: {
	contentBounds?: ElementContentBounds;
	sourceTransform: ElementTransform;
	targetTransform: ElementTransform;
}): ElementTransform {
	if (!contentBounds) return targetTransform;

	const targetBounds = scaleElementContentBounds({
		bounds: contentBounds,
		sourceTransform,
		targetTransform,
	});
	const sourceOffset = rotateElementContentOffset({
		bounds: contentBounds,
		rotation: sourceTransform.rotation,
	});
	const targetOffset = rotateElementContentOffset({
		bounds: targetBounds,
		rotation: targetTransform.rotation,
	});
	return {
		...targetTransform,
		x: sourceTransform.x + sourceOffset.x - targetOffset.x,
		y: sourceTransform.y + sourceOffset.y - targetOffset.y,
	};
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
	const rotatedOffset = contentBounds
		? rotateElementContentOffset({
				bounds: contentBounds,
				rotation: transform.rotation,
			})
		: { x: 0, y: 0 };
	const centerX = transform.x + rotatedOffset.x;
	const centerY = transform.y + rotatedOffset.y;
	const width = contentBounds?.width ?? transform.width;
	const height = contentBounds?.height ?? transform.height;
	const left =
		canvasSize.width > 0 ? 50 + (centerX / canvasSize.width) * 100 : 50;
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

export function resizeInteractiveElementProportionallyFromCenter({
	contentBounds,
	delta,
	handle,
	minimumSize = 50,
	transform,
}: {
	contentBounds?: ElementContentBounds;
	delta: { x: number; y: number };
	handle: Extract<ElementResizeHandle, "nw" | "ne" | "sw" | "se">;
	minimumSize?: number;
	transform: ElementTransform;
}): ElementTransform {
	const localCornerX =
		(contentBounds?.offsetX ?? 0) +
		(handle.includes("e") ? 1 : -1) *
			((contentBounds?.width ?? transform.width) / 2);
	const localCornerY =
		(contentBounds?.offsetY ?? 0) +
		(handle.includes("s") ? 1 : -1) *
			((contentBounds?.height ?? transform.height) / 2);
	const radians = (transform.rotation * Math.PI) / 180;
	const cornerX =
		localCornerX * Math.cos(radians) - localCornerY * Math.sin(radians);
	const cornerY =
		localCornerX * Math.sin(radians) + localCornerY * Math.cos(radians);
	const cornerLengthSquared = localCornerX ** 2 + localCornerY ** 2;
	if (cornerLengthSquared === 0) return transform;

	const projectedScale =
		1 + (delta.x * cornerX + delta.y * cornerY) / cornerLengthSquared;
	const minimumScale = Math.max(
		minimumSize / transform.width,
		minimumSize / transform.height
	);
	const scale = Math.max(minimumScale, projectedScale);
	const targetTransform = {
		...transform,
		width: transform.width * scale,
		height: transform.height * scale,
	};
	return preserveInteractiveElementContentCenter({
		contentBounds,
		sourceTransform: transform,
		targetTransform,
	});
}
