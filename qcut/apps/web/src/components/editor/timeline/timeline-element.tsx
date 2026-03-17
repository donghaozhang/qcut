"use client";

import { useState, useRef, useEffect } from "react";
import { handleMediaProcessingError } from "@/lib/debug/error-handler";
import { useFilmstripThumbnails } from "@/hooks/timeline/use-filmstrip-thumbnails";
import { Button } from "../../ui/button";
import {
	MoreVertical,
	Scissors,
	Trash2,
	SplitSquareHorizontal,
	Music,
	ChevronRight,
	ChevronLeft,
	Type,
	Copy,
	FileJson,
	RefreshCw,
	EyeOff,
	Eye,
	Volume2,
	VolumeX,
	Sparkles,
} from "lucide-react";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import AudioWaveform from "../audio-waveform";
import { toast } from "sonner";
import { TimelineElementProps, TrackType } from "@/types/timeline";
import { useTimelineElementResize } from "@/hooks/timeline/use-timeline-element-resize";
import { withErrorBoundary } from "@/components/error-boundary";
import { stripMarkdownSyntax } from "@/lib/markdown";

// Helper function to get display name for element type
function getElementTypeName(element: { type: string }): string {
	switch (element.type) {
		case "text":
			return "text";
		case "captions":
			return "captions";
		case "sticker":
			return "sticker";
		case "markdown":
			return "markdown";
		default:
			return "clip";
	}
}
import {
	getTrackElementClasses,
	TIMELINE_CONSTANTS,
	getTrackHeight,
} from "@/constants/timeline-constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "../../ui/dropdown-menu";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubTrigger,
	ContextMenuSubContent,
} from "../../ui/context-menu";
import { COLOR_LABELS } from "@/types/generation";

