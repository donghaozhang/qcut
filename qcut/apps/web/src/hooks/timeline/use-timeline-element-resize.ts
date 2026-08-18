import { useState, useEffect, useCallback, useRef } from "react";
import {
	captureMagnetDownstream,
	clampResizeTimelineDelta,
	planMagnetShiftedStartTimes,
	resolveResizeNeighborBounds,
	spansHaveOverlap,
	type MagnetDownstreamSnapshot,
	type ResizeNeighborBounds,
} from "@qcut/editor-core/timeline";
import { ResizeState, TimelineElement, TimelineTrack } from "@/types/timeline";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { clampPlaybackRate } from "@/lib/video/video-timing";
import { resizeMediaTiming } from "@/lib/video/video-speed-edit";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { useProjectStore } from "@/stores/project-store";

interface UseTimelineElementResizeProps {
	element: TimelineElement;
	track: TimelineTrack;
	zoomLevel: number;
	onUpdateTrim: (
		trackId: string,
		elementId: string,
		trimStart: number,
		trimEnd: number
	) => void;
	onUpdateDuration: (
		trackId: string,
		elementId: string,
		duration: number
	) => void;
}

/**
 * Geometry captured once on pointer-down. Every pointer-move resolves the
 * gesture against this snapshot instead of the live store, so repeated moves
 * cannot drift and the neighbor/magnet math has a stable baseline.
 */
interface ResizePlan {
	bounds: ResizeNeighborBounds;
	/** Main-track magnet: reflow downstream instead of clamping (QTL-005). */
	magnetActive: boolean;
	downstream: MagnetDownstreamSnapshot[];
	initialDuration: number;
	initialEndTime: number;
}

