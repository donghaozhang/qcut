"use client";

import { Bookmark } from "lucide-react";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { TimelineCacheIndicator } from "./timeline-cache-indicator";
import type { RefObject } from "react";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type { WordItem } from "@/types/word-timeline";

interface TimelineRulerProps {
	duration: number;
	zoomLevel: number;
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	activeProject: TProject | null;
	getRenderStatus: (
		time: number,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		activeProject: TProject | null
	) => "cached" | "not-cached";
	rulerRef: RefObject<HTMLDivElement | null>;
	rulerScrollRef: RefObject<HTMLDivElement | null>;
	handleRulerMouseDown: (e: React.MouseEvent) => void;
	handleSelectionMouseDown: (e: React.MouseEvent) => void;
	handleTimelineContentClick: (e: React.MouseEvent) => void;
	handleWheel: (e: React.WheelEvent) => void;
	dynamicTimelineWidth: number;
	aiFilteredWords: WordItem[];
	userRemovedWords: WordItem[];
	silenceGapSegments: WordItem[];
}

/** Renders the timeline ruler with time markers, bookmarks, and word/silence indicators. */
export function TimelineRuler({
	duration,
	zoomLevel,
	tracks,
	mediaItems,
	activeProject,
	getRenderStatus,
	rulerRef,
	rulerScrollRef,
	handleRulerMouseDown,
	handleSelectionMouseDown,
	handleTimelineContentClick,
	handleWheel,
	dynamicTimelineWidth,
	aiFilteredWords,
	userRemovedWords,
	silenceGapSegments,
}: TimelineRulerProps) {
	return (
		<div
			className="flex-1 relative overflow-hidden h-10"
			onWheel={(e) => {
				// Check if this is horizontal scrolling - if so, don't handle it here
				if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
					return; // Let scroll container handle horizontal scrolling
				}
				handleWheel(e);
			}}
			onMouseDown={handleSelectionMouseDown}
			onClick={handleTimelineContentClick}
			data-ruler-area
		>
			<div
				ref={rulerScrollRef}
				className="w-full overflow-x-auto overflow-y-hidden scrollbar-hidden"
			>
				<div
					ref={rulerRef}
					className="relative h-10 select-none cursor-default"
					style={{
						width: `${dynamicTimelineWidth}px`,
					}}
					onMouseDown={handleRulerMouseDown}
				>
					{/* Cache indicator */}
					<TimelineCacheIndicator
						duration={duration}
						zoomLevel={zoomLevel}
						tracks={tracks}
						mediaItems={mediaItems}
						activeProject={activeProject}
						getRenderStatus={getRenderStatus}
					/>

					{/* Time markers */}
					<TimeMarkers duration={duration} zoomLevel={zoomLevel} />

					{/* Bookmark markers */}
					<BookmarkMarkers zoomLevel={zoomLevel} />

					{/* AI filtered word markers (orange regions) */}
					{aiFilteredWords.length > 0 && (
						<WordMarkers
							words={aiFilteredWords}
							zoomLevel={zoomLevel}
							colorClass="bg-orange-500/60"
							hoverColorClass="hover:bg-orange-500/80"
							focusRingClass="focus:ring-orange-400"
							labelPrefix="AI filtered word"
						/>
					)}

					{/* User removed word markers (red regions) */}
					{userRemovedWords.length > 0 && (
						<WordMarkers
							words={userRemovedWords}
							zoomLevel={zoomLevel}
							colorClass="bg-red-500/60"
							hoverColorClass="hover:bg-red-500/80"
							focusRingClass="focus:ring-red-400"
							labelPrefix="User removed word"
						/>
					)}

					{/* Silence gap regions from AI filtering */}
					{silenceGapSegments.length > 0 &&
						silenceGapSegments.map((gap) => {
							const left =
								gap.start * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
							const width = Math.max(
								4,
								(gap.end - gap.start) *
									TIMELINE_CONSTANTS.PIXELS_PER_SECOND *
									zoomLevel
							);
							return (
								<div
									key={`gap-${gap.id}`}
									role="button"
									tabIndex={0}
									className="absolute top-0 h-full bg-orange-400/15 border-x border-orange-400/40 cursor-pointer hover:bg-orange-400/25 focus:ring-2 focus:ring-orange-400 focus:outline-none transition-colors"
									style={{
										left: `${left}px`,
										width: `${width}px`,
									}}
									aria-label={`Filtered silence gap ${gap.start.toFixed(2)} to ${gap.end.toFixed(2)} seconds`}
									onClick={(event) => {
										event.stopPropagation();
										usePlaybackStore.getState().seek(gap.start);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											event.stopPropagation();
											usePlaybackStore.getState().seek(gap.start);
										}
									}}
								/>
							);
						})}
				</div>
			</div>
		</div>
	);
}