function TimelineElementComponent({
	element,
	track,
	zoomLevel,
	isSelected,
	onElementMouseDown,
	onElementClick,
}: TimelineElementProps) {
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	// Use individual selectors to keep snapshots stable and avoid infinite update loops
	const updateElementTrim = useTimelineStore((s) => s.updateElementTrim);
	const updateElementDuration = useTimelineStore(
		(s) => s.updateElementDuration
	);
	const removeElementFromTrack = useTimelineStore(
		(s) => s.removeElementFromTrack
	);
	const removeElementFromTrackWithRipple = useTimelineStore(
		(s) => s.removeElementFromTrackWithRipple
	);
	const dragState = useTimelineStore((s) => s.dragState);
	const splitElement = useTimelineStore((s) => s.splitElement);
	const splitAndKeepLeft = useTimelineStore((s) => s.splitAndKeepLeft);
	const splitAndKeepRight = useTimelineStore((s) => s.splitAndKeepRight);
	const separateAudio = useTimelineStore((s) => s.separateAudio);
	const addElementToTrack = useTimelineStore((s) => s.addElementToTrack);
	const replaceElementMedia = useTimelineStore((s) => s.replaceElementMedia);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const toggleElementHidden = useTimelineStore((s) => s.toggleElementHidden);
	const selectElement = useTimelineStore((s) => s.selectElement);
	const currentTime = usePlaybackStore((s) => s.currentTime);

	const [elementMenuOpen, setElementMenuOpen] = useState(false);

	// Resize & trim helpers – must be declared before any conditional returns
	const {
		resizing,
		isResizing,
		handleResizeStart,
		handleResizeMove,
		handleResizeEnd,
	} = useTimelineElementResize({
		element,
		track,
		zoomLevel,
		onUpdateTrim: updateElementTrim,
		onUpdateDuration: updateElementDuration,
	});

	// Get media item for hook dependency (must be called at top level)
	const mediaItem =
		element.type === "media" || element.type === "sticker"
			? mediaItems.find((item) => item.id === element.mediaId)
			: null;

	// Use the media item URL directly - it's already been converted to blob if needed
	const mediaItemUrl = mediaItem?.url;

	const isAudio = mediaItem?.type === "audio";

	// Compute element dimensions (needed by filmstrip hook, must be before conditional returns)
	const effectiveDuration =
		element.duration - element.trimStart - element.trimEnd;
	const elementWidth = Math.max(
		TIMELINE_CONSTANTS.ELEMENT_MIN_WIDTH,
		effectiveDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel
	);

	// Viewport-aware filmstrip: only extract frames for visible clips
	const elementRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		const el = elementRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ threshold: 0 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Filmstrip thumbnails for video clips
	const filmstrip = useFilmstripThumbnails({
		mediaId: "mediaId" in element ? element.mediaId : "",
		file: mediaItem?.type === "video" ? mediaItem.file : undefined,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		zoomLevel,
		trackHeight: getTrackHeight(track.type),
		clipWidthPx: elementWidth,
		enabled:
			mediaItem?.type === "video" &&
			mediaItem?.thumbnailStatus === "ready" &&
			isVisible,
	});

	// Log if we have a media item but no URL
	if (mediaItem && !mediaItemUrl) {
		console.warn(`[TimelineElement] Media item ${mediaItem.id} has no URL`);
	}

	// Handle media loading states
	if (mediaItemsError) {
		console.error("Failed to load media items:", mediaItemsError);
		return (
			<div className="absolute bg-red-100 border border-red-300 rounded text-red-600 text-xs p-1">
				Error loading media
			</div>
		);
	}

	if (
		mediaItemsLoading &&
		(element.type === "media" || element.type === "sticker")
	) {
		return (
			<div className="absolute bg-card border border-border rounded text-muted-foreground text-xs p-1">
				Loading media...
			</div>
		);
	}

	// resizing hooks already declared earlier to maintain stable hook order.

	// Use real-time position during drag, otherwise use stored position
	const isBeingDragged = dragState.elementId === element.id;
	const elementStartTime =
		isBeingDragged && dragState.isDragging
			? dragState.currentTime
			: element.startTime;

	// Element should always be positioned at startTime - trimStart only affects content, not position
	const elementLeft = elementStartTime * 50 * zoomLevel;

	const handleElementSplitContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		const effectiveStart = element.startTime;
		const effectiveEnd =
			element.startTime +
			(element.duration - element.trimStart - element.trimEnd);

		if (currentTime > effectiveStart && currentTime < effectiveEnd) {
			const secondElementId = splitElement(track.id, element.id, currentTime);
			if (!secondElementId) {
				toast.error("Failed to split element");
			}
		} else {
			toast.error("Playhead must be within element to split");
		}
	};

	const handleElementDuplicateContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		const { id, ...elementWithoutId } = element;
		addElementToTrack(track.id, {
			...elementWithoutId,
			name: element.name + " (copy)",
			startTime:
				element.startTime +
				(element.duration - element.trimStart - element.trimEnd) +
				0.1,
		});
	};

	const handleElementDeleteContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (rippleEditingEnabled) {
			removeElementFromTrackWithRipple(track.id, element.id);
		} else {
			removeElementFromTrack(track.id, element.id);
		}
	};

	const handleToggleElementHidden = (e: React.MouseEvent) => {
		e.stopPropagation();
		toggleElementHidden(track.id, element.id);
	};

	const handleReplaceClip = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media") {
			toast.error("Replace is only available for media clips");
			return;
		}

		// Create a file input to select replacement media
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "video/*,audio/*,image/*";

		const cleanup = () => {
			input.remove();
		};

		input.onchange = async (e) => {
			try {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) return;

				const result = await replaceElementMedia(track.id, element.id, file);
				if (result.success) {
					toast.success("Clip replaced successfully");
				} else {
					toast.error(result.error || "Failed to replace clip");
				}
			} catch (error) {
				handleMediaProcessingError(error, "Replace clip", {
					trackId: track.id,
					elementId: element.id,
				});
			} finally {
				cleanup();
			}
		};

		// Cleanup if user cancels the file dialog
		input.oncancel = cleanup;

		input.click();
	};

	const renderElementContent = () => {
		if (element.type === "text") {
			return (
				<div className="w-full h-full flex items-center justify-start pl-2">
					<span className="text-xs text-foreground/80 truncate">
						{element.content}
					</span>
				</div>
			);
		}

		if (element.type === "sticker") {
			// Safe fallback: mediaItem is already fetched at line 119
			const thumbnailUrl = mediaItem?.thumbnailUrl || mediaItem?.url;

			return (
				<div className="w-full h-full flex items-center justify-start pl-2 gap-2">
					{thumbnailUrl ? (
						<>
							<img
								src={thumbnailUrl}
								alt={element.name}
								className="h-[calc(100%-8px)] w-auto object-contain rounded pointer-events-none select-none bg-white/10 p-0.5"
								onError={(e) => {
									// Hide image on error and show text fallback
									e.currentTarget.style.display = "none";
								}}
							/>
							<span className="text-xs text-foreground/80 truncate flex-1">
								{element.name}
							</span>
						</>
					) : (
						<span className="text-xs text-foreground/80 truncate">
							{element.name}
						</span>
					)}
				</div>
			);
		}

		if (element.type === "captions") {
			return (
				<div className="w-full h-full flex items-center justify-start pl-2">
					<span className="text-xs text-foreground/80 truncate">
						{element.text}
					</span>
				</div>
			);
		}

		if (element.type === "markdown") {
			const previewText = stripMarkdownSyntax({
				markdown: element.markdownContent || "",
				maxLength: 80,
			});

			return (
				<div className="w-full h-full flex items-center justify-start pl-2">
					<span className="text-xs text-foreground/80 truncate">
						{previewText || "Markdown"}
					</span>
				</div>
			);
		}

		// Render media element -> use outer mediaItem variable
		if (!mediaItem) {
			return (
				<span className="text-xs text-foreground/80 truncate">
					{element.name}
				</span>
			);
		}

		const TILE_ASPECT_RATIO = 16 / 9;

		if (mediaItem.type === "image") {
			// Calculate tile size based on 16:9 aspect ratio
			const trackHeight = getTrackHeight(track.type);
			const tileHeight = trackHeight - 8; // Account for padding
			const tileWidth = tileHeight * TILE_ASPECT_RATIO;

			return (
				<div className="w-full h-full flex items-center justify-center">
					<div className="bg-timeline-clip py-3 w-full h-full relative">
						{/* Background with tiled images */}
						<div
							className="absolute top-3 bottom-3 left-0 right-0"
							style={{
								backgroundImage: mediaItemUrl ? `url(${mediaItemUrl})` : "none",
								backgroundRepeat: "repeat-x",
								backgroundSize: `${tileWidth}px ${tileHeight}px`,
								backgroundPosition: "left center",
								pointerEvents: "none",
							}}
							onError={(e) => {
								console.error(
									"[TimelineElement] Background image failed to load:",
									{
										url: mediaItemUrl,
										elementId: element.id,
										mediaId: "mediaId" in element ? element.mediaId : undefined,
										error: e,
									}
								);
							}}
							aria-label={`Tiled background of ${mediaItem.name}`}
						/>
						{/* Overlay with vertical borders */}
						<div
							className="absolute top-3 bottom-3 left-0 right-0 pointer-events-none"
							style={{
								backgroundImage: `repeating-linear-gradient(
                  to right,
                  transparent 0px,
                  transparent ${tileWidth - 1}px,
                  rgba(255, 255, 255, 0.6) ${tileWidth - 1}px,
                  rgba(255, 255, 255, 0.6) ${tileWidth}px
                )`,
								backgroundPosition: "left center",
							}}
						/>
					</div>
				</div>
			);
		}

		if (mediaItem.type === "video") {
			// Show loading indicator while thumbnail generates
			if (
				mediaItem.thumbnailStatus === "loading" ||
				mediaItem.thumbnailStatus === "pending"
			) {
				return (
					<div className="w-full h-full flex items-center justify-center bg-[var(--color-timeline-video-clip)]">
						<span className="text-xs text-foreground/60 truncate px-2">
							{element.name} (loading...)
						</span>
					</div>
				);
			}

			const { frames, tileWidth, tileHeight } = filmstrip;
			const hasFilmstrip = frames.length > 0;

			// Show filmstrip tiles (or single-thumbnail fallback)
			if (hasFilmstrip || mediaItem.thumbnailUrl) {
				return (
					<div className="w-full h-full flex items-center justify-center">
						<div className="bg-[var(--color-timeline-video-clip)] py-3 w-full h-full relative">
							{/* Filmstrip frame tiles */}
							<div
								className="absolute top-3 bottom-3 left-0 right-0 flex flex-row overflow-hidden pointer-events-none"
								aria-label={`Filmstrip thumbnails of ${mediaItem.name}`}
							>
								{hasFilmstrip ? (
									frames.map((frame, i) => (
										<div
											key={`${frame.time}-${i}`}
											style={{
												width: tileWidth,
												height: tileHeight,
												backgroundImage: `url(${frame.url || mediaItem.thumbnailUrl})`,
												backgroundSize: "cover",
												backgroundPosition: "center",
												flexShrink: 0,
												borderRight:
													i < frames.length - 1
														? "1px solid rgba(255, 255, 255, 0.3)"
														: "none",
											}}
										/>
									))
								) : (
									<div
										className="w-full h-full"
										style={{
											backgroundImage: `url(${mediaItem.thumbnailUrl})`,
											backgroundRepeat: "repeat-x",
											backgroundSize: `${tileWidth}px ${tileHeight}px`,
											backgroundPosition: "left center",
										}}
									/>
								)}
							</div>
						</div>
					</div>
				);
			}

			// Fallback: no thumbnail
			return (
				<div className="w-full h-full flex items-center justify-center bg-[var(--color-timeline-video-clip)]">
					<span className="text-xs text-foreground/80 truncate px-2">
						{element.name}
					</span>
				</div>
			);
		}

		// Render audio element ->
		if (mediaItem.type === "audio") {
			return (
				<div className="w-full h-full flex items-center gap-2">
					<div className="flex-1 min-w-0">
						<AudioWaveform
							audioUrl={mediaItem.url || ""}
							height={24}
							className="w-full"
						/>
					</div>
				</div>
			);
		}

		return (
			<span className="text-xs text-foreground/80 truncate">
				{element.name}
			</span>
		);
	};

	const handleElementMouseDown = (e: React.MouseEvent) => {
		if (onElementMouseDown) {
			onElementMouseDown(e, element);
		}
	};

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (open && !isSelected) {
					// Select element when context menu opens.
					// Use setTimeout to defer past Radix's internal state settlement.
					setTimeout(() => selectElement(track.id, element.id, false), 0);
				}
			}}
		>
			<ContextMenuTrigger asChild>
				<div
					ref={elementRef}
					className={`absolute top-0 h-full select-none timeline-element ${
						isBeingDragged ? "z-50" : "z-10"
					}`}
					style={{
						left: `${elementLeft}px`,
						width: `${elementWidth}px`,
					}}
					data-element-id={element.id}
					data-track-id={track.id}
					data-testid="timeline-element"
					data-duration={effectiveDuration}
					onMouseMove={resizing ? handleResizeMove : undefined}
					onMouseUp={resizing ? handleResizeEnd : undefined}
					onMouseLeave={resizing ? handleResizeEnd : undefined}
				>
					<div
						className={`relative h-full rounded-[0.15rem] cursor-pointer overflow-hidden ${getTrackElementClasses(
							track.type
						)} ${isSelected ? "border-b-[0.5px] border-t-[0.5px] border-foreground" : ""} ${
							isBeingDragged ? "z-50" : "z-10"
						} ${element.hidden ? "opacity-50" : ""}`}
						onClick={(e) => onElementClick && onElementClick(e, element)}
						onMouseDown={handleElementMouseDown}
					>
						<div className="absolute inset-0 flex items-center h-full">
							{renderElementContent()}
						</div>

						{element.hidden && (
							<div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
								{isAudio ? (
									<VolumeX className="h-6 w-6 text-foreground" />
								) : (
									<EyeOff className="h-6 w-6 text-foreground" />
								)}
							</div>
						)}

						{isSelected && (
							<>
								<div
									className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize bg-transparent hover:bg-foreground/20 border-r-2 border-foreground/50 z-50 before:absolute before:inset-y-0 before:-left-4 before:w-8 before:content-[''] touch-action-none"
									onPointerDown={(e) =>
										handleResizeStart(e, element.id, "left")
									}
									data-testid="trim-start-handle"
								/>
								<div
									className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize bg-transparent hover:bg-foreground/20 border-l-2 border-foreground/50 z-50 before:absolute before:inset-y-0 before:-right-4 before:w-8 before:content-[''] touch-action-none"
									onPointerDown={(e) =>
										handleResizeStart(e, element.id, "right")
									}
								/>
							</>
						)}
						{/* Color label dot */}
						{element.colorLabel && (
							<div
								className="absolute top-0.5 right-1 h-2 w-2 rounded-full pointer-events-none z-20"
								style={{
									backgroundColor:
										COLOR_LABELS.find((c) => c.value === element.colorLabel)
											?.color || "transparent",
								}}
							/>
						)}
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="z-200">
				<ContextMenuItem onClick={handleElementSplitContext}>
					<Scissors className="h-4 w-4 mr-2" />
					Split at playhead
				</ContextMenuItem>
				<ContextMenuItem onClick={handleToggleElementHidden}>
					{isAudio ? (
						element.hidden ? (
							<Volume2 className="h-4 w-4 mr-2" />
						) : (
							<VolumeX className="h-4 w-4 mr-2" />
						)
					) : element.hidden ? (
						<Eye className="h-4 w-4 mr-2" />
					) : (
						<EyeOff className="h-4 w-4 mr-2" />
					)}
					<span>
						{isAudio
							? element.hidden
								? "Unmute"
								: "Mute"
							: element.hidden
								? "Show"
								: "Hide"}{" "}
						{getElementTypeName(element)}
					</span>
				</ContextMenuItem>
				<ContextMenuItem onClick={handleElementDuplicateContext}>
					<Copy className="h-4 w-4 mr-2" />
					Duplicate {getElementTypeName(element)}
				</ContextMenuItem>
				{element.type === "media" && (
					<ContextMenuItem onClick={handleReplaceClip}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Replace clip
					</ContextMenuItem>
				)}
				{/* AI Tools — shown for AI-generated clips */}
				{element.type === "media" &&
					(() => {
						const media = mediaItems.find(
							(m) => m.id === (element as any).mediaId
						);
						const genParams = media?.metadata?.generationParams;
						const takes = media?.metadata?.takes as
							| Array<{ url: string; createdAt: number }>
							| undefined;
						const activeTakeIdx =
							(media?.metadata?.activeTakeIndex as number) ?? 0;
						const hasTakes = takes && takes.length > 1;

						if (!genParams) return null;

						return (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									onClick={() => {
										window.dispatchEvent(
											new CustomEvent("gap:generate", {
												detail: {
													gap: {
														trackId: track.id,
														startTime: element.startTime,
														endTime:
															element.startTime +
															element.duration -
															element.trimStart -
															element.trimEnd,
													},
													mode: genParams.mode || "text-to-video",
													prompt: genParams.prompt || "",
													model: genParams.model || "fal-ai/ltx-video/v0.2.3",
													cameraMotion: genParams.cameraMotion,
												},
											})
										);
									}}
								>
									<Sparkles className="h-4 w-4 mr-2" />
									Regenerate Shot
								</ContextMenuItem>
								{hasTakes && (
									<div className="flex items-center gap-1 px-2 py-1.5">
										<button
											type="button"
											className="p-0.5 rounded hover:bg-accent"
											onClick={(e) => {
												e.stopPropagation();
												const { setActiveTake } =
													(window as any).__mediaStore?.getState() || {};
												if (setActiveTake && media) {
													setActiveTake(media.id, activeTakeIdx - 1);
												}
											}}
										>
											<ChevronLeft className="h-3 w-3" />
										</button>
										<span className="text-xs text-muted-foreground">
											Take: {activeTakeIdx + 1}/{takes.length}
										</span>
										<button
											type="button"
											className="p-0.5 rounded hover:bg-accent"
											onClick={(e) => {
												e.stopPropagation();
												const { setActiveTake } =
													(window as any).__mediaStore?.getState() || {};
												if (setActiveTake && media) {
													setActiveTake(media.id, activeTakeIdx + 1);
												}
											}}
										>
											<ChevronRight className="h-3 w-3" />
										</button>
									</div>
								)}
							</>
						);
					})()}
				<ContextMenuSeparator />
				<ContextMenuItem
					onClick={async (e) => {
						e.stopPropagation();
						const info = {
							...element,
							endTime:
								element.startTime +
								(element.duration - element.trimStart - element.trimEnd),
							trackId: track.id,
						};
						try {
							await navigator.clipboard.writeText(
								JSON.stringify(info, null, 2)
							);
							toast.success("Element info copied to clipboard");
						} catch (error) {
							console.error("Failed to copy element info:", error);
							toast.error("Failed to copy element info");
						}
					}}
				>
					<FileJson className="h-4 w-4 mr-2" />
					Copy Element Info
				</ContextMenuItem>
				<ContextMenuItem
					onClick={async (e) => {
						e.stopPropagation();
						try {
							await navigator.clipboard.writeText(element.id);
							toast.success("Element ID copied");
						} catch (error) {
							console.error("Failed to copy element ID:", error);
							toast.error("Failed to copy element ID");
						}
					}}
				>
					<Copy className="h-4 w-4 mr-2" />
					Copy Element ID
				</ContextMenuItem>
				{/* Color Labels */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<div className="flex items-center gap-2">
							{element.colorLabel && (
								<div
									className="h-3 w-3 rounded-full"
									style={{
										backgroundColor:
											COLOR_LABELS.find((c) => c.value === element.colorLabel)
												?.color || "transparent",
									}}
								/>
							)}
							<span>Color Label</span>
						</div>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem
							onClick={() => {
								const store = useTimelineStore.getState();
								store.pushHistory();
								const newTracks = store._tracks.map((t) => ({
									...t,
									elements: t.elements.map((el) =>
										el.id === element.id ? { ...el, colorLabel: undefined } : el
									),
								}));
								store.restoreTracks(newTracks);
							}}
						>
							No Label
						</ContextMenuItem>
						{COLOR_LABELS.map(({ value, color }) => (
							<ContextMenuItem
								key={value}
								onClick={() => {
									const store = useTimelineStore.getState();
									store.pushHistory();
									const newTracks = store._tracks.map((t) => ({
										...t,
										elements: t.elements.map((el) =>
											el.id === element.id ? { ...el, colorLabel: value } : el
										),
									}));
									store.restoreTracks(newTracks);
								}}
							>
								<div
									className="h-3 w-3 rounded-full mr-2"
									style={{ backgroundColor: color }}
								/>
								<span className="capitalize">{value}</span>
							</ContextMenuItem>
						))}
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem
					onClick={handleElementDeleteContext}
					className="text-destructive focus:text-destructive"
				>
					<Trash2 className="h-4 w-4 mr-2" />
					Delete {getElementTypeName(element)}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

// Error Fallback Component for Timeline Elements
const TimelineElementErrorFallback = ({
	resetError,
}: {
	resetError: () => void;
}) => (
	<div className="h-12 bg-destructive/10 border border-destructive/20 rounded flex items-center justify-center text-sm text-destructive">
		<span className="mr-2">⚠️ Element Error</span>
		<button
			onClick={resetError}
			className="underline hover:no-underline"
			type="button"
		>
			Retry
		</button>
	</div>
);

// Export wrapped component with error boundary
export const TimelineElement = withErrorBoundary(TimelineElementComponent, {
	isolate: true, // Only affects this element, not the entire timeline
	fallback: TimelineElementErrorFallback,
});
