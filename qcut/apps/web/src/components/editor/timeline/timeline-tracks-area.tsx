"use client";

import { ScrollArea } from "../../ui/scroll-area";
import { Bookmark } from "lucide-react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../../ui/context-menu";
import { SelectionBox } from "../selection-box";
import { TimelineTrackContent } from "./timeline-track";
import { EffectsTimeline } from "./effects-timeline";
import { TrackIcon } from "./track-icon";
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

interface TimelineTracksAreaProps {
	tracks: TimelineTrack[];
	zoomLevel: number;
	showEffectsTrack: boolean;
	dynamicTimelineWidth: number;
	clearSelectedElements: () => void;
	toggleTrackMute: (trackId: string) => void;
	seek: (time: number) => void;
	handleSnapPointChange: (snapPoint: SnapPoint | null) => void;
	handleWheel: (e: React.WheelEvent) => void;
	handleTimelineMouseDown: (e: React.MouseEvent) => void;
	handleSelectionMouseDown: (e: React.MouseEvent) => void;
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

export function TimelineTracksArea({
	tracks,
	zoomLevel,
	showEffectsTrack,
	dynamicTimelineWidth,
	clearSelectedElements,
	toggleTrackMute,
	seek,
	handleSnapPointChange,
	handleWheel,
	handleTimelineMouseDown,
	handleSelectionMouseDown,
	handleTimelineContentClick,
	selectionBox,
	trackLabelsRef,
	trackLabelsScrollRef,
	tracksScrollRef,
	tracksContainerRef,
	activeProject,
}: TimelineTracksAreaProps) {
	return (
		<div className="flex-1 flex overflow-hidden">
			{/* Track Labels */}
			{tracks.length > 0 && (
				<div
					ref={trackLabelsRef}
					className="w-48 shrink-0 border-r border-black overflow-y-auto z-200 bg-panel"
					data-track-labels
				>
					<ScrollArea className="w-full h-full" ref={trackLabelsScrollRef}>
						<div className="flex flex-col gap-1">
							{tracks.map((track) => (
								<div
									key={track.id}
									className="flex items-center px-3 border-b border-muted/30 group bg-foreground/5"
									style={{ height: `${getTrackHeight(track.type)}px` }}
								>
									<div className="flex items-center flex-1 min-w-0">
										<TrackIcon type={track.type} />
									</div>
									{track.muted && (
										<span className="ml-2 text-xs text-red-500 font-semibold shrink-0">
											Muted
										</span>
									)}
								</div>
							))}
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
				className="flex-1 relative overflow-hidden"
				onWheel={(e) => {
					if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
						return;
					}
					handleWheel(e);
				}}
				onMouseDown={(e) => {
					handleTimelineMouseDown(e);
					handleSelectionMouseDown(e);
				}}
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
											: 0)
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
												className="absolute left-0 right-0 border-b border-muted/30 py-[0.05rem]"
												style={{
													top: `${getCumulativeHeightBefore(tracks, index)}px`,
													height: `${getTrackHeight(track.type)}px`,
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
													onSnapPointChange={handleSnapPointChange}
												/>
											</div>
										</ContextMenuTrigger>
										<ContextMenuContent className="z-200">
											<ContextMenuItem
												onClick={(e) => {
													e.stopPropagation();
													toggleTrackMute(track.id);
												}}
											>
												{track.muted ? "Unmute Track" : "Mute Track"}
											</ContextMenuItem>
											<ContextMenuItem onClick={(e) => e.stopPropagation()}>
												Track settings (soon)
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
