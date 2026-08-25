import { useEffect, useMemo, useRef, useState } from "react";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import { cn } from "@/lib/utils";
import {
	createBrowserStickerRuntimeAssetResolver,
	createBrowserStickerRuntimeCanvas,
} from "@/lib/stickers/sticker-runtime-browser-assets";
import { renderStickerRuntimeFrame } from "@/lib/stickers/sticker-runtime-renderer";
import { getStickerRuntimeTimelineWindow } from "@/lib/stickers/sticker-runtime-timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useMediaStore } from "@/stores/media-store";
import type { StickerElement } from "@/types/timeline";

function frameLabel({
	state,
}: {
	state: Exclude<
		Awaited<ReturnType<typeof renderStickerRuntimeFrame>>,
		{ active: false }
	>["state"];
}): string {
	return "frameIndex" in state
		? String(state.frameIndex)
		: state.sourceTimeInVideoSeconds.toFixed(6);
}

export function StickerRuntimeCanvas({
	className,
	currentTime,
	descriptor,
	element,
	mediaItem,
}: {
	className?: string;
	currentTime: number;
	descriptor: StickerRuntimeDescriptor;
	element: StickerElement;
	mediaItem: MediaItem;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [renderedFrame, setRenderedFrame] = useState<string | null>(null);
	const [renderError, setRenderError] = useState<string | null>(null);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const mediaItemsById = useMemo(() => {
		const itemsById = new Map<string, MediaItem>(
			mediaItems.map((item) => [item.id, item])
		);
		itemsById.set(mediaItem.id, mediaItem);
		return itemsById;
	}, [mediaItem, mediaItems]);
	const assets = useMemo(
		() =>
			createBrowserStickerRuntimeAssetResolver({ mediaItem, mediaItemsById }),
		[mediaItem, mediaItemsById]
	);

	useEffect(() => {
		let disposed = false;
		const render = async () => {
			const frame = await renderStickerRuntimeFrame({
				assets,
				createCanvas: createBrowserStickerRuntimeCanvas,
				descriptor,
				timeline: getStickerRuntimeTimelineWindow({ element }),
				timelineTimeSeconds: currentTime,
			});
			if (disposed) return;
			const canvas = canvasRef.current;
			if (!canvas) return;
			if (!frame.active) {
				canvas.width = 1;
				canvas.height = 1;
				setRenderedFrame(null);
				setRenderError(null);
				return;
			}
			canvas.width = frame.width;
			canvas.height = frame.height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Unable to render sticker runtime frame");
			context.clearRect(0, 0, frame.width, frame.height);
			context.drawImage(frame.image, 0, 0, frame.width, frame.height);
			setRenderedFrame(frameLabel({ state: frame.state }));
			setRenderError(null);
		};
		render().catch((error) => {
			if (disposed) return;
			setRenderedFrame(null);
			setRenderError(error instanceof Error ? error.message : String(error));
		});
		return () => {
			disposed = true;
		};
	}, [assets, currentTime, descriptor, element]);

	return (
		<canvas
			ref={canvasRef}
			className={cn("h-full w-full select-none", className)}
			data-sticker-runtime-kind={descriptor.kind}
			data-sticker-runtime-frame={renderedFrame ?? undefined}
			data-sticker-runtime-error={renderError ?? undefined}
			role="img"
			aria-label={mediaItem.name}
			style={{ pointerEvents: "none", imageRendering: "crisp-edges" }}
		/>
	);
}
