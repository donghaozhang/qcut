import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MediaElement } from "@/types/timeline";
import {
	DEFAULT_MEDIA_PERSPECTIVE,
	resolveMediaKeyframes,
} from "@/lib/video/video-properties";
import type { PerspectiveCorner } from "./media-perspective-geometry";
import type {
	CanvasBounds,
	CanvasPoint,
	CropSide,
	MediaTransformSnapshot,
	ResizeHandle,
} from "./media-transform-geometry";
import {
	buildMediaCanvasUpdate,
	type MediaCanvasMutation,
} from "./media-transform-update";

export interface SelectedMediaTransformTarget {
	trackId: string;
	element: MediaElement;
}

export type InteractionKind =
	| "drag"
	| "resize"
	| "rotate"
	| "crop"
	| "perspective";

export interface InteractionState {
	kind: InteractionKind;
	items: MediaTransformSnapshot[];
	targets: SelectedMediaTransformTarget[];
	bounds: CanvasBounds;
	startPoint: CanvasPoint;
	handle?: ResizeHandle;
	cropSide?: CropSide;
	corner?: PerspectiveCorner;
	startAngle: number;
	currentTime: number;
	fps: number;
}

export interface PendingUpdate {
	trackId: string;
	elementId: string;
	updates: ReturnType<typeof buildMediaCanvasUpdate>;
}

export function canvasPointFromClient({
	clientX,
	clientY,
	previewRect,
	canvasSize,
}: {
	clientX: number;
	clientY: number;
	previewRect: DOMRect;
	canvasSize: { width: number; height: number };
}): CanvasPoint {
	return {
		x:
			((clientX - previewRect.left) / previewRect.width) * canvasSize.width -
			canvasSize.width / 2,
		y:
			((clientY - previewRect.top) / previewRect.height) * canvasSize.height -
			canvasSize.height / 2,
	};
}

export function pointerAngle({
	point,
	center,
}: {
	point: CanvasPoint;
	center: CanvasPoint;
}) {
	return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function snapshotsFromTargets({
	targets,
	currentTime,
	fps,
}: {
	targets: SelectedMediaTransformTarget[];
	currentTime: number;
	fps: number;
}): MediaTransformSnapshot[] {
	return targets.map(({ trackId, element }) => {
		// Editors read stored values: a switched-off 变形 section must not make
		// a plain drag write default corners back over the user's warp.
		const visual = resolveMediaKeyframes({
			element,
			currentTime,
			fps,
			applySectionToggles: false,
		});
		return {
			trackId,
			elementId: element.id,
			x: visual.x,
			y: visual.y,
			scaleX: visual.scaleX,
			scaleY: visual.scaleY,
			rotation: visual.rotation,
			maintainAspectRatio: visual.maintainAspectRatio,
			flipHorizontal: visual.flipHorizontal,
			flipVertical: visual.flipVertical,
			crop: visual.crop,
			perspective: visual.perspective ?? DEFAULT_MEDIA_PERSPECTIVE,
		};
	});
}

/**
 * Only the interaction that edits a field writes it back, so a move never
 * touches crop or corner keyframes it did not change.
 */
export function mutationFromSnapshot({
	item,
	kind,
}: {
	item: MediaTransformSnapshot;
	kind: InteractionKind;
}): MediaCanvasMutation {
	if (kind === "perspective") return { perspective: item.perspective };
	if (kind === "crop") return { crop: item.crop };
	return {
		x: item.x,
		y: item.y,
		scaleX: item.scaleX,
		scaleY: item.scaleY,
		rotation: item.rotation,
	};
}

export function pendingUpdatesFromSnapshots({
	items,
	interaction,
}: {
	items: MediaTransformSnapshot[];
	interaction: InteractionState;
}): PendingUpdate[] {
	return items.flatMap((item) => {
		const target = interaction.targets.find(
			(candidate) => candidate.element.id === item.elementId
		);
		if (!target) return [];
		return [
			{
				trackId: target.trackId,
				elementId: target.element.id,
				updates: buildMediaCanvasUpdate({
					element: target.element,
					mutation: mutationFromSnapshot({ item, kind: interaction.kind }),
					currentTime: interaction.currentTime,
					fps: interaction.fps,
				}),
			},
		];
	});
}

export function keyboardPoint({
	event,
	step,
}: {
	event: ReactKeyboardEvent;
	step: number;
}): CanvasPoint | null {
	if (event.key === "ArrowLeft") return { x: -step, y: 0 };
	if (event.key === "ArrowRight") return { x: step, y: 0 };
	if (event.key === "ArrowUp") return { x: 0, y: -step };
	if (event.key === "ArrowDown") return { x: 0, y: step };
	return null;
}
