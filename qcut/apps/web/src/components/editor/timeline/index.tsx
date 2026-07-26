"use client";

import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useAsyncMediaStore } from "@/hooks/media/use-async-media-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useFrameCache } from "@/hooks/timeline/use-frame-cache";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineZoom } from "@/hooks/timeline/use-timeline-zoom";
import { useState, useRef, useEffect, useCallback } from "react";
import {
	TimelinePlayhead,
	useTimelinePlayheadRuler,
} from "./timeline-playhead";
import { useSelectionBox } from "@/hooks/timeline/use-selection-box";
import { SnapIndicator } from "../snap-indicator";
import type { SnapPoint } from "@/hooks/timeline/use-timeline-snapping";
import { calculateMinimumTimelineDuration } from "@/constants/timeline-constants";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import { WORD_FILTER_STATE } from "@/types/word-timeline";
import { TimelineToolbar } from "./timeline-toolbar";
import { useDragHandlers } from "./timeline-drag-handlers";
import { useTimelineDimensions } from "./hooks/use-timeline-dimensions";
import { useTimelineScrollSync } from "./hooks/use-timeline-scroll-sync";
import { useTimelineClickHandler } from "./hooks/use-timeline-click-handler";
import { TimelineRuler } from "./timeline-ruler";
import { TimelineTracksArea } from "./timeline-tracks-area";
import { GapGenerationModal } from "./gap-generation-modal";

