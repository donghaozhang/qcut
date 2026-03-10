"use client";

import { useRef, useState, useEffect } from "react";
import { TimelineTrack } from "@/types/timeline";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useTimelinePlayhead } from "@/hooks/timeline/use-timeline-playhead";

interface TimelinePlayheadProps {
	currentTime: number;
	duration: number;
	zoomLevel: number;
	tracks: TimelineTrack[];
	seek: (time: number) => void;
	rulerRef: React.RefObject<HTMLDivElement | null>;
	rulerScrollRef: React.RefObject<HTMLDivElement | null>;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
	trackLabelsRef?: React.RefObject<HTMLDivElement | null>;
	timelineRef: React.RefObject<HTMLDivElement | null>;
	playheadRef?: React.RefObject<HTMLDivElement | null>;
	isSnappingToPlayhead?: boolean;
}

export function TimelinePlayhead({
	currentTime,
	duration,
	zoomLevel,
	tracks,
	seek,
	rulerRef,
	rulerScrollRef,
	tracksScrollRef,
	trackLabelsRef,
	timelineRef,
	playheadRef: externalPlayheadRef,
	isSnappingToPlayhead = false,
}: TimelinePlayheadProps) {
	const internalPlayheadRef = useRef<HTMLDivElement>(null);
	const playheadRef = externalPlayheadRef || internalPlayheadRef;
	const [scrollLeft, setScrollLeft] = useState(0);

	const { playheadPosition, handlePlayheadPointerDown } = useTimelinePlayhead({
		currentTime,
		duration,
		zoomLevel,
		seek,
		rulerRef,
		rulerScrollRef,
		tracksScrollRef,
		playheadRef,
	});

	// Track scroll position to lock playhead to frame
	useEffect(() => {
		const tracksViewport = tracksScrollRef.current as HTMLElement;

		if (!tracksViewport) return;

		const handleScroll = () => {
			setScrollLeft(tracksViewport.scrollLeft);
		};

		// Set initial scroll position
		setScrollLeft(tracksViewport.scrollLeft);

		tracksViewport.addEventListener("scroll", handleScroll);
		return () => tracksViewport.removeEventListener("scroll", handleScroll);
	}, [tracksScrollRef]);

	// Use timeline container height minus a few pixels for breathing room
	const timelineContainerHeight = timelineRef.current?.offsetHeight || 400;
	const totalHeight = timelineContainerHeight - 8; // 8px padding from edges

	// Get dynamic track labels width, fallback to 0 if no tracks or no ref
	const trackLabelsWidth =
		tracks.length > 0 && trackLabelsRef?.current
			? trackLabelsRef.current.offsetWidth
			: 0;

	// Calculate position locked to timeline content (accounting for scroll)
	const timelinePosition =
		playheadPosition * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const rawLeftPosition = trackLabelsWidth + timelinePosition - scrollLeft;

	// Get the timeline content width and viewport width for right boundary
	const timelineContentWidth =
		duration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const tracksViewport = tracksScrollRef.current as HTMLElement;
	const viewportWidth = tracksViewport?.clientWidth || 1000;

	// Constrain playhead to never appear outside the timeline area
	const leftBoundary = trackLabelsWidth;
	const rightBoundary = Math.min(
		trackLabelsWidth + timelineContentWidth - scrollLeft, // Don't go beyond timeline content
		trackLabelsWidth + viewportWidth // Don't go beyond viewport
	);

	const leftPosition = Math.max(
		leftBoundary,
		Math.min(rightBoundary, rawLeftPosition)
	);

	return (
		<div
			ref={playheadRef}
			className="absolute pointer-events-auto z-150"
			style={{
				left: `${leftPosition}px`,
				top: 0,
				height: `${totalHeight}px`,
				width: "2px", // Slightly wider for better click target
			}}
			onPointerDown={handlePlayheadPointerDown}
		>
			{/* The playhead line spanning full height */}
			<div
				className={`absolute left-0 w-0.5 cursor-col-resize h-full ${isSnappingToPlayhead ? "bg-primary" : "bg-foreground"}`}
			/>

			{/* Playhead dot indicator at the top (in ruler area) */}
			<div
				className={`absolute top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full border-2 shadow-xs ${isSnappingToPlayhead ? "bg-primary border-primary" : "bg-foreground border-foreground"}`}
			/>
		</div>
	);
}

// Also export a hook for getting ruler handlers
export function useTimelinePlayheadRuler({
	currentTime,
	duration,
	zoomLevel,
	seek,
	rulerRef,
	rulerScrollRef,
	tracksScrollRef,
	playheadRef,
}: Omit<TimelinePlayheadProps, "tracks" | "trackLabelsRef" | "timelineRef">) {
	const { handleRulerPointerDown, isDraggingRuler } = useTimelinePlayhead({
		currentTime,
		duration,
		zoomLevel,
		seek,
		rulerRef,
		rulerScrollRef,
		tracksScrollRef,
		playheadRef,
	});

	return { handleRulerPointerDown, isDraggingRuler };
}

export { TimelinePlayhead as default };
