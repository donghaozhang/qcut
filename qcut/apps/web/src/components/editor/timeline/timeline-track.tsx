"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { toast } from "sonner";
import { TimelineElement } from "./timeline-element";
import { GapIndicator } from "./gap-indicator";
import {
	TimelineTrack,
	sortTracksByOrder,
	ensureMainTrack,
	getMainTrack,
	canElementGoOnTrack,
} from "@/types/timeline";
import { detectTimelineGaps } from "@/stores/timeline/gap-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type {
	TimelineElement as TimelineElementType,
	DragData,
} from "@/types/timeline";
import {
	snapTimeToFrame,
	TIMELINE_CONSTANTS,
	getTrackHeight,
} from "@/constants/timeline-constants";
import { useProjectStore } from "@/stores/project-store";
import { useExportStore } from "@/stores/export-store";
import {
	useTimelineSnapping,
	SnapPoint,
} from "@/hooks/timeline/use-timeline-snapping";
import { withErrorBoundary } from "@/components/error-boundary";
import { useTrackDrop } from "./use-track-drop";
import {
	getTimelineElementDuration,
	getTimelineElementEndTime,
} from "@/lib/timeline";
import { TimelineTransitionMarker } from "./timeline-transition-marker";
import { isTransitionDrag, useTransitionDrop } from "./use-transition-drop";
import {
	getVisibleTimelineElements,
	type TimelineVisibleRange,
} from "./timeline-viewport";
import { getVideoMediaIds } from "@/lib/transitions/video-transition-eligibility";
import { isTimelineEntityTarget } from "./timeline-click-target";