export function Timeline() {
	// Individual selectors to prevent infinite loops with useSyncExternalStore
	const tracks = useTimelineStore((s) => s.tracks);
	const getTotalDuration = useTimelineStore((s) => s.getTotalDuration);
	const clearSelectedElements = useTimelineStore(
		(s) => s.clearSelectedElements
	);
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const showEffectsTrack = useTimelineStore((s) => s.showEffectsTrack);
	const setSelectedElements = useTimelineStore((s) => s.setSelectedElements);
	const toggleTrackMute = useTimelineStore((s) => s.toggleTrackMute);
	const toggleTrackSolo = useTimelineStore((s) => s.toggleTrackSolo);
	const toggleTrackHidden = useTimelineStore((s) => s.toggleTrackHidden);
	const toggleTrackLocked = useTimelineStore((s) => s.toggleTrackLocked);
	const updateTrackHeight = useTimelineStore((s) => s.updateTrackHeight);
	const pushHistory = useTimelineStore((s) => s.pushHistory);
	const moveTrack = useTimelineStore((s) => s.moveTrack);
	const dragState = useTimelineStore((s) => s.dragState);
	const {
		store: mediaStore,
		loading: mediaStoreLoading,
		error: mediaStoreError,
	} = useAsyncMediaStore();
	const mediaItems = mediaStore?.mediaItems || [];
	const addMediaItem = mediaStore?.addMediaItem;
	const activeProject = useProjectStore((s) => s.activeProject);
	const duration = usePlaybackStore((s) => s.duration);
	const seek = usePlaybackStore((s) => s.seek);
	const setDuration = usePlaybackStore((s) => s.setDuration);
	const previewQuality = usePlaybackStore((s) => s.previewQuality);
	const runtimePreviewQuality = usePlaybackStore(
		(s) => s.runtimePreviewQuality
	);

	// Get word-level transcription for the ruler lane and filtered silence regions.
	const wordTimelineData = useWordTimelineStore((s) => s.data);
	const timelineWords = wordTimelineData?.words ?? [];
	const silenceGapSegments =
		wordTimelineData?.words.filter(
			(word) =>
				word.type === "spacing" &&
				(word.filterState === WORD_FILTER_STATE.AI ||
					word.filterState === WORD_FILTER_STATE.USER_REMOVE)
		) || [];

	const timelineRef = useRef<HTMLDivElement>(null);
	const rulerRef = useRef<HTMLDivElement>(null);
	const [isInTimeline, setIsInTimeline] = useState(false);

	// Timeline zoom functionality
	const { zoomLevel, setZoomLevel, handleWheel, pinchHandlers } =
		useTimelineZoom({
			containerRef: timelineRef,
			isInTimeline,
		});
	// Scroll synchronization refs (tracksScrollRef also resolves background
	// drop positions in useDragHandlers)
	const rulerScrollRef = useRef<HTMLDivElement>(null);
	const tracksScrollRef = useRef<HTMLDivElement>(null);

	const { dragProps } = useDragHandlers({
		mediaItems,
		addMediaItem,
		activeProject,
		tracksScrollRef,
		zoomLevel,
	});

	// Dynamic timeline width calculation
	const { dynamicTimelineWidth } = useTimelineDimensions({
		duration,
		zoomLevel,
		containerRef: timelineRef,
	});
	const trackLabelsRef = useRef<HTMLDivElement>(null);
	const playheadRef = useRef<HTMLDivElement>(null);
	const trackLabelsScrollRef = useRef<HTMLDivElement>(null);

	// Cache status tracking
	const { getRenderStatus } = useFrameCache({
		namespace: activeProject?.id ?? "default",
		cacheIdentity: `preview-quality:${runtimePreviewQuality ?? previewQuality}`,
	});

	// Timeline playhead ruler handlers
	const { handleRulerPointerDown } = useTimelinePlayheadRuler({
		duration,
		zoomLevel,
		seek,
		rulerRef,
		rulerScrollRef,
		tracksScrollRef,
		playheadRef,
	});

	// Selection box functionality
	const tracksContainerRef = useRef<HTMLDivElement>(null);
	const {
		selectionBox,
		handlePointerDown: handleSelectionPointerDown,
		isSelecting,
		justFinishedSelecting,
	} = useSelectionBox({
		containerRef: tracksContainerRef,
		playheadRef,
		onSelectionComplete: (elements) => {
			setSelectedElements(elements);
		},
	});

	// Calculate snap indicator state
	const [currentSnapPoint, setCurrentSnapPoint] = useState<SnapPoint | null>(
		null
	);
	const showSnapIndicator =
		dragState.isDragging && snappingEnabled && currentSnapPoint !== null;

	const handleSnapPointChange = useCallback((snapPoint: SnapPoint | null) => {
		setCurrentSnapPoint(snapPoint);
	}, []);

	// Click/mouse handlers
	const { handleTimelineMouseDown, handleTimelineContentClick } =
		useTimelineClickHandler({
			duration,
			zoomLevel,
			seek,
			clearSelectedElements,
			isSelecting,
			justFinishedSelecting,
			projectFps: activeProject?.fps || 30,
			playheadRef,
			rulerScrollRef,
			tracksScrollRef,
		});

	// Scroll synchronization
	useTimelineScrollSync({
		rulerScrollRef,
		tracksScrollRef,
		trackLabelsScrollRef,
		mediaStoreLoading,
		tracksLength: tracks.length,
	});

	// Update timeline duration when tracks change
	// biome-ignore lint/correctness/useExhaustiveDependencies: tracks is necessary - getTotalDuration() reads from store but reference doesn't change when tracks change
	useEffect(() => {
		const totalDuration = getTotalDuration();
		setDuration(calculateMinimumTimelineDuration(totalDuration));
	}, [tracks, setDuration, getTotalDuration]);

	// Handle media store loading/error states
	if (mediaStoreError) {
		console.error("Failed to load media store:", mediaStoreError);
		return (
			<div className="flex items-center justify-center h-full text-red-500">
				Failed to load media store: {mediaStoreError.message}
			</div>
		);
	}

	if (mediaStoreLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div
			className={
				"h-full flex flex-col transition-colors duration-200 relative bg-panel rounded-sm overflow-hidden"
			}
			{...dragProps}
			onMouseEnter={() => setIsInTimeline(true)}
			onMouseLeave={() => setIsInTimeline(false)}
		>
			<TimelineToolbar zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} />

			{/* Timeline Container */}
			<div
				className="flex-1 flex flex-col overflow-hidden relative"
				ref={timelineRef}
			>
				<TimelinePlayhead
					duration={duration}
					zoomLevel={zoomLevel}
					tracks={tracks}
					seek={seek}
					rulerRef={rulerRef}
					rulerScrollRef={rulerScrollRef}
					tracksScrollRef={tracksScrollRef}
					trackLabelsRef={trackLabelsRef}
					timelineRef={timelineRef}
					playheadRef={playheadRef}
					isSnappingToPlayhead={
						showSnapIndicator && currentSnapPoint?.type === "playhead"
					}
				/>
				<SnapIndicator
					snapPoint={currentSnapPoint}
					zoomLevel={zoomLevel}
					tracks={tracks}
					timelineRef={timelineRef}
					trackLabelsRef={trackLabelsRef}
					tracksScrollRef={tracksScrollRef}
					isVisible={showSnapIndicator}
				/>
				{/* Timeline Header with Ruler */}
				<div className="flex bg-panel sticky top-0 z-10">
					{/* Track Labels Header */}
					<div className="w-56 shrink-0 bg-panel border-r flex items-center justify-between px-3 py-2">
						<span className="text-sm font-medium text-muted-foreground opacity-0">
							.
						</span>
					</div>

					{/* Timeline Ruler */}
					<TimelineRuler
						duration={duration}
						zoomLevel={zoomLevel}
						tracks={tracks}
						mediaItems={mediaItems}
						activeProject={activeProject}
						getRenderStatus={getRenderStatus}
						rulerRef={rulerRef}
						rulerScrollRef={rulerScrollRef}
						handleRulerPointerDown={handleRulerPointerDown}
						handleSelectionPointerDown={handleSelectionPointerDown}
						handleTimelineContentClick={handleTimelineContentClick}
						handleWheel={handleWheel}
						pinchHandlers={pinchHandlers}
						dynamicTimelineWidth={dynamicTimelineWidth}
						words={timelineWords}
						silenceGapSegments={silenceGapSegments}
					/>
				</div>

				{/* Tracks Area */}
				<TimelineTracksArea
					tracks={tracks}
					zoomLevel={zoomLevel}
					showEffectsTrack={showEffectsTrack}
					dynamicTimelineWidth={dynamicTimelineWidth}
					clearSelectedElements={clearSelectedElements}
					toggleTrackMute={toggleTrackMute}
					toggleTrackSolo={toggleTrackSolo}
					toggleTrackHidden={toggleTrackHidden}
					toggleTrackLocked={toggleTrackLocked}
					beginTrackResize={pushHistory}
					resizeTrack={(trackId, height) =>
						updateTrackHeight(trackId, height, false)
					}
					moveTrack={moveTrack}
					seek={seek}
					handleSnapPointChange={handleSnapPointChange}
					handleWheel={handleWheel}
					pinchHandlers={pinchHandlers}
					handleTimelineMouseDown={handleTimelineMouseDown}
					handleSelectionPointerDown={handleSelectionPointerDown}
					handleTimelineContentClick={handleTimelineContentClick}
					selectionBox={selectionBox}
					trackLabelsRef={trackLabelsRef}
					trackLabelsScrollRef={trackLabelsScrollRef}
					tracksScrollRef={tracksScrollRef}
					tracksContainerRef={tracksContainerRef}
					activeProject={activeProject}
				/>
			</div>

			<GapGenerationModal />
		</div>
	);
}
