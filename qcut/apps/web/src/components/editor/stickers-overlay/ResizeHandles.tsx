/**
 * ResizeHandles Component
 *
 * Provides visual resize handles for selected stickers with
 * corner and edge dragging support.
 */

import React, { memo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/debug/debug-config";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { OverlaySticker } from "@/types/sticker-overlay";

interface ResizeHandlesProps {
	stickerId: string;
	isVisible: boolean;
	sticker: OverlaySticker;
	elementRef: React.RefObject<HTMLDivElement | null>;
	canvasRef: React.RefObject<HTMLDivElement | null>;
}

type ResizeHandle = "tl" | "tr" | "bl" | "br" | "t" | "r" | "b" | "l";

/**
 * Resize handles for sticker elements
 */
export const ResizeHandles = memo<ResizeHandlesProps>(
	({ stickerId, isVisible, sticker, elementRef, canvasRef }) => {
		const { updateOverlaySticker, setIsResizing, saveHistorySnapshot } =
			useStickersOverlayStore();
		const resizeState = useRef({
			isResizing: false,
			handle: null as ResizeHandle | null,
			startX: 0,
			startY: 0,
			startWidth: 0,
			startHeight: 0,
			startLeft: 0,
			startTop: 0,
			aspectRatio: 1,
		});

		/**
		 * Calculate new size based on resize handle and mouse position
		 */
		const calculateNewSize = useCallback(
			(
				handle: ResizeHandle,
				deltaX: number,
				deltaY: number,
				maintainAspectRatio: boolean
			) => {
				const state = resizeState.current;
				let newWidth = state.startWidth;
				let newHeight = state.startHeight;
				let newX = sticker.position.x;
				let newY = sticker.position.y;

				// Calculate percentage changes relative to canvas (not window)
				const canvasRect = canvasRef.current?.getBoundingClientRect();
				const canvasWidth = canvasRect?.width ?? window.innerWidth;
				const canvasHeight = canvasRect?.height ?? window.innerHeight;
				const deltaXPercent = (deltaX / canvasWidth) * 100;
				const deltaYPercent = (deltaY / canvasHeight) * 100;

				switch (handle) {
					case "tl": // Top-left
						newWidth = state.startWidth - deltaXPercent * 2;
						newHeight = state.startHeight - deltaYPercent * 2;
						newX = state.startLeft + deltaXPercent;
						newY = state.startTop + deltaYPercent;
						break;
					case "tr": // Top-right
						newWidth = state.startWidth + deltaXPercent * 2;
						newHeight = state.startHeight - deltaYPercent * 2;
						newY = state.startTop + deltaYPercent;
						break;
					case "bl": // Bottom-left
						newWidth = state.startWidth - deltaXPercent * 2;
						newHeight = state.startHeight + deltaYPercent * 2;
						newX = state.startLeft + deltaXPercent;
						break;
					case "br": // Bottom-right
						newWidth = state.startWidth + deltaXPercent * 2;
						newHeight = state.startHeight + deltaYPercent * 2;
						break;
					case "t": // Top
						newHeight = state.startHeight - deltaYPercent * 2;
						newY = state.startTop + deltaYPercent;
						break;
					case "b": // Bottom
						newHeight = state.startHeight + deltaYPercent * 2;
						break;
					case "l": // Left
						newWidth = state.startWidth - deltaXPercent * 2;
						newX = state.startLeft + deltaXPercent;
						break;
					case "r": // Right
						newWidth = state.startWidth + deltaXPercent * 2;
						break;
				}

				// Maintain aspect ratio if needed
				if (
					maintainAspectRatio &&
					(handle === "tl" ||
						handle === "tr" ||
						handle === "bl" ||
						handle === "br")
				) {
					const ratio = state.aspectRatio;
					if (Math.abs(deltaXPercent) > Math.abs(deltaYPercent)) {
						const heightDiff = newWidth / ratio - newHeight;
						newHeight = newWidth / ratio;
						// Adjust position for top handles
						if (handle === "tl" || handle === "tr") {
							newY = state.startTop + (handle === "tl" ? heightDiff : 0);
						}
					} else {
						const widthDiff = newHeight * ratio - newWidth;
						newWidth = newHeight * ratio;
						// Adjust position for left handles
						if (handle === "tl" || handle === "bl") {
							newX = state.startLeft + (handle === "tl" ? widthDiff : 0);
						}
					}
				}

				// Apply minimum and maximum constraints
				newWidth = Math.max(5, Math.min(100, newWidth));
				newHeight = Math.max(5, Math.min(100, newHeight));
				newX = Math.max(0, Math.min(100, newX));
				newY = Math.max(0, Math.min(100, newY));

				// Clamp size so sticker doesn't extend past canvas edges
				// Position is center-based, so max size = 2× distance to nearest edge
				const maxWidth = Math.min(100, newX * 2, (100 - newX) * 2);
				const maxHeight = Math.min(100, newY * 2, (100 - newY) * 2);
				newWidth = Math.max(5, Math.min(maxWidth, newWidth));
				newHeight = Math.max(5, Math.min(maxHeight, newHeight));

				return { width: newWidth, height: newHeight, x: newX, y: newY };
			},
			[sticker.position.x, sticker.position.y, canvasRef]
		);

		/**
		 * Get cursor style for handle
		 */
		const getCursorForHandle = useCallback((handle: ResizeHandle): string => {
			const cursors: Record<ResizeHandle, string> = {
				tl: "nw-resize",
				tr: "ne-resize",
				bl: "sw-resize",
				br: "se-resize",
				t: "n-resize",
				b: "s-resize",
				l: "w-resize",
				r: "e-resize",
			};
			return cursors[handle];
		}, []);

		/**
		 * Handle resize start
		 */
		const handleResizeStart = useCallback(
			(e: React.PointerEvent, handle: ResizeHandle) => {
				debugLog(`[ResizeHandles] Starting resize with handle: ${handle}`);
				e.stopPropagation();
				e.preventDefault();
				const captureTarget = e.target as Element;
				captureTarget.setPointerCapture?.(e.pointerId);

				// Save snapshot before resize so Ctrl+Z can undo
				saveHistorySnapshot();

				resizeState.current = {
					isResizing: true,
					handle,
					startX: e.clientX,
					startY: e.clientY,
					startWidth: sticker.size.width,
					startHeight: sticker.size.height,
					startLeft: sticker.position.x,
					startTop: sticker.position.y,
					aspectRatio: sticker.size.width / sticker.size.height,
				};

				setIsResizing(true);
				document.body.style.cursor = getCursorForHandle(handle);
				document.body.style.userSelect = "none";

				const handlePointerMove = (e: PointerEvent) => {
					if (!resizeState.current.isResizing) return;

					const deltaX = e.clientX - resizeState.current.startX;
					const deltaY = e.clientY - resizeState.current.startY;

					const newSize = calculateNewSize(
						resizeState.current.handle!,
						deltaX,
						deltaY,
						e.shiftKey || sticker.maintainAspectRatio
					);

					requestAnimationFrame(() => {
						try {
							updateOverlaySticker(stickerId, {
								size: { width: newSize.width, height: newSize.height },
								position: { x: newSize.x, y: newSize.y },
							});
						} catch (error) {
							debugLog(`[ResizeHandles] Error updating sticker: ${error}`);
							// Optionally trigger cleanup
							handlePointerUp(e);
						}
					});
				};

				const handlePointerUp = (e: PointerEvent) => {
					debugLog(
						`[ResizeHandles] Finished resizing handle ${resizeState.current.handle}`
					);
					captureTarget.releasePointerCapture?.(e.pointerId);
					resizeState.current.isResizing = false;
					setIsResizing(false);
					document.body.style.cursor = "";
					document.body.style.userSelect = "";
					document.removeEventListener("pointermove", handlePointerMove);
					document.removeEventListener("pointerup", handlePointerUp);
					document.removeEventListener("pointercancel", handlePointerUp);
				};

				document.addEventListener("pointermove", handlePointerMove);
				document.addEventListener("pointerup", handlePointerUp);
				document.addEventListener("pointercancel", handlePointerUp);
			},
			[
				stickerId,
				sticker,
				setIsResizing,
				saveHistorySnapshot,
				updateOverlaySticker,
				calculateNewSize,
				getCursorForHandle,
			]
		);

		if (!isVisible) return null;

		const handleClass =
			"absolute w-5 h-5 bg-white border-2 border-primary rounded-full z-[10000] pointer-events-auto hover:scale-110 transition-transform before:absolute before:-inset-3 before:content-['']";
		const edgeHandleClass =
			"absolute bg-white border-2 border-primary z-[10000] pointer-events-auto hover:scale-105 transition-transform";

		return (
			<>
				{/* Corner handles */}
				<div
					className={cn(handleClass, "-top-2.5 -left-2.5 cursor-nw-resize")}
					onPointerDown={(e) => handleResizeStart(e, "tl")}
					style={{ touchAction: "none" }}
					title="Resize top-left"
				/>
				<div
					className={cn(handleClass, "-top-2.5 -right-2.5 cursor-ne-resize")}
					onPointerDown={(e) => handleResizeStart(e, "tr")}
					style={{ touchAction: "none" }}
					title="Resize top-right"
				/>
				<div
					className={cn(handleClass, "-bottom-2.5 -left-2.5 cursor-sw-resize")}
					onPointerDown={(e) => handleResizeStart(e, "bl")}
					style={{ touchAction: "none" }}
					title="Resize bottom-left"
				/>
				<div
					className={cn(handleClass, "-bottom-2.5 -right-2.5 cursor-se-resize")}
					onPointerDown={(e) => handleResizeStart(e, "br")}
					style={{ touchAction: "none" }}
					title="Resize bottom-right (hold Shift for aspect ratio)"
				/>

				{/* Edge handles — always visible when selected */}
				<div
					className={cn(
						edgeHandleClass,
						"top-1/2 -left-1 w-2 h-6 -translate-y-1/2 cursor-w-resize"
					)}
					onPointerDown={(e) => handleResizeStart(e, "l")}
					style={{ touchAction: "none" }}
					title="Resize left"
				/>
				<div
					className={cn(
						edgeHandleClass,
						"top-1/2 -right-1 w-2 h-6 -translate-y-1/2 cursor-e-resize"
					)}
					onPointerDown={(e) => handleResizeStart(e, "r")}
					style={{ touchAction: "none" }}
					title="Resize right"
				/>
				<div
					className={cn(
						edgeHandleClass,
						"-top-1 left-1/2 w-6 h-2 -translate-x-1/2 cursor-n-resize"
					)}
					onPointerDown={(e) => handleResizeStart(e, "t")}
					style={{ touchAction: "none" }}
					title="Resize top"
				/>
				<div
					className={cn(
						edgeHandleClass,
						"-bottom-1 left-1/2 w-6 h-2 -translate-x-1/2 cursor-s-resize"
					)}
					onPointerDown={(e) => handleResizeStart(e, "b")}
					style={{ touchAction: "none" }}
					title="Resize bottom"
				/>
			</>
		);
	}
);

ResizeHandles.displayName = "ResizeHandles";
