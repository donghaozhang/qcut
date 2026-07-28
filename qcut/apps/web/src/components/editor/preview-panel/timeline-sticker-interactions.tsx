import { useCallback, useEffect, type DragEvent } from "react";
import { toast } from "sonner";
import { getValidTextGroupElements } from "@/lib/timeline/text-group-drag-data";
import { timelineStickerIntegration } from "@/lib/stickers/timeline-sticker-integration";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	CreateTextElement,
	TextElement,
	TextItemDragData,
} from "@/types/timeline";

interface DroppedMediaItem {
	id: string;
	name: string;
	type: "image" | "video";
}

type CanvasSize = {
	height: number;
	width: number;
};

type CanvasDropPoint = {
	x: number;
	y: number;
};

type CanvasBounds = Pick<DOMRect, "height" | "left" | "top" | "width">;

type DroppedCanvasItem =
	| { item: DroppedMediaItem; kind: "media" }
	| { item: TextItemDragData; kind: "text" };

export function parseDroppedCanvasItem({
	value,
}: {
	value: string;
}): DroppedCanvasItem | null {
	try {
		const parsed = JSON.parse(value) as Partial<DroppedMediaItem> &
			Partial<TextItemDragData>;
		if (typeof parsed.id !== "string" || typeof parsed.type !== "string") {
			return null;
		}
		if (parsed.type === "image" || parsed.type === "video") {
			return {
				item: {
					id: parsed.id,
					name: typeof parsed.name === "string" ? parsed.name : parsed.id,
					type: parsed.type,
				},
				kind: "media",
			};
		}
		if (parsed.type === "text" && typeof parsed.content === "string") {
			return {
				item: {
					...(parsed as TextItemDragData),
					name: typeof parsed.name === "string" ? parsed.name : parsed.id,
				},
				kind: "text",
			};
		}
		return null;
	} catch {
		return null;
	}
}

export function getCanvasDropPoint({
	bounds,
	canvasSize,
	clientX,
	clientY,
}: {
	bounds: CanvasBounds;
	canvasSize: CanvasSize;
	clientX: number;
	clientY: number;
}): CanvasDropPoint {
	const normalizedX =
		bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0.5;
	const normalizedY =
		bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0.5;
	return {
		x: clamp({
			max: canvasSize.width,
			min: 0,
			value: normalizedX * canvasSize.width,
		}),
		y: clamp({
			max: canvasSize.height,
			min: 0,
			value: normalizedY * canvasSize.height,
		}),
	};
}

export function positionTextTemplateAtCanvasPoint({
	item,
	point,
}: {
	item: TextItemDragData;
	point: CanvasDropPoint;
}): Partial<TextElement> {
	const template = item.textTemplate ?? {};
	const width = finiteNumberOrDefault({
		value: template.width,
		fallback: 420,
	});
	const height = finiteNumberOrDefault({
		value: template.height,
		fallback: 120,
	});
	return {
		...template,
		content: template.content ?? item.content,
		name: template.name ?? item.name,
		type: "text",
		x: Math.round(point.x - width / 2),
		y: Math.round(point.y - height / 2),
	};
}

export function positionTextGroupAtCanvasPoint({
	elements,
	point,
}: {
	elements: readonly CreateTextElement[];
	point: CanvasDropPoint;
}): CreateTextElement[] {
	const [firstElement] = elements;
	if (!firstElement) return [];
	const initialBounds = textElementBounds({ element: firstElement });
	const bounds = elements.reduce((currentBounds, element) => {
		const nextBounds = textElementBounds({ element });
		return {
			maxX: Math.max(currentBounds.maxX, nextBounds.maxX),
			maxY: Math.max(currentBounds.maxY, nextBounds.maxY),
			minX: Math.min(currentBounds.minX, nextBounds.minX),
			minY: Math.min(currentBounds.minY, nextBounds.minY),
		};
	}, initialBounds);
	const offsetX = point.x - (bounds.minX + bounds.maxX) / 2;
	const offsetY = point.y - (bounds.minY + bounds.maxY) / 2;
	return elements.map((element) => ({
		...element,
		x: Math.round(element.x + offsetX),
		y: Math.round(element.y + offsetY),
	}));
}

export function useTimelineStickerDrop({
	canvasSize,
	currentTime,
}: {
	canvasSize: CanvasSize;
	currentTime: number;
}) {
	const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
		if (!event.dataTransfer.types.includes("application/x-media-item")) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}, []);

	const onDrop = useCallback(
		async (event: DragEvent<HTMLDivElement>) => {
			const droppedItem = parseDroppedCanvasItem({
				value: event.dataTransfer.getData("application/x-media-item"),
			});
			if (!droppedItem) return;
			event.preventDefault();

			const bounds = event.currentTarget.getBoundingClientRect();
			if (droppedItem.kind === "text") {
				const point = getCanvasDropPoint({
					bounds,
					canvasSize,
					clientX: event.clientX,
					clientY: event.clientY,
				});
				const packElements = getValidTextGroupElements({
					value: droppedItem.item.textTemplatePack?.elements,
				});
				if (packElements.length > 0) {
					useTimelineStore.getState().addTextGroupAtTime({
						currentTime,
						elements: positionTextGroupAtCanvasPoint({
							elements: packElements,
							point,
						}),
					});
					return;
				}
				useTimelineStore.getState().addTextAtTime(
					positionTextTemplateAtCanvasPoint({
						item: droppedItem.item,
						point,
					}),
					currentTime
				);
				return;
			}

			const position = {
				x: Math.min(
					100,
					Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)
				),
				y: Math.min(
					100,
					Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)
				),
			};
			const overlayStore = useStickersOverlayStore.getState();
			const stickerId = overlayStore.addOverlaySticker(droppedItem.item.id, {
				position,
			});
			const sticker = overlayStore.overlayStickers.get(stickerId);
			if (!sticker) return;

			const result = await timelineStickerIntegration.addStickerToTimeline(
				sticker,
				currentTime,
				5
			);
			if (result.success) return;
			overlayStore.removeOverlaySticker(stickerId);
			toast.error(result.error ?? "Failed to add sticker to timeline");
		},
		[canvasSize, currentTime]
	);

	return { onDragOver, onDrop };
}

function textElementBounds({ element }: { element: CreateTextElement }): {
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
} {
	const width = finiteNumberOrDefault({ value: element.width, fallback: 420 });
	const height = finiteNumberOrDefault({
		value: element.height,
		fallback: 120,
	});
	return {
		maxX: element.x + width,
		maxY: element.y + height,
		minX: element.x,
		minY: element.y,
	};
}

function finiteNumberOrDefault({
	fallback,
	value,
}: {
	fallback: number;
	value: number | undefined;
}): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp({
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

export function TimelineStickerKeyboardController() {
	const selectSticker = useStickersOverlayStore((state) => state.selectSticker);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA"
			) {
				return;
			}
			if (event.key === "Escape") {
				selectSticker(null);
				return;
			}
			const { selectedStickerId, removeOverlaySticker } =
				useStickersOverlayStore.getState();
			if (
				selectedStickerId &&
				(event.key === "Delete" || event.key === "Backspace")
			) {
				event.preventDefault();
				removeOverlaySticker(selectedStickerId);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [selectSticker]);

	return null;
}
