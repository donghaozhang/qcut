/**
 * StickerElement Component
 *
 * Individual draggable sticker element with selection and interaction support.
 */

import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type MouseEvent,
	type RefObject,
	type TouchEvent,
	type WheelEvent,
} from "react";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/debug/debug-config";
import { useStickerDrag } from "./hooks/useStickerDrag";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { ResizeHandles } from "./ResizeHandles";
import { StickerControls, SimpleStickerControls } from "./StickerControls";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement as TimelineStickerElement } from "@/types/timeline";
import {
	getStickerCssGeometry,
	resolveStickerGeometry,
} from "@/lib/stickers/sticker-geometry";
import { getStickerClipAnimationState } from "@/lib/stickers/sticker-clip-animation";
import { buildCssPerspectiveTransform } from "@/lib/video/video-perspective";
import { DEFAULT_MEDIA_PERSPECTIVE } from "@/lib/video/video-properties";

interface StickerElementProps {
	sticker: OverlaySticker;
	mediaItem: MediaItem;
	canvasRef: RefObject<HTMLDivElement | null>;
	renderMode?: "full" | "interaction" | "visual";
	animationElement?: TimelineStickerElement;
	currentTime?: number;
}

/**
 * Draggable sticker element with full interaction support
 */
export const StickerElement = memo<StickerElementProps>(
	({
		sticker,
		mediaItem,
		canvasRef,
		renderMode = "full",
		animationElement,
		currentTime = 0,
	}) => {
		const elementRef = useRef<HTMLDivElement>(null);
		const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

		useLayoutEffect(() => {
			let disposed = false;
			let observer: ResizeObserver | null = null;
			const updateCanvasSize = () => {
				const canvas = canvasRef.current;
				if (!canvas) return;
				const bounds = canvas.getBoundingClientRect();
				setCanvasSize((previous) =>
					previous.width === bounds.width && previous.height === bounds.height
						? previous
						: { width: bounds.width, height: bounds.height }
				);
			};
			const attach = () => {
				if (disposed) return;
				const canvas = canvasRef.current;
				if (!canvas) {
					// When the ref div mounts in the same commit as this element, the
					// parent ref is not attached yet — retry on the next frame or the
					// canvas is never measured and the sticker collapses to 0x0 at
					// the top-left corner.
					requestAnimationFrame(attach);
					return;
				}
				updateCanvasSize();
				observer =
					typeof ResizeObserver === "undefined"
						? null
						: new ResizeObserver(updateCanvasSize);
				observer?.observe(canvas);
			};
			attach();
			window.addEventListener("resize", updateCanvasSize);
			return () => {
				disposed = true;
				observer?.disconnect();
				window.removeEventListener("resize", updateCanvasSize);
			};
		}, [canvasRef]);

		// Store hooks
		const {
			selectedStickerId,
			selectSticker,
			updateOverlaySticker,
			saveHistorySnapshot,
		} = useStickersOverlayStore();
		const clearSelectedElements = useTimelineStore(
			(state) => state.clearSelectedElements
		);
		const isSelected = selectedStickerId === sticker.id;
		const canInteract = renderMode !== "visual";
		const showsMedia = renderMode !== "interaction";

		// Drag functionality
		const {
			isDragging,
			handleMouseDown,
			handleTouchStart,
			handleTouchMove,
			handleTouchEnd,
		} = useStickerDrag(sticker.id, elementRef, canvasRef);

		/**
		 * Handle element click for selection
		 */
		const handleClick = (e: MouseEvent<HTMLDivElement>) => {
			e.stopPropagation();
			if (!isDragging) {
				selectSticker(sticker.id);
			}
		};

		/**
		 * Combined mouse down handler
		 */
		const handleMouseDownWrapper = (e: MouseEvent<HTMLDivElement>) => {
			debugLog(
				"[StickerElement] 🎯 MOUSE DOWN WRAPPER: Called for sticker",
				sticker.id
			);
			clearSelectedElements();
			selectSticker(sticker.id);
			handleMouseDown(e);
		};

		const handleTouchStartWrapper = (event: TouchEvent<HTMLDivElement>) => {
			clearSelectedElements();
			selectSticker(sticker.id);
			handleTouchStart(event);
		};

		const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			clearSelectedElements();
			selectSticker(sticker.id);
		};

		/**
		 * Handle scroll-wheel zoom for selected sticker.
		 * Saves a history snapshot on the first wheel tick of each gesture
		 * (debounced by 300ms of inactivity) so Ctrl+Z undoes the whole zoom.
		 */
		const wheelSnapshotSaved = useRef(false);
		const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
			undefined
		);
		useEffect(() => {
			return () => clearTimeout(wheelTimeoutRef.current);
		}, []);
		const handleWheel = useCallback(
			(e: WheelEvent<HTMLDivElement>) => {
				if (!isSelected) return;
				e.preventDefault();
				e.stopPropagation();

				// Save history once per zoom gesture
				if (!wheelSnapshotSaved.current) {
					saveHistorySnapshot();
					wheelSnapshotSaved.current = true;
				}
				clearTimeout(wheelTimeoutRef.current);
				wheelTimeoutRef.current = setTimeout(() => {
					wheelSnapshotSaved.current = false;
				}, 300);

				const scaleDelta = e.deltaY < 0 ? 1.05 : 0.95;
				const shortSide = Math.min(canvasSize.width, canvasSize.height);
				const centerX = (sticker.position.x / 100) * canvasSize.width;
				const centerY = (sticker.position.y / 100) * canvasSize.height;
				const maxWidth =
					shortSide > 0
						? (Math.min(centerX, canvasSize.width - centerX) * 200) / shortSide
						: 100;
				const maxHeight =
					shortSide > 0
						? (Math.min(centerY, canvasSize.height - centerY) * 200) / shortSide
						: 100;

				const newWidth = Math.max(
					5,
					Math.min(maxWidth, sticker.size.width * scaleDelta)
				);
				const newHeight = Math.max(
					5,
					Math.min(maxHeight, sticker.size.height * scaleDelta)
				);

				updateOverlaySticker(sticker.id, {
					size: { width: newWidth, height: newHeight },
				});
			},
			[
				canvasSize,
				isSelected,
				saveHistorySnapshot,
				sticker,
				updateOverlaySticker,
			]
		);

		/**
		 * Render media content based on type
		 */
		const mediaFitClass = sticker.maintainAspectRatio
			? "object-contain"
			: "object-fill";
		const renderMediaContent = () => {
			switch (mediaItem.type) {
				case "image":
					return (
						<img
							src={mediaItem.url}
							alt={mediaItem.name}
							className={cn("h-full w-full select-none", mediaFitClass)}
							draggable={false}
							style={{
								pointerEvents: "none",
								imageRendering: "crisp-edges", // Better quality for small images
							}}
						/>
					);

				case "video":
					return (
						<video
							src={mediaItem.url}
							className={cn("h-full w-full", mediaFitClass)}
							autoPlay
							loop
							muted
							playsInline
							style={{
								pointerEvents: "none",
							}}
						/>
					);

				default:
					return (
						<div className="w-full h-full flex items-center justify-center bg-muted/50 rounded">
							<span className="text-xs text-muted-foreground">
								{mediaItem.type}
							</span>
						</div>
					);
			}
		};

		const geometry = resolveStickerGeometry({
			position: sticker.position,
			size: sticker.size,
			canvasWidth: canvasSize.width,
			canvasHeight: canvasSize.height,
		});
		const animation = animationElement
			? getStickerClipAnimationState({
					element: animationElement,
					currentTime,
					canvasWidth: canvasSize.width,
					canvasHeight: canvasSize.height,
				})
			: {
					opacity: 1,
					scale: 1,
					offsetX: 0,
					offsetY: 0,
					rotation: 0,
				};
		const cssGeometry = getStickerCssGeometry({
			geometry: {
				...geometry,
				left: geometry.left + animation.offsetX,
				top: geometry.top + animation.offsetY,
			},
		});
		const perspectiveTransform = buildCssPerspectiveTransform({
			width: geometry.pixelWidth,
			height: geometry.pixelHeight,
			perspective: sticker.perspective ?? DEFAULT_MEDIA_PERSPECTIVE,
		});
		const elementStyle = {
			...cssGeometry,
			transform: `rotate(${sticker.rotation + animation.rotation}deg) scale(${animation.scale})`,
			opacity: sticker.opacity * animation.opacity,
			zIndex: renderMode !== "visual" && isSelected ? 9999 : sticker.zIndex,
			transformOrigin: "center",
			transition: isDragging ? "none" : "box-shadow 0.2s",
		};

		return (
			<div
				ref={elementRef}
				className={cn(
					"absolute",
					canInteract
						? "pointer-events-auto transition-shadow duration-200"
						: "pointer-events-none",
					canInteract && (isDragging ? "cursor-grabbing" : "cursor-grab"),
					canInteract && isSelected && "ring-2 ring-primary shadow-lg z-50",
					canInteract && !isSelected && "hover:ring-1 hover:ring-primary/50"
				)}
				style={elementStyle}
				onClick={canInteract ? handleClick : undefined}
				onMouseDown={canInteract ? handleMouseDownWrapper : undefined}
				onKeyDown={canInteract ? handleKeyDown : undefined}
				onWheel={canInteract ? handleWheel : undefined}
				onTouchStart={canInteract ? handleTouchStartWrapper : undefined}
				onTouchMove={canInteract ? handleTouchMove : undefined}
				onTouchEnd={canInteract ? handleTouchEnd : undefined}
				data-sticker-id={sticker.id}
				data-sticker-render-mode={renderMode}
				role={canInteract ? "button" : undefined}
				tabIndex={canInteract ? 0 : undefined}
				aria-label={canInteract ? `Sticker: ${mediaItem.name}` : undefined}
				aria-selected={canInteract ? isSelected : undefined}
			>
				{showsMedia ? (
					<div
						className="size-full"
						style={{
							transform: perspectiveTransform,
							transformOrigin: "0 0",
						}}
					>
						{renderMediaContent()}
					</div>
				) : null}

				{canInteract ? (
					<ResizeHandles
						stickerId={sticker.id}
						isVisible={isSelected}
						sticker={sticker}
						canvasRef={canvasRef}
					/>
				) : null}

				{canInteract && isSelected && sticker.size.width > 20 ? (
					<StickerControls
						stickerId={sticker.id}
						isVisible={isSelected}
						sticker={sticker}
					/>
				) : canInteract ? (
					<SimpleStickerControls
						stickerId={sticker.id}
						isVisible={isSelected}
					/>
				) : null}

				{/* Debug info in development */}
				{canInteract && import.meta.env.DEV && isSelected && (
					<div className="absolute -bottom-8 left-0 text-xs bg-black/75 text-white px-1 rounded whitespace-nowrap">
						{Math.round(sticker.position.x)}, {Math.round(sticker.position.y)} |{" "}
						{Math.round(sticker.size.width)}x{Math.round(sticker.size.height)}
					</div>
				)}
			</div>
		);
	}
);

StickerElement.displayName = "StickerElement";
