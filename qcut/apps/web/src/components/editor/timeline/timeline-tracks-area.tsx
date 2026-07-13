"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { ScrollArea } from "../../ui/scroll-area";
import { Bookmark } from "lucide-react";
import {
	DragDropContext,
	Draggable,
	Droppable,
	type DropResult,
} from "@hello-pangea/dnd";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../../ui/context-menu";
import { SelectionBox } from "../selection-box";
import { TimelineTrackContent } from "./timeline-track";
import { EffectsTimeline } from "./effects-timeline";
import { SpeedRegionRow } from "./speed-region-row";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { EFFECTS_ENABLED } from "@/config/features";
import {
	getTrackHeight,
	getCumulativeHeightBefore,
	getTotalTracksHeight,
	TIMELINE_CONSTANTS,
} from "@/constants/timeline-constants";
import type { RefObject } from "react";
import type { TimelineTrack } from "@/types/timeline";
import type { SnapPoint } from "@/hooks/timeline/use-timeline-snapping";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { TimelineTrackLabel } from "./timeline-track-label";
import type { TimelineVisibleRange } from "./timeline-viewport";

const VIEWPORT_OVERSCAN_SECONDS = 5;

interface TimelineTracksAreaProps {
	tracks: TimelineTrack[];
	zoomLevel: number;
	showEffectsTrack: boolean;
	dynamicTimelineWidth: number;
	clearSelectedElements: () => void;
	toggleTrackMute: (trackId: string) => void;
	toggleTrackSolo: (trackId: string) => void;
	toggleTrackHidden: (trackId: string) => void;
	toggleTrackLocked: (trackId: string) => void;
	beginTrackResize: () => void;
	resizeTrack: (trackId: string, height: number) => void;
	moveTrack: (trackId: string, toIndex: number) => void;
	seek: (time: number) => void;
	handleSnapPointChange: (snapPoint: SnapPoint | null) => void;
	handleWheel: (e: React.WheelEvent) => void;
	pinchHandlers: {
		onPointerDown: (e: React.PointerEvent) => void;
		onPointerMove: (e: React.PointerEvent) => void;
		onPointerUp: (e: React.PointerEvent) => void;
		onPointerCancel: (e: React.PointerEvent) => void;
	};
	handleTimelineMouseDown: (e: React.MouseEvent) => void;
	handleSelectionPointerDown: (e: React.PointerEvent) => void;
	handleTimelineContentClick: (e: React.MouseEvent) => void;
	selectionBox: {
		startPos: { x: number; y: number } | null;
		currentPos: { x: number; y: number } | null;
		isActive: boolean;
	} | null;
	trackLabelsRef: RefObject<HTMLDivElement | null>;
	trackLabelsScrollRef: RefObject<HTMLDivElement | null>;
	tracksScrollRef: RefObject<HTMLDivElement | null>;
	tracksContainerRef: RefObject<HTMLDivElement | null>;
	activeProject: { bookmarks?: number[] } | null;
}

