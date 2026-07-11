import { useCallback, useEffect, type DragEvent } from "react";
import { toast } from "sonner";
import { timelineStickerIntegration } from "@/lib/stickers/timeline-sticker-integration";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";

interface DroppedMediaItem {
	id: string;
	type: "image" | "video";
}

function parseDroppedMediaItem({
	value,
}: {
	value: string;
}): DroppedMediaItem | null {
	try {
		const parsed = JSON.parse(value) as Partial<DroppedMediaItem>;
		if (
			typeof parsed.id !== "string" ||
			(parsed.type !== "image" && parsed.type !== "video")
		) {
			return null;
		}
		return { id: parsed.id, type: parsed.type };
	} catch {
		return null;
	}
}

export function useTimelineStickerDrop({
	currentTime,
}: {
	currentTime: number;
}) {
	const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
		if (!event.dataTransfer.types.includes("application/x-media-item")) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}, []);

	const onDrop = useCallback(
		async (event: DragEvent<HTMLDivElement>) => {
			const mediaItem = parseDroppedMediaItem({
				value: event.dataTransfer.getData("application/x-media-item"),
			});
			if (!mediaItem) return;
			event.preventDefault();

			const bounds = event.currentTarget.getBoundingClientRect();
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
			const stickerId = overlayStore.addOverlaySticker(mediaItem.id, {
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
		[currentTime]
	);

	return { onDragOver, onDrop };
}

export function TimelineStickerKeyboardController() {
	const selectedStickerId = useStickersOverlayStore(
		(state) => state.selectedStickerId
	);
	const selectSticker = useStickersOverlayStore((state) => state.selectSticker);
	const removeOverlaySticker = useStickersOverlayStore(
		(state) => state.removeOverlaySticker
	);

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
	}, [removeOverlaySticker, selectSticker, selectedStickerId]);

	return null;
}