export function useTimelineElementResize({
	element,
	track,
	zoomLevel,
	onUpdateTrim,
	onUpdateDuration,
}: UseTimelineElementResizeProps) {
	const [resizing, setResizing] = useState<ResizeState | null>(null);
	const captureElementRef = useRef<Element | null>(null);
	const initialElementRef = useRef<TimelineElement | null>(null);
	const resizePlanRef = useRef<ResizePlan | null>(null);
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	const {
		updateElementStartTime,
		updateElementTrim,
		updateElementDuration,
		updateMediaElement,
		setTrackElementStartTimes,
		mainTrackMagnetEnabled,
		pushHistory,
	} = useTimelineStore();
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const trimTimeScale =
		element.type === "media" ? clampPlaybackRate(element.playbackRate) : 1;

	const getMinEffectiveDuration = useCallback(() => {
		if (element.type === "markdown") {
			return TIMELINE_CONSTANTS.MARKDOWN_MIN_DURATION;
		}
		return 0.1 * trimTimeScale;
	}, [element.type, trimTimeScale]);

	const getMaxEffectiveDuration = useCallback(() => {
		if (element.type === "markdown") {
			return TIMELINE_CONSTANTS.MARKDOWN_MAX_DURATION;
		}
		return Number.POSITIVE_INFINITY;
	}, [element.type]);

	const canExtendElementDuration = useCallback(() => {
		// Text elements can always be extended
		if (
			element.type === "text" ||
			element.type === "markdown" ||
			element.type === "adjustment" ||
			element.type === "effect"
		) {
			return true;
		}

		// Media elements - check the media type
		if (element.type === "media") {
			// If media items are still loading, return false (conservative approach)
			if (mediaItemsLoading) return false;

			const mediaItem = mediaItems.find((item) => item.id === element.mediaId);
			if (!mediaItem) return false;

			// Images can be extended (static content)
			if (mediaItem.type === "image") {
				return true;
			}

			// Videos and audio cannot be extended beyond their natural duration
			// (no additional content exists)
			return false;
		}

		return false;
	}, [element.type, mediaItemsLoading, mediaItems, element]);

	const handleResizeEnd = useCallback(() => {
		setResizing(null);
		initialElementRef.current = null;
		resizePlanRef.current = null;
	}, []);

	const updateTrimFromMouseMove = useCallback(
		(e: { clientX: number }) => {
			if (!resizing) return;

			const plan = resizePlanRef.current;
			const deltaX = e.clientX - resizing.startX;
			// Reasonable sensitivity for resize operations - similar to timeline scale
			const rawTimelineDelta = deltaX / (50 * zoomLevel);
			const initialElement = initialElementRef.current ?? element;
			const mediaItem =
				initialElement.type === "media"
					? mediaItems.find((item) => item.id === initialElement.mediaId)
					: undefined;
			const usesPlaybackTiming =
				initialElement.type === "media" &&
				mediaItem?.type !== "image" &&
				((initialElement.speedKeyframes?.length ?? 0) > 0 ||
					(initialElement.freezeFrameDuration ?? 0) > 0 ||
					(initialElement.playbackRate ?? 1) !== 1 ||
					initialElement.reverse === true);

			// The magnet reflows neighbours instead of stopping at them; the
			// playback-timing path keeps the clamp because its applied delta is
			// resolved inside resizeMediaTiming (v1 limitation, see QTL docs).
			const magnetApplies = Boolean(plan?.magnetActive) && !usesPlaybackTiming;
			const timelineDelta =
				!plan || magnetApplies
					? rawTimelineDelta
					: clampResizeTimelineDelta({
							side: resizing.side,
							timelineDelta: rawTimelineDelta,
							startTime: resizing.initialStartTime,
							endTime: plan.initialEndTime,
							bounds: plan.bounds,
						});

			if (usesPlaybackTiming) {
				const resized = resizeMediaTiming({
					element: initialElement,
					side: resizing.side,
					timelineDelta,
					fps,
				});
				updateMediaElement(track.id, initialElement.id, resized.updates, false);
				if (resizing.side === "left") {
					updateElementStartTime(
						track.id,
						initialElement.id,
						resizing.initialStartTime + resized.startTimeDelta,
						false
					);
				}
				return;
			}

			const initialDuration = plan?.initialDuration ?? element.duration;
			const sourceDelta = timelineDelta * trimTimeScale;

			// Every branch only computes the target values; the commit block
			// below owns the store writes and the magnet reflow. All math runs
			// against the pointer-down snapshot so dragging back and forth
			// cannot accumulate error.
			let next: {
				trimStart: number;
				trimEnd: number;
				duration: number;
				startTime: number;
			};

			if (resizing.side === "left") {
				const minEffectiveDuration = getMinEffectiveDuration();
				const maxAllowed =
					initialDuration - resizing.initialTrimEnd - minEffectiveDuration;
				const calculated = resizing.initialTrimStart + sourceDelta;

				if (calculated >= 0) {
					// Normal trimming within available content
					const newTrimStart = Math.min(maxAllowed, calculated);
					const trimDelta = newTrimStart - resizing.initialTrimStart;
					next = {
						trimStart: newTrimStart,
						trimEnd: resizing.initialTrimEnd,
						duration: initialDuration,
						startTime: resizing.initialStartTime + trimDelta / trimTimeScale,
					};
				} else if (canExtendElementDuration()) {
					// Text/Image: extend to the left by moving startTime and
					// increasing duration
					const extensionAmount = Math.abs(calculated);
					// Under the magnet the start stays anchored — the extension
					// grows the clip rightward and pushes downstream — so free
					// space to the LEFT is not the budget; only content limits
					// apply. Without the magnet the clip walks left into that
					// free space, which is exactly what the limit describes.
					const maxExtension = magnetApplies
						? Number.POSITIVE_INFINITY
						: resizing.initialStartTime * trimTimeScale;
					const maxEffectiveDuration = getMaxEffectiveDuration();
					const maxDurationFromType = Number.isFinite(maxEffectiveDuration)
						? Math.max(
								0,
								maxEffectiveDuration + resizing.initialTrimEnd - initialDuration
							)
						: Number.POSITIVE_INFINITY;
					const actualExtension = Math.min(
						extensionAmount,
						maxExtension,
						maxDurationFromType
					);
					next = {
						trimStart: 0,
						trimEnd: resizing.initialTrimEnd,
						duration: initialDuration + actualExtension,
						startTime:
							resizing.initialStartTime - actualExtension / trimTimeScale,
					};
				} else {
					// Video/Audio: can't extend beyond original content
					next = {
						trimStart: 0,
						trimEnd: resizing.initialTrimEnd,
						duration: initialDuration,
						startTime:
							resizing.initialStartTime -
							resizing.initialTrimStart / trimTimeScale,
					};
				}
			} else {
				const calculated = resizing.initialTrimEnd - sourceDelta;

				if (calculated < 0) {
					if (canExtendElementDuration()) {
						// Extend the duration instead of reducing trimEnd further
						const extensionNeeded = Math.abs(calculated);
						const maxEffectiveDuration = getMaxEffectiveDuration();
						const maxDuration = Number.isFinite(maxEffectiveDuration)
							? maxEffectiveDuration + resizing.initialTrimStart
							: Number.POSITIVE_INFINITY;
						next = {
							trimStart: resizing.initialTrimStart,
							trimEnd: 0,
							duration: Math.min(
								initialDuration + extensionNeeded,
								maxDuration
							),
							startTime: resizing.initialStartTime,
						};
					} else {
						// Can't extend - trimEnd 0 is the maximum possible extension
						next = {
							trimStart: resizing.initialTrimStart,
							trimEnd: 0,
							duration: initialDuration,
							startTime: resizing.initialStartTime,
						};
					}
				} else {
					// Normal trimming within original duration
					const minEffectiveDuration = getMinEffectiveDuration();
					const maxTrimEnd =
						initialDuration - resizing.initialTrimStart - minEffectiveDuration;
					next = {
						trimStart: resizing.initialTrimStart,
						trimEnd: Math.max(0, Math.min(maxTrimEnd, calculated)),
						duration: initialDuration,
						startTime: resizing.initialStartTime,
					};
				}
			}

			// Main-track magnet: the clip's start is anchored — an in-point trim
			// changes what plays, not where the clip sits — and every element
			// downstream of the initial end rides the end delta, so the main
			// track never opens a hole and never overlaps (QTL-005). Verified
			// against Jianying's behavior in docs/task/timeline-rules-vs-jianying
			// (experiments E6/E10).
			if (magnetApplies) {
				next.startTime = resizing.initialStartTime;
			}
			const newVisibleDuration =
				Math.max(0, next.duration - next.trimStart - next.trimEnd) /
				trimTimeScale;
			const endDelta =
				next.startTime + newVisibleDuration - (plan?.initialEndTime ?? 0);
			const shiftedStartTimes =
				magnetApplies && plan && plan.downstream.length > 0
					? planMagnetShiftedStartTimes({
							downstream: plan.downstream,
							endDelta,
						})
					: null;

			// Atomicity preflight: on a track carrying a pre-existing overlap
			// the arrange step below rejects the downstream shift; committing
			// the trim writes anyway would leave an overlap (growth) or a hole
			// (shrink). Simulate the final layout first and freeze the gesture
			// instead when it cannot commit cleanly.
			if (magnetApplies) {
				const finalSpans = track.elements
					.filter((candidate) => candidate.id !== element.id)
					.map((candidate) => {
						const currentStart = candidate.startTime;
						const currentEnd = getTimelineElementEndTime({
							element: candidate,
							fps,
						});
						const shiftedStart = shiftedStartTimes?.[candidate.id];
						const startTime = shiftedStart ?? currentStart;
						return {
							id: candidate.id,
							startTime,
							endTime: startTime + (currentEnd - currentStart),
						};
					});
				finalSpans.push({
					id: element.id,
					startTime: next.startTime,
					endTime: next.startTime + newVisibleDuration,
				});
				if (spansHaveOverlap({ spans: finalSpans })) return;
			}

			const shiftDownstream = (): boolean => {
				if (!shiftedStartTimes) return true;
				return setTrackElementStartTimes(track.id, shiftedStartTimes, false);
			};

			// Push the neighbours out of the way before growing into their
			// space; pull them in only after shrinking. Either order keeps the
			// store free of same-track overlaps at every commit. Every value is
			// written unconditionally: a drag that returns to its starting point
			// must also return the store, so "unchanged vs the snapshot" is not
			// a reason to skip a write. A rejected growth shift aborts before
			// anything is written (the preflight makes that unreachable in
			// practice, but the arrange result stays authoritative).
			if (endDelta > 0 && !shiftDownstream()) return;
			updateElementDuration(track.id, element.id, next.duration, false);
			updateElementTrim(
				track.id,
				element.id,
				next.trimStart,
				next.trimEnd,
				false
			);
			if (resizing.side === "left" && !magnetApplies) {
				updateElementStartTime(track.id, element.id, next.startTime, false);
			}
			if (endDelta <= 0) shiftDownstream();
		},
		[
			resizing,
			zoomLevel,
			element,
			track.id,
			updateElementTrim,
			updateElementStartTime,
			updateElementDuration,
			updateMediaElement,
			setTrackElementStartTimes,
			canExtendElementDuration,
			getMinEffectiveDuration,
			getMaxEffectiveDuration,
			trimTimeScale,
			mediaItems,
			fps,
		]
	);

	// Set up document-level pointer listeners during resize (like proper drag behavior)
	useEffect(() => {
		if (!resizing) return;

		const handleDocumentPointerMove = (e: PointerEvent) => {
			updateTrimFromMouseMove({ clientX: e.clientX });
		};

		const handleDocumentPointerUp = (e: PointerEvent) => {
			captureElementRef.current?.releasePointerCapture?.(e.pointerId);
			captureElementRef.current = null;
			handleResizeEnd();
		};

		// Add document-level listeners for proper drag behavior
		document.addEventListener("pointermove", handleDocumentPointerMove);
		document.addEventListener("pointerup", handleDocumentPointerUp);
		document.addEventListener("pointercancel", handleDocumentPointerUp);

		return () => {
			document.removeEventListener("pointermove", handleDocumentPointerMove);
			document.removeEventListener("pointerup", handleDocumentPointerUp);
			document.removeEventListener("pointercancel", handleDocumentPointerUp);
		};
	}, [resizing, handleResizeEnd, updateTrimFromMouseMove]); // Re-run when resizing state changes

	const handleResizeStart = (
		e: React.PointerEvent,
		elementId: string,
		side: "left" | "right"
	) => {
		e.stopPropagation();
		e.preventDefault();

		const captureEl = e.target as Element;
		captureEl.setPointerCapture?.(e.pointerId);
		captureElementRef.current = captureEl;

		// Push history once at the start of the resize operation
		pushHistory();
		initialElementRef.current = element;

		// Snapshot the lane geometry the whole gesture resolves against.
		const spans = track.elements.map((candidate) => ({
			id: candidate.id,
			startTime: candidate.startTime,
			endTime: getTimelineElementEndTime({ element: candidate, fps }),
		}));
		const initialEndTime = getTimelineElementEndTime({ element, fps });
		const magnetActive = mainTrackMagnetEnabled && Boolean(track.isMain);
		resizePlanRef.current = {
			bounds: resolveResizeNeighborBounds({ spans, elementId }),
			magnetActive,
			downstream: magnetActive
				? captureMagnetDownstream({ spans, elementId, initialEndTime })
				: [],
			initialDuration: element.duration,
			initialEndTime,
		};

		setResizing({
			elementId,
			side,
			startX: e.clientX,
			initialStartTime: element.startTime,
			initialTrimStart: element.trimStart,
			initialTrimEnd: element.trimEnd,
		});
	};

	return {
		resizing,
		isResizing: resizing !== null,
		handleResizeStart,
		// Return empty handlers since we use document listeners now
		handleResizeMove: () => {}, // Not used anymore
		handleResizeEnd: () => {}, // Not used anymore
		// Loading states
		loading: mediaItemsLoading,
		error: mediaItemsError,
	};
}
