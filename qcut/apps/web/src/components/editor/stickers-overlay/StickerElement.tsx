/**
 * StickerElement Component
 *
 * Individual draggable sticker element with selection and interaction support.
 */

import React, { memo, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/debug/debug-config";
import { useStickerDrag } from "./hooks/useStickerDrag";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { ResizeHandles } from "./ResizeHandles";
import { StickerControls, SimpleStickerControls } from "./StickerControls";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media/media-store-types";

interface StickerElementProps {
	sticker: OverlaySticker;
	mediaItem: MediaItem;
	canvasRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Draggable sticker element with full interaction support
 */
export const StickerElement = memo<StickerElementProps>(
	({ sticker, mediaItem, canvasRef }) => {
		const elementRef = useRef<HTMLDivElement>(null);

		// Store hooks
		const {
			selectedStickerId,
			selectSticker,
			updateOverlaySticker,
			saveHistorySnapshot,
		} = useStickersOverlayStore();
		const isSelected = selectedStickerId === sticker.id;

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
		const handleClick = (e: React.MouseEvent) => {
			e.stopPropagation();
			if (!isDragging) {
				selectSticker(sticker.id);
			}
		};

		/**
		 * Combined mouse down handler
		 */
		const handleMouseDownWrapper = (e: React.MouseEvent) => {
			debugLog(
				"[StickerElement] 🎯 MOUSE DOWN WRAPPER: Called for sticker",
				sticker.id
			);
			selectSticker(sticker.id);
			handleMouseDown(e);
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
			(e: React.WheelEvent) => {
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

				// Clamp to canvas bounds (center-based: max size = 2x distance to nearest edge)
				const maxWidth = Math.min(
					100,
					sticker.position.x * 2,
					(100 - sticker.position.x) * 2
				);
				const maxHeight = Math.min(
					100,
					sticker.position.y * 2,
					(100 - sticker.position.y) * 2
				);

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
			[isSelected, sticker, updateOverlaySticker, saveHistorySnapshot]
		);

		/**
		 * Render media content based on type
		 */
		const renderMediaContent = () => {
			switch (mediaItem.type) {
				case "image":
					return (
						<img
							src={mediaItem.url}
							alt={mediaItem.name}
							className="w-full h-full object-contain select-none"
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
							className="w-full h-full object-contain"
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

		const elementStyle = {
			left: `${sticker.position.x}%`,
			top: `${sticker.position.y}%`,
			width: `${sticker.size.width}%`,
			height: `${sticker.size.height}%`,
			transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
			opacity: sticker.opacity,
			zIndex: isSelected ? 9999 : sticker.zIndex,
			transformOrigin: "center",
			// Smooth transitions except during drag
			transition: isDragging ? "none" : "box-shadow 0.2s",
		};

		return (
			<div
				ref={elementRef}
				className={cn(
					"absolute pointer-events-auto",
					"transition-shadow duration-200",
					isDragging ? "cursor-grabbing" : "cursor-grab",
					isSelected && "ring-2 ring-primary shadow-lg z-50",
					!isSelected && "hover:ring-1 hover:ring-primary/50"
				)}
				style={elementStyle}
				onClick={handleClick}
				onMouseDown={handleMouseDownWrapper}
				onWheel={handleWheel}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				data-sticker-id={sticker.id}
				role="button"
				tabIndex={0}
				aria-label={`Sticker: ${mediaItem.name}`}
				aria-selected={isSelected}
			>
				{/* Media content */}
				{renderMediaContent()}

				{/* Resize handles for selected sticker */}
				<ResizeHandles
					stickerId={sticker.id}
					isVisible={isSelected}
					sticker={sticker}
					elementRef={elementRef}
					canvasRef={canvasRef}
				/>

				{/* Control buttons for selected sticker */}
				{isSelected && sticker.size.width > 20 ? (
					<StickerControls
						stickerId={sticker.id}
						isVisible={isSelected}
						sticker={sticker}
					/>
				) : (
					<SimpleStickerControls
						stickerId={sticker.id}
						isVisible={isSelected}
					/>
				)}

				{/* Debug info in development */}
				{import.meta.env.DEV && isSelected && (
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