/** Scrollable area containing all timeline tracks and the playhead. */
export function TimelineTracksArea({
	tracks,
	zoomLevel,
	showEffectsTrack,
	dynamicTimelineWidth,
	clearSelectedElements,
	toggleTrackMute,
	toggleTrackSolo,
	toggleTrackHidden,
	toggleTrackLocked,
	beginTrackResize,
	resizeTrack,
	moveTrack,
	seek,
	handleSnapPointChange,
	handleWheel,
	pinchHandlers,
	handleTimelineMouseDown,
	handleSelectionPointerDown,
	handleTimelineContentClick,
	selectionBox,
	trackLabelsRef,
	trackLabelsScrollRef,
	tracksScrollRef,
	tracksContainerRef,
	activeProject,
}: TimelineTracksAreaProps) {
	const [selectedSpeedRegionId, setSelectedSpeedRegionId] = useState<
		string | null
	>(null);
	const [visibleTimeRange, setVisibleTimeRange] =
		useState<TimelineVisibleRange>();
	const viewportFrameRef = useRef(0);
	const hasSpeedRegions = useScreenRecordingEnhancementStore(
		(s) => s.speedRegions.length > 0
	);
	const handleTrackDragEnd = useCallback(
		({ draggableId, destination }: DropResult) => {
			if (!destination) return;
			moveTrack(draggableId, destination.index);
		},
		[moveTrack]
	);

	useEffect(() => {
		const viewport = tracksScrollRef.current;
		if (!viewport) return;
		const updateVisibleRange = () => {
			cancelAnimationFrame(viewportFrameRef.current);
			viewportFrameRef.current = requestAnimationFrame(() => {
				const pixelsPerSecond =
					TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
				const startTime = Math.max(
					0,
					viewport.scrollLeft / pixelsPerSecond - VIEWPORT_OVERSCAN_SECONDS
				);
				const endTime =
					(viewport.scrollLeft + viewport.clientWidth) / pixelsPerSecond +
					VIEWPORT_OVERSCAN_SECONDS;
				setVisibleTimeRange((current) =>
					current &&
					Math.abs(current.startTime - startTime) < 0.2 &&
					Math.abs(current.endTime - endTime) < 0.2
						? current
						: { startTime, endTime }
				);
			});
		};
		updateVisibleRange();
		viewport.addEventListener("scroll", updateVisibleRange, { passive: true });
		const resizeObserver = new ResizeObserver(updateVisibleRange);
		resizeObserver.observe(viewport);
		return () => {
			cancelAnimationFrame(viewportFrameRef.current);
			viewport.removeEventListener("scroll", updateVisibleRange);
			resizeObserver.disconnect();
		};
	}, [tracksScrollRef, zoomLevel]);

	// Compute timeline duration from tracks for speed region positioning
	const timelineDurationMs = useMemo(
		() =>
			tracks.reduce((max, track) => {
				for (const el of track.elements) {
					const end = getTimelineElementEndTime({ element: el }) * 1000;
					if (end > max) max = end;
				}
				return max;
			}, 0),
		[tracks]
	);

	return (
		<div className="flex-1 flex overflow-hidden">
			{/* Track Labels */}
			{tracks.length > 0 && (
				<div
					ref={trackLabelsRef}
					className="w-56 shrink-0 border-r border-black overflow-y-auto z-200 bg-panel"
					data-track-labels
				>
					<ScrollArea className="w-full h-full" ref={trackLabelsScrollRef}>
						<div className="flex flex-col">
							<DragDropContext onDragEnd={handleTrackDragEnd}>
								<Droppable droppableId="timeline-track-order">
									{(droppableProvided) => (
										<div
											ref={droppableProvided.innerRef}
											{...droppableProvided.droppableProps}
										>
											{tracks.map((track, index) => (
												<Draggable
													key={track.id}
													draggableId={track.id}
													index={index}
													isDragDisabled={track.locked}
												>
													{(draggableProvided, snapshot) => (
														<div
															ref={draggableProvided.innerRef}
															{...draggableProvided.draggableProps}
															style={draggableProvided.draggableProps.style}
														>
															<TimelineTrackLabel
																track={track}
																dragHandleProps={
																	draggableProvided.dragHandleProps
																}
																isDragging={snapshot.isDragging}
																onToggleHidden={() =>
																	toggleTrackHidden(track.id)
																}
																onToggleLocked={() =>
																	toggleTrackLocked(track.id)
																}
																onToggleMuted={() => toggleTrackMute(track.id)}
																onToggleSolo={() => toggleTrackSolo(track.id)}
																onResizeStart={beginTrackResize}
																onResizeHeight={(height) =>
																	resizeTrack(track.id, height)
																}
															/>
														</div>
													)}
												</Draggable>
											))}
											{droppableProvided.placeholder}
										</div>
									)}
								</Droppable>
							</DragDropContext>
							{/* Effects Track Label */}
							{EFFECTS_ENABLED && tracks.length > 0 && showEffectsTrack && (
								<div
									className="flex items-center px-3 border-t-2 border-purple-500/30 group bg-purple-500/10"
									style={{ height: "64px" }}
								>
									<div className="flex items-center flex-1 min-w-0">
										<span className="text-sm text-purple-400">Effects</span>
									</div>
								</div>
							)}
						</div>
					</ScrollArea>
				</div>
			)}

			{/* Timeline Tracks Content */}
			<div
				className="flex-1 relative overflow-hidden touch-none"
				onWheel={(e) => {
					if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
						return;
					}
					handleWheel(e);
				}}
				onPointerDown={(e) => {
					// Skip timeline interactions when clicking gap indicators
					if ((e.target as HTMLElement).closest("[data-gap-indicator]")) return;
					pinchHandlers.onPointerDown(e);
					handleTimelineMouseDown(e);
					handleSelectionPointerDown(e);
				}}
				onPointerMove={pinchHandlers.onPointerMove}
				onPointerUp={pinchHandlers.onPointerUp}
				onPointerCancel={pinchHandlers.onPointerCancel}
				onClick={handleTimelineContentClick}
				ref={tracksContainerRef}
			>
				<SelectionBox
					startPos={selectionBox?.startPos || null}
					currentPos={selectionBox?.currentPos || null}
					containerRef={tracksContainerRef}
					isActive={selectionBox?.isActive || false}
				/>
				<div
					className="w-full h-full overflow-x-auto overflow-y-auto timeline-scroll"
					ref={tracksScrollRef}
				>
					<div
						className="relative flex-1"
						style={{
							height: `${Math.max(
								200,
								Math.min(
									800,
									getTotalTracksHeight(tracks) +
										(EFFECTS_ENABLED && tracks.length > 0 && showEffectsTrack
											? TIMELINE_CONSTANTS.TRACK_HEIGHT
											: 0) +
										(hasSpeedRegions && tracks.length > 0 ? 24 : 0)
								)
							)}px`,
							width: `${dynamicTimelineWidth}px`,
						}}
					>
						{tracks.length === 0 ? (
							<div />
						) : (
							<>
								{tracks.map((track, index) => (
									<ContextMenu key={track.id}>
										<ContextMenuTrigger asChild>
											<div
												className={cn(
													"absolute left-0 right-0 border-b border-muted/30 py-[0.05rem]",
													track.hidden && "opacity-55",
													track.locked && "cursor-not-allowed"
												)}
												style={{
													top: `${getCumulativeHeightBefore(tracks, index)}px`,
													height: `${getTrackHeight(track.type, track.height)}px`,
												}}
												onClick={(e) => {
													if (
														!(e.target as HTMLElement).closest(
															".timeline-element"
														)
													) {
														clearSelectedElements();
													}
												}}
											>
												<TimelineTrackContent
													track={track}
													zoomLevel={zoomLevel}
													visibleTimeRange={visibleTimeRange}
													onSnapPointChange={handleSnapPointChange}
												/>
											</div>
										</ContextMenuTrigger>
										<ContextMenuContent className="z-200">
											{(track.type === "media" || track.type === "audio") && (
												<ContextMenuItem
													onClick={(e) => {
														e.stopPropagation();
														toggleTrackMute(track.id);
													}}
												>
													{track.muted ? "Unmute Track" : "Mute Track"}
												</ContextMenuItem>
											)}
											<ContextMenuItem
												onClick={(e) => {
													e.stopPropagation();
													toggleTrackHidden(track.id);
												}}
											>
												{track.hidden ? "Show Track" : "Hide Track"}
											</ContextMenuItem>
											<ContextMenuItem
												onClick={(e) => {
													e.stopPropagation();
													toggleTrackLocked(track.id);
												}}
											>
												{track.locked ? "Unlock Track" : "Lock Track"}
											</ContextMenuItem>
											{activeProject?.bookmarks?.length &&
												activeProject.bookmarks.length > 0 && (
													<>
														<ContextMenuItem disabled>
															Bookmarks
														</ContextMenuItem>
														{activeProject.bookmarks.map((bookmarkTime, i) => (
															<ContextMenuItem
																key={`bookmark-menu-${i}`}
																onClick={(e) => {
																	e.stopPropagation();
																	seek(bookmarkTime);
																}}
															>
																<Bookmark className="h-3 w-3 mr-2 inline-block" />
																{bookmarkTime.toFixed(1)}s
															</ContextMenuItem>
														))}
													</>
												)}
										</ContextMenuContent>
									</ContextMenu>
								))}
								{/* Effects Timeline Visualization */}
								{EFFECTS_ENABLED && tracks.length > 0 && showEffectsTrack && (
									<div
										className="absolute left-0 right-0 border-t-2 border-purple-500/30"
										style={{
											top: `${getTotalTracksHeight(tracks)}px`,
											height: `${TIMELINE_CONSTANTS.TRACK_HEIGHT}px`,
										}}
									>
										<EffectsTimeline
											tracks={tracks}
											pixelsPerSecond={
												TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel
											}
											visibleTimeRange={visibleTimeRange}
										/>
									</div>
								)}

								{/* Speed Region Timeline */}
								{hasSpeedRegions && tracks.length > 0 && (
									<div
										className="absolute left-0 right-0"
										style={{
											top: `${getTotalTracksHeight(tracks) + (EFFECTS_ENABLED && showEffectsTrack ? TIMELINE_CONSTANTS.TRACK_HEIGHT : 0)}px`,
										}}
									>
										<SpeedRegionRow
											totalDurationMs={timelineDurationMs}
											trackWidthPx={dynamicTimelineWidth}
											selectedId={selectedSpeedRegionId}
											onSelect={setSelectedSpeedRegionId}
										/>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
