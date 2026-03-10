"use client";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlaybackStore } from "@/stores/editor/playback-store";

export interface DraggableMediaItemProps {
	name: string;
	preview: ReactNode;
	dragData: Record<string, any>;
	onDragStart?: (e: React.DragEvent) => void;
	onAddToTimeline?: (currentTime: number) => void;
	aspectRatio?: number;
	className?: string;
	showPlusOnDrag?: boolean;
	showLabel?: boolean;
	rounded?: boolean;
	variant?: "default" | "card";
	isDraggable?: boolean;
	stopPropagation?: boolean;
	"data-testid"?: string;
}

export function DraggableMediaItem({
	name,
	preview,
	dragData,
	onDragStart,
	onAddToTimeline,
	aspectRatio = 16 / 9,
	className = "",
	showPlusOnDrag = true,
	showLabel = true,
	rounded = true,
	variant = "default",
	isDraggable = true,
	stopPropagation = true,
	"data-testid": dataTestId,
}: DraggableMediaItemProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
	const dragRef = useRef<HTMLDivElement>(null);
	const currentTime = usePlaybackStore((state) => state.currentTime);

	const handleAddToTimeline = () => {
		onAddToTimeline?.(currentTime);
	};

	const emptyImg = new window.Image();
	emptyImg.src =
		"data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";

	useEffect(() => {
		if (!isDragging) return;

		const handleDragOver = (e: DragEvent) => {
			setDragPosition({ x: e.clientX, y: e.clientY });
		};

		document.addEventListener("dragover", handleDragOver);

		return () => {
			document.removeEventListener("dragover", handleDragOver);
		};
	}, [isDragging]);

	const handleDragStart = (e: React.DragEvent) => {
		// Simple check for problematic blob URLs
		if (dragData.url?.startsWith("blob:file:///")) {
			console.error("❌ Dragging problematic blob URL:", dragData.url);
		}

		e.dataTransfer.setDragImage(emptyImg, 0, 0);

		// Set drag data
		e.dataTransfer.setData(
			"application/x-media-item",
			JSON.stringify(dragData)
		);
		e.dataTransfer.effectAllowed = "copy";

		// Set initial position and show custom drag preview
		setDragPosition({ x: e.clientX, y: e.clientY });
		setIsDragging(true);

		onDragStart?.(e);
	};

	const handleDragEnd = () => {
		setIsDragging(false);
	};

	// Touch-based drag fallback for iOS Safari (HTML5 Drag API unsupported)
	const touchGhostRef = useRef<HTMLDivElement | null>(null);

	const cleanupTouchDrag = useCallback(() => {
		if (touchGhostRef.current) {
			touchGhostRef.current.remove();
			touchGhostRef.current = null;
		}
		setIsDragging(false);
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (e.pointerType !== "touch" || !isDraggable) return;

			const serialized = JSON.stringify(dragData);

			// Create ghost element from the thumbnail
			const source = e.currentTarget as HTMLElement;
			const ghost = document.createElement("div");
			ghost.style.cssText = `
				position: fixed; z-index: 99999; pointer-events: none;
				width: 80px; height: 80px; border-radius: 8px; overflow: hidden;
				box-shadow: 0 8px 30px rgba(0,0,0,0.3); opacity: 0.9;
			`;
			// Clone visible content into ghost
			const clone = source.cloneNode(true) as HTMLElement;
			clone.style.cssText =
				"width:100%;height:100%;object-fit:cover;pointer-events:none;";
			ghost.appendChild(clone);
			ghost.style.left = `${e.clientX - 40}px`;
			ghost.style.top = `${e.clientY - 40}px`;
			document.body.appendChild(ghost);
			touchGhostRef.current = ghost;
			setIsDragging(true);
			setDragPosition({ x: e.clientX, y: e.clientY });

			const onPointerMove = (ev: PointerEvent) => {
				if (!touchGhostRef.current) return;
				touchGhostRef.current.style.left = `${ev.clientX - 40}px`;
				touchGhostRef.current.style.top = `${ev.clientY - 40}px`;
				setDragPosition({ x: ev.clientX, y: ev.clientY });
			};

			const onPointerUp = (ev: PointerEvent) => {
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);

				// Find drop zone under the pointer
				cleanupTouchDrag();
				const target = document.elementFromPoint(ev.clientX, ev.clientY);
				const dropZone = target?.closest("[data-drop-zone]");
				if (dropZone) {
					dropZone.dispatchEvent(
						new CustomEvent("touch-drop", {
							bubbles: true,
							detail: {
								data: serialized,
								clientX: ev.clientX,
								clientY: ev.clientY,
							},
						})
					);
				}
			};

			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
		},
		[isDraggable, dragData, cleanupTouchDrag]
	);

	return (
		<>
			<div
				ref={dragRef}
				className="relative group w-28 h-28"
				data-testid={dataTestId}
			>
				<div
					className={cn(
						"flex flex-col gap-1 p-0 h-auto w-full relative cursor-default",
						variant === "card" && "bg-card border rounded-md p-2",
						className
					)}
					onClick={(e) => stopPropagation && e.stopPropagation()}
				>
					<AspectRatio
						ratio={aspectRatio}
						className={cn(
							"bg-accent relative overflow-hidden",
							rounded && "rounded-md",
							"[&::-webkit-drag-ghost]:opacity-0" // Webkit-specific ghost hiding
						)}
						draggable={isDraggable}
						onDragStart={isDraggable ? handleDragStart : undefined}
						onDragEnd={isDraggable ? handleDragEnd : undefined}
						onPointerDown={isDraggable ? handlePointerDown : undefined}
					>
						{preview}
						{!isDragging && (
							<PlusButton
								className="opacity-0 group-hover:opacity-100"
								onClick={handleAddToTimeline}
							/>
						)}
					</AspectRatio>
					{showLabel && (
						<span
							className="text-[0.7rem] text-muted-foreground truncate w-full text-left"
							aria-label={name}
							title={name}
						>
							{name.length > 8
								? `${name.slice(0, 16)}...${name.slice(-3)}`
								: name}
						</span>
					)}
				</div>
			</div>

			{/* Custom drag preview */}
			{isDragging &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						className="fixed pointer-events-none z-9999"
						style={{
							left: dragPosition.x - 40, // Center the preview (half of 80px)
							top: dragPosition.y - 40, // Center the preview (half of 80px)
						}}
					>
						<div className="w-[80px]">
							<AspectRatio
								ratio={1}
								className="relative rounded-md overflow-hidden shadow-2xl ring-3 ring-primary"
							>
								<div className="w-full h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_img]:rounded-none">
									{preview}
								</div>
								{showPlusOnDrag && (
									<PlusButton
										onClick={handleAddToTimeline}
										tooltipText="Add to timeline or drag to position"
									/>
								)}
							</AspectRatio>
						</div>
					</div>,
					document.body
				)}
		</>
	);
}

function PlusButton({
	className,
	onClick,
	tooltipText,
}: {
	className?: string;
	onClick?: () => void;
	tooltipText?: string;
}) {
	const button = (
		<Button
			size="icon"
			className={cn("absolute bottom-2 right-2 size-4", className)}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick?.();
			}}
			title={tooltipText}
		>
			<Plus className="size-3!" />
		</Button>
	);

	if (tooltipText) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						className={cn("absolute bottom-2 right-2 size-4", className)}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onClick?.();
						}}
						title={tooltipText}
					>
						<Plus className="size-3!" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>{tooltipText}</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	return button;
}