function TimelineTrackContentComponent({
	track,
	zoomLevel,
	onSnapPointChange,
	visibleTimeRange,
}: {
	track: TimelineTrack;
	zoomLevel: number;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	visibleTimeRange?: TimelineVisibleRange;
}) {
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	const videoMediaIds = useMemo(
		() => getVideoMediaIds({ mediaItems }),
		[mediaItems]
	);
	// Use individual selectors to keep snapshots stable and avoid infinite update loops
	const tracks = useTimelineStore((s) => s.tracks);
	const moveElementToTrack = useTimelineStore((s) => s.moveElementToTrack);
	const updateElementStartTime = useTimelineStore(
		(s) => s.updateElementStartTime
	);
	const updateElementStartTimeWithRipple = useTimelineStore(
		(s) => s.updateElementStartTimeWithRipple
	);
	const selectedElements = useTimelineStore((s) => s.selectedElements);
	const selectElement = useTimelineStore((s) => s.selectElement);
	const dragState = useTimelineStore((s) => s.dragState);
	const startDragAction = useTimelineStore((s) => s.startDrag);
	const updateDragTime = useTimelineStore((s) => s.updateDragTime);
	const endDragAction = useTimelineStore((s) => s.endDrag);
	const clearSelectedElements = useTimelineStore(
		(s) => s.clearSelectedElements
	);
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const splitElement = useTimelineStore((s) => s.splitElement);

	// Initialize snapping hook
	const { snapElementPosition, snapElementEdge } = useTimelineSnapping({
		snapThreshold: 10,
		enableElementSnapping: snappingEnabled,
		enablePlayheadSnapping: snappingEnabled,
	});

	// Initialize all hooks before any conditional returns
	const timelineRef = useRef<HTMLDivElement>(null);
	const { handleTransitionDragOver, handleTransitionDrop } = useTransitionDrop({
		track,
		zoomLevel,
		timelineRef,
		videoMediaIds,
	});
	// Ref (not state) so recording the mouse-down position does NOT trigger a
	// re-render. Re-rendering the clip subtree between mousedown and mouseup
	// causes the browser to drop the synthetic click event, breaking selection.
	const mouseDownLocationRef = useRef<{ x: number; y: number } | null>(null);
	// Pending drag captured on mousedown; promoted to a real drag only after
	// the pointer moves past the 5 px threshold. Until then the clip does not
	// re-render, so React's onClick still fires for plain clicks.
	const pendingDragRef = useRef<{
		elementId: string;
		trackId: string;
		startMouseX: number;
		startElementTime: number;
		clickOffsetTime: number;
	} | null>(null);
	// Window-level listeners attached during the pre-threshold pending-drag
	// window leak if the component unmounts between mousedown and mouseup
	// (e.g. a track is removed mid-press). Hold a cleanup callback in a ref so
	// the unmount effect below can tear them down.
	const pendingListenersCleanupRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		return () => {
			pendingListenersCleanupRef.current?.();
			pendingListenersCleanupRef.current = null;
		};
	}, []);

	// Drop handling hook
	const {
		isDropping,
		wouldOverlap,
		dropPosition,
		handleTrackDragOver,
		handleTrackDragEnter,
		handleTrackDragLeave,
		handleTrackDrop,
		handleTouchDrop,
	} = useTrackDrop({ track, zoomLevel });

	// Set up mouse event listeners for drag - moved before early return to fix hook order
	useEffect(() => {
		if (!dragState.isDragging || track.locked) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current) return;

			// On first mouse move during drag, ensure the element is selected
			if (dragState.elementId && dragState.trackId) {
				const isSelected = selectedElements.some(
					(c) =>
						c.trackId === dragState.trackId &&
						c.elementId === dragState.elementId
				);

				if (!isSelected) {
					// Select this element (replacing other selections) since we're dragging it
					selectElement(dragState.trackId, dragState.elementId, false);
				}
			}

			const timelineRect = timelineRef.current.getBoundingClientRect();
			const mouseX = e.clientX - timelineRect.left;
			const mouseTime = Math.max(
				0,
				mouseX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel)
			);
			const adjustedTime = Math.max(0, mouseTime - dragState.clickOffsetTime);

			// Apply snapping if enabled
			let finalTime = adjustedTime;
			let snapPoint = null;
			if (snappingEnabled) {
				const currentTime = usePlaybackStore.getState().currentTime;
				// Find the element being dragged to get its duration
				let elementDuration = 5; // fallback duration
				if (dragState.elementId && dragState.trackId) {
					const sourceTrack = tracks.find((t) => t.id === dragState.trackId);
					const element = sourceTrack?.elements.find(
						(e) => e.id === dragState.elementId
					);
					if (element) {
						elementDuration = getTimelineElementDuration({ element });
					}
				}

				// Try snapping both start and end edges
				const startSnapResult = snapElementEdge(
					adjustedTime,
					elementDuration,
					tracks,
					currentTime,
					zoomLevel,
					dragState.elementId || undefined,
					true // snap to start edge
				);

				const endSnapResult = snapElementEdge(
					adjustedTime,
					elementDuration,
					tracks,
					currentTime,
					zoomLevel,
					dragState.elementId || undefined,
					false // snap to end edge
				);

				// Choose the snap result with the smaller distance (closer snap)
				let bestSnapResult = startSnapResult;
				if (
					endSnapResult.snapPoint &&
					(!startSnapResult.snapPoint ||
						endSnapResult.snapDistance < startSnapResult.snapDistance)
				) {
					bestSnapResult = endSnapResult;
				}

				finalTime = bestSnapResult.snappedTime;
				snapPoint = bestSnapResult.snapPoint;

				// Notify parent component about snap point change
				onSnapPointChange?.(snapPoint);
			} else {
				// Use frame snapping if project has FPS, otherwise use decimal snapping
				const projectStore = useProjectStore.getState();
				const projectFps = projectStore.activeProject?.fps || 30;
				finalTime = snapTimeToFrame(adjustedTime, projectFps);

				// Clear snap point when not snapping
				onSnapPointChange?.(null);
			}

			updateDragTime(finalTime);
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (!dragState.elementId || !dragState.trackId) return;

			// If this track initiated the drag, we should handle the mouse up regardless of where it occurs
			const isTrackThatStartedDrag = dragState.trackId === track.id;

			const timelineRect = timelineRef.current?.getBoundingClientRect();
			if (!timelineRect) {
				if (isTrackThatStartedDrag) {
					if (rippleEditingEnabled) {
						updateElementStartTimeWithRipple(
							track.id,
							dragState.elementId,
							dragState.currentTime
						);
					} else {
						updateElementStartTime(
							track.id,
							dragState.elementId,
							dragState.currentTime
						);
					}
					endDragAction();
					// Clear snap point when drag ends
					onSnapPointChange?.(null);
				}
				return;
			}

			const isMouseOverThisTrack =
				e.clientY >= timelineRect.top && e.clientY <= timelineRect.bottom;

			if (!isMouseOverThisTrack && !isTrackThatStartedDrag) return;

			const finalTime = dragState.currentTime;

			if (isMouseOverThisTrack) {
				const sourceTrack = tracks.find((t) => t.id === dragState.trackId);
				const movingElement = sourceTrack?.elements.find(
					(c) => c.id === dragState.elementId
				);

				if (movingElement) {
					const movingElementDuration = getTimelineElementDuration({
						element: movingElement,
					});
					const movingElementEnd = finalTime + movingElementDuration;

					const targetTrack = tracks.find((t) => t.id === track.id);
					const hasOverlap = targetTrack?.elements.some((existingElement) => {
						if (
							dragState.trackId === track.id &&
							existingElement.id === dragState.elementId
						) {
							return false;
						}
						const existingStart = existingElement.startTime;
						const existingEnd = getTimelineElementEndTime({
							element: existingElement,
						});
						return finalTime < existingEnd && movingElementEnd > existingStart;
					});

					if (!hasOverlap) {
						if (dragState.trackId === track.id) {
							if (rippleEditingEnabled) {
								updateElementStartTimeWithRipple(
									track.id,
									dragState.elementId,
									finalTime
								);
							} else {
								updateElementStartTime(
									track.id,
									dragState.elementId,
									finalTime
								);
							}
						} else {
							moveElementToTrack(
								dragState.trackId,
								track.id,
								dragState.elementId
							);
							requestAnimationFrame(() => {
								if (rippleEditingEnabled) {
									updateElementStartTimeWithRipple(
										track.id,
										dragState.elementId!,
										finalTime
									);
								} else {
									updateElementStartTime(
										track.id,
										dragState.elementId!,
										finalTime
									);
								}
							});
						}
					}
				}
			} else if (isTrackThatStartedDrag) {
				// Mouse is not over this track, but this track started the drag
				// This means user released over ruler/outside - update position within same track
				const sourceTrack = tracks.find((t) => t.id === dragState.trackId);
				const movingElement = sourceTrack?.elements.find(
					(c) => c.id === dragState.elementId
				);

				if (movingElement) {
					const movingElementDuration = getTimelineElementDuration({
						element: movingElement,
					});
					const movingElementEnd = finalTime + movingElementDuration;

					const hasOverlap = track.elements.some((existingElement) => {
						if (existingElement.id === dragState.elementId) {
							return false;
						}
						const existingStart = existingElement.startTime;
						const existingEnd = getTimelineElementEndTime({
							element: existingElement,
						});
						return finalTime < existingEnd && movingElementEnd > existingStart;
					});

					if (!hasOverlap) {
						if (rippleEditingEnabled) {
							updateElementStartTimeWithRipple(
								track.id,
								dragState.elementId,
								finalTime
							);
						} else {
							updateElementStartTime(track.id, dragState.elementId, finalTime);
						}
					}
				}
			}

			if (isTrackThatStartedDrag) {
				endDragAction();
				// Clear snap point when drag ends
				onSnapPointChange?.(null);
			}
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [
		dragState.isDragging,
		dragState.clickOffsetTime,
		dragState.elementId,
		dragState.trackId,
		dragState.currentTime,
		zoomLevel,
		tracks,
		track.id,
		track.elements,
		track.locked,
		updateDragTime,
		updateElementStartTime,
		updateElementStartTimeWithRipple,
		moveElementToTrack,
		endDragAction,
		selectedElements,
		selectElement,
		onSnapPointChange,
		rippleEditingEnabled,
		snappingEnabled,
		snapElementEdge,
	]);

	const dropZoneRef = useRef<HTMLDivElement>(null);

	// Listen for touch-drop events (iOS/iPad touch drag fallback)
	useEffect(() => {
		const el = dropZoneRef.current;
		if (!el || track.locked) return;

		const onTouchDrop = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (!detail?.data) return;
			const trackContainer = el.querySelector(
				".track-elements-container"
			) as HTMLElement;
			if (!trackContainer) return;
			handleTouchDrop(
				trackContainer,
				detail.data,
				detail.clientX,
				detail.clientY
			);
		};

		el.addEventListener("touch-drop", onTouchDrop);
		return () => el.removeEventListener("touch-drop", onTouchDrop);
	}, [handleTouchDrop, track.locked]);

	// Memoize gap detection to avoid recomputing on every render
	const trackGaps = useMemo(
		() => (track.type === "media" ? detectTimelineGaps([track]) : []),
		[track]
	);
	const preservedElementIds = useMemo(() => {
		const ids = new Set(
			selectedElements
				.filter((selection) => selection.trackId === track.id)
				.map((selection) => selection.elementId)
		);
		if (dragState.trackId === track.id && dragState.elementId) {
			ids.add(dragState.elementId);
		}
		return ids;
	}, [dragState.elementId, dragState.trackId, selectedElements, track.id]);
	const visibleElements = useMemo(
		() =>
			getVisibleTimelineElements({
				elements: track.elements,
				visibleRange: visibleTimeRange,
				preserveElementIds: preservedElementIds,
			}),
		[preservedElementIds, track.elements, visibleTimeRange]
	);
	const visibleElementIds = useMemo(
		() => new Set(visibleElements.map((element) => element.id)),
		[visibleElements]
	);
	const visibleGaps = useMemo(
		() =>
			visibleTimeRange
				? trackGaps.filter(
						(gap) =>
							gap.startTime <= visibleTimeRange.endTime &&
							gap.endTime >= visibleTimeRange.startTime
					)
				: trackGaps,
		[trackGaps, visibleTimeRange]
	);

	// Handle media loading states
	if (mediaItemsError) {
		console.error(
			"Failed to load media items in timeline track:",
			mediaItemsError
		);
		// Return a placeholder that maintains track structure
		return (
			<div className="relative w-full h-full border border-red-300 bg-red-50 rounded text-red-600 text-xs p-2">
				Error loading media items
			</div>
		);
	}

	const handleElementMouseDown = (
		e: React.MouseEvent,
		element: TimelineElementType
	) => {
		if (track.locked) return;
		// Detect right-click (button 2) and handle selection without starting drag
		const isRightClick = e.button === 2;
		const isMultiSelect = e.metaKey || e.ctrlKey || e.shiftKey;

		if (isRightClick) {
			// Don't trigger any state updates on right-click mousedown.
			// State updates cause re-renders that race with Radix ContextMenu
			// opening, causing it to immediately close.
			// Selection is handled by onContextMenu in the TimelineElement instead.
			return;
		}

		mouseDownLocationRef.current = { x: e.clientX, y: e.clientY };

		// Handle multi-selection for left-click with modifiers
		if (isMultiSelect) {
			selectElement(track.id, element.id, true);
		}

		// Calculate the offset from the left edge of the element to where the user clicked
		const elementElement = e.currentTarget as HTMLElement;
		const elementRect = elementElement.getBoundingClientRect();
		const clickOffsetX = e.clientX - elementRect.left;
		const clickOffsetTime =
			clickOffsetX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);
		const startMouseX = e.clientX;
		const startMouseY = e.clientY;

		// Stage the drag but do NOT call startDragAction yet — that flips
		// dragState.isDragging which re-renders the clip subtree and eats the
		// subsequent click. Only promote to a real drag once the pointer moves
		// past the threshold.
		pendingDragRef.current = {
			elementId: element.id,
			trackId: track.id,
			startMouseX,
			startElementTime: element.startTime,
			clickOffsetTime,
		};

		const DRAG_THRESHOLD_PX = 5;

		// Tear down any leftover pending listeners from a previous mousedown
		// (e.g. if mouseup fired outside the window and was missed).
		pendingListenersCleanupRef.current?.();

		const cleanup = () => {
			window.removeEventListener("mousemove", onPendingMove);
			window.removeEventListener("mouseup", onPendingUp);
			if (pendingListenersCleanupRef.current === cleanup) {
				pendingListenersCleanupRef.current = null;
			}
		};

		const onPendingMove = (moveEvent: MouseEvent) => {
			if (!pendingDragRef.current) return;
			const dx = Math.abs(moveEvent.clientX - startMouseX);
			const dy = Math.abs(moveEvent.clientY - startMouseY);
			if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
				const p = pendingDragRef.current;
				pendingDragRef.current = null;
				cleanup();
				startDragAction(
					p.elementId,
					p.trackId,
					p.startMouseX,
					p.startElementTime,
					p.clickOffsetTime
				);
			}
		};

		const onPendingUp = () => {
			pendingDragRef.current = null;
			cleanup();
		};

		window.addEventListener("mousemove", onPendingMove);
		window.addEventListener("mouseup", onPendingUp);
		pendingListenersCleanupRef.current = cleanup;
	};

	const handleElementClick = (
		e: React.MouseEvent,
		element: TimelineElementType
	) => {
		e.stopPropagation();

		const mdl = mouseDownLocationRef.current;

		// If the pointer moved past the drag threshold between mousedown and
		// click, treat this as the tail of a drag — not a real selection click.
		if (mdl) {
			const deltaX = Math.abs(e.clientX - mdl.x);
			const deltaY = Math.abs(e.clientY - mdl.y);
			if (deltaX > 5 || deltaY > 5) {
				mouseDownLocationRef.current = null;
				return;
			}
		}

		// Multi-select is already handled in mousedown.
		if (e.metaKey || e.ctrlKey || e.shiftKey) {
			return;
		}

		const isSelected = selectedElements.some(
			(c) => c.trackId === track.id && c.elementId === element.id
		);

		if (!isSelected) {
			selectElement(track.id, element.id, false);
		}
		useExportStore.getState().setPanelView("properties");
	};

	return (
		<div
			ref={dropZoneRef}
			className="w-full h-full hover:bg-muted/20"
			data-drop-zone
			onClick={(e) => {
				const target = e.target as HTMLElement;
				if (!isTimelineEntityTarget({ target })) {
					clearSelectedElements();
				}
			}}
			onDragOver={
				track.locked
					? undefined
					: (event) =>
							isTransitionDrag({ event })
								? handleTransitionDragOver(event)
								: handleTrackDragOver(event)
			}
			onDragEnter={
				track.locked
					? undefined
					: (event) =>
							isTransitionDrag({ event })
								? handleTransitionDragOver(event)
								: handleTrackDragEnter(event)
			}
			onDragLeave={track.locked ? undefined : handleTrackDragLeave}
			onDrop={
				track.locked
					? undefined
					: (event) =>
							isTransitionDrag({ event })
								? handleTransitionDrop(event)
								: handleTrackDrop(event)
			}
			data-track-locked={track.locked || undefined}
		>
			<div
				ref={timelineRef}
				className="h-full relative track-elements-container min-w-full"
				data-testid="timeline-track"
				data-track-type={track.type}
			>
				{/* Gap indicators for media tracks */}
				{visibleGaps.map((gap) => (
					<GapIndicator
						key={`gap-${gap.startTime}-${gap.endTime}`}
						gap={gap}
						zoomLevel={zoomLevel}
						trackHeight={getTrackHeight(track.type, track.height)}
					/>
				))}

				{track.elements.length === 0 ? (
					<div
						className={`h-full w-full rounded-sm border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground transition-colors ${
							isDropping
								? wouldOverlap
									? "border-red-500 bg-red-500/10 text-red-600"
									: "border-blue-500 bg-blue-500/10 text-blue-600"
								: "border-muted/30"
						}`}
					>
						{isDropping
							? wouldOverlap
								? "Cannot drop - would overlap"
								: "Drop element here"
							: ""}
					</div>
				) : (
					<>
						{visibleElements.map((element) => {
							const isSelected = selectedElements.some(
								(c) => c.trackId === track.id && c.elementId === element.id
							);

							const handleElementSplit = () => {
								const splitTime = usePlaybackStore.getState().currentTime;
								const effectiveStart = element.startTime;
								const effectiveEnd = getTimelineElementEndTime({ element });

								if (splitTime > effectiveStart && splitTime < effectiveEnd) {
									const secondElementId = splitElement(
										track.id,
										element.id,
										splitTime
									);
									if (!secondElementId) {
										toast.error("Failed to split element");
									}
								} else {
									toast.error("Playhead must be within element to split");
								}
							};

							const handleElementDuplicate = () => {
								const { addElementToTrack } = useTimelineStore.getState();
								const { id, ...elementWithoutId } = element;
								addElementToTrack(track.id, {
									...elementWithoutId,
									name: element.name + " (copy)",
									startTime: getTimelineElementEndTime({ element }) + 0.1,
								});
							};

							const handleElementDelete = () => {
								const { removeElementFromTrack } = useTimelineStore.getState();
								removeElementFromTrack(track.id, element.id);
							};

							return (
								<TimelineElement
									key={element.id}
									element={element}
									track={track}
									zoomLevel={zoomLevel}
									isSelected={isSelected}
									onElementMouseDown={handleElementMouseDown}
									onElementClick={handleElementClick}
								/>
							);
						})}
						{(track.transitions ?? [])
							.filter(
								(transition) =>
									visibleElementIds.has(transition.fromElementId) ||
									visibleElementIds.has(transition.toElementId)
							)
							.map((transition) => (
								<TimelineTransitionMarker
									key={transition.id}
									track={track}
									transition={transition}
									videoMediaIds={videoMediaIds}
									zoomLevel={zoomLevel}
								/>
							))}
					</>
				)}
			</div>
		</div>
	);
}

// Error Fallback Component for Timeline Track
const TimelineTrackErrorFallback = ({
	resetError,
}: {
	resetError: () => void;
}) => (
	<div className="h-16 bg-destructive/10 border border-destructive/20 rounded flex items-center justify-center text-sm text-destructive m-2">
		<span className="mr-2">⚠️ Track Error</span>
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
export const TimelineTrackContent = withErrorBoundary(
	TimelineTrackContentComponent,
	{
		isolate: true, // Only affects this track, not the entire timeline
		fallback: TimelineTrackErrorFallback,
	}
);