/** Calculate appropriate time interval based on zoom level */
function getTimeInterval(zoom: number, totalDuration: number) {
	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoom;

	// For very short durations, ensure we have enough markers to show progression
	if (totalDuration <= 5) {
		if (pixelsPerSecond >= 100) return 0.1;
		if (pixelsPerSecond >= 50) return 0.25;
		return 0.5;
	}

	// Standard intervals for longer content
	if (pixelsPerSecond >= 200) return 0.1;
	if (pixelsPerSecond >= 100) return 0.5;
	if (pixelsPerSecond >= 50) return 1;
	if (pixelsPerSecond >= 25) return 2;
	if (pixelsPerSecond >= 12) return 5;
	if (pixelsPerSecond >= 6) return 10;
	return 30;
}

function formatTime(seconds: number, interval: number) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${Math.floor(secs).toString().padStart(2, "0")}`;
	}
	if (minutes > 0) {
		return `${minutes}:${Math.floor(secs).toString().padStart(2, "0")}`;
	}

	if (interval >= 1) return `${Math.floor(secs)}s`;
	if (interval >= 0.1) return `${secs.toFixed(1)}s`;
	return `${secs.toFixed(2)}s`;
}

function TimeMarkers({
	duration,
	zoomLevel,
}: {
	duration: number;
	zoomLevel: number;
}) {
	const interval = getTimeInterval(zoomLevel, duration);
	const markerCount = Math.max(Math.ceil(duration / interval) + 1, 10);

	return (
		<>
			{Array.from({ length: markerCount }, (_, i) => {
				const time = i * interval;
				if (time > duration) return null;

				const isMainMarker =
					time % (interval >= 1 ? Math.max(1, interval) : 1) === 0;

				return (
					<div
						key={i}
						className={`absolute top-0 h-4 ${
							isMainMarker
								? "border-l border-muted-foreground/40"
								: "border-l border-muted-foreground/20"
						}`}
						style={{
							left: `${time * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel}px`,
						}}
					>
						<span
							className={`absolute top-1 left-1 text-[0.6rem] ${
								isMainMarker
									? "text-muted-foreground font-medium"
									: "text-muted-foreground/70"
							}`}
						>
							{formatTime(time, interval)}
						</span>
					</div>
				);
			}).filter(Boolean)}
		</>
	);
}

const selectBookmarks = (state: { activeProject: TProject | null }) =>
	state.activeProject?.bookmarks;

function BookmarkMarkers({ zoomLevel }: { zoomLevel: number }) {
	const bookmarks = useProjectStore(selectBookmarks);
	if (!bookmarks?.length) return null;

	return (
		<>
			{bookmarks.map((bookmarkTime, i) => (
				<div
					key={`bookmark-${i}`}
					role="button"
					tabIndex={0}
					aria-label={`Bookmark at ${bookmarkTime.toFixed(1)}s`}
					className="absolute top-0 h-10 w-0.5 !bg-primary cursor-pointer focus:ring-2 focus:ring-primary focus:outline-none"
					style={{
						left: `${bookmarkTime * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel}px`,
					}}
					onClick={(e) => {
						e.stopPropagation();
						usePlaybackStore.getState().seek(bookmarkTime);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							e.stopPropagation();
							usePlaybackStore.getState().seek(bookmarkTime);
						}
					}}
				>
					<div className="absolute top-[-1px] left-[-5px] text-primary">
						<Bookmark className="h-3 w-3 fill-primary" />
					</div>
				</div>
			))}
		</>
	);
}

function WordMarkers({
	words,
	zoomLevel,
	colorClass,
	hoverColorClass,
	focusRingClass,
	labelPrefix,
}: {
	words: WordItem[];
	zoomLevel: number;
	colorClass: string;
	hoverColorClass: string;
	focusRingClass: string;
	labelPrefix: string;
}) {
	return (
		<>
			{words.map((word) => {
				const left =
					word.start * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
				const width = Math.max(
					2,
					(word.end - word.start) *
						TIMELINE_CONSTANTS.PIXELS_PER_SECOND *
						zoomLevel
				);
				return (
					<div
						key={`${labelPrefix}-${word.id}`}
						role="button"
						tabIndex={0}
						className={`absolute bottom-0 h-2 ${colorClass} cursor-pointer ${hoverColorClass} focus:ring-2 ${focusRingClass} focus:outline-none transition-colors`}
						style={{
							left: `${left}px`,
							width: `${width}px`,
						}}
						aria-label={`${labelPrefix}: ${word.text}, ${word.start.toFixed(2)} to ${word.end.toFixed(2)} seconds`}
						onClick={(e) => {
							e.stopPropagation();
							usePlaybackStore.getState().seek(word.start);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								e.stopPropagation();
								usePlaybackStore.getState().seek(word.start);
							}
						}}
					/>
				);
			})}
		</>
	);
}
