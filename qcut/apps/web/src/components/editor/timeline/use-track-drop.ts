"use client";

import { useRef, useState } from "react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { toast } from "sonner";
import {
	type TimelineTrack,
	getMainTrack,
	canElementGoOnTrack,
} from "@/types/timeline";
import type {
	TimelineElement as TimelineElementType,
	DragData,
} from "@/types/timeline";
import {
	snapTimeToFrame,
	TIMELINE_CONSTANTS,
} from "@/constants/timeline-constants";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineSnapping } from "@/hooks/timeline/use-timeline-snapping";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { debugLog, debugError } from "@/lib/debug/debug-config";

/**
 * Custom hook encapsulating all drag-and-drop handling for timeline tracks.
 * Manages drag-over visual feedback, overlap detection, and drop processing
 * for both timeline element reordering and media item insertion.
 */
export function useTrackDrop({
	track,
	zoomLevel,
}: {
	track: TimelineTrack;
	zoomLevel: number;
}) {
	const { mediaItems } = useAsyncMediaItems();
	const tracks = useTimelineStore((s) => s.tracks);
	const addTrack = useTimelineStore((s) => s.addTrack);
	const moveElementToTrack = useTimelineStore((s) => s.moveElementToTrack);
	const updateElementStartTime = useTimelineStore(
		(s) => s.updateElementStartTime
	);
	const updateElementStartTimeWithRipple = useTimelineStore(
		(s) => s.updateElementStartTimeWithRipple
	);
	const addElementToTrack = useTimelineStore((s) => s.addElementToTrack);
	const insertTrackAt = useTimelineStore((s) => s.insertTrackAt);
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const currentTime = usePlaybackStore((s) => s.currentTime);

	const { snapElementEdge } = useTimelineSnapping({
		snapThreshold: 10,
		enableElementSnapping: snappingEnabled,
		enablePlayheadSnapping: snappingEnabled,
	});

	const [isDropping, setIsDropping] = useState(false);
	const [dropPosition, setDropPosition] = useState<number | null>(null);
	const [wouldOverlap, setWouldOverlap] = useState(false);
	const dragCounterRef = useRef(0);

	// Helper function for drop snapping that tries both edges
	const getDropSnappedTime = (
		dropTime: number,
		elementDuration: number,
		excludeElementId?: string
	) => {
		if (!snappingEnabled) {
			// Use frame snapping if project has FPS, otherwise use decimal snapping
			const projectStore = useProjectStore.getState();
			const projectFps = projectStore.activeProject?.fps || 30;
			return snapTimeToFrame(dropTime, projectFps);
		}

		// Try snapping both start and end edges for drops
		const startSnapResult = snapElementEdge(
			dropTime,
			elementDuration,
			tracks,
			currentTime,
			zoomLevel,
			excludeElementId,
			true // snap to start edge
		);

		const endSnapResult = snapElementEdge(
			dropTime,
			elementDuration,
			tracks,
			currentTime,
			zoomLevel,
			excludeElementId,
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

		return bestSnapResult.snappedTime;
	};

	const handleTrackDragOver = (e: React.DragEvent) => {
		e.preventDefault();

		// Handle both timeline elements and media items
		const hasTimelineElement = e.dataTransfer.types.includes(
			"application/x-timeline-element"
		);
		const hasMediaItem = e.dataTransfer.types.includes(
			"application/x-media-item"
		);

		if (!hasTimelineElement && !hasMediaItem) return;

		// Calculate drop position for overlap checking
		const trackContainer = e.currentTarget.querySelector(
			".track-elements-container"
		) as HTMLElement;
		let dropTime = 0;
		if (trackContainer) {
			const rect = trackContainer.getBoundingClientRect();
			const mouseX = Math.max(0, e.clientX - rect.left);
			dropTime = mouseX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);
		}

		// Check for potential overlaps and show appropriate feedback
		let hasOverlap = false;

		if (hasMediaItem) {
			try {
				const mediaItemData = e.dataTransfer.getData(
					"application/x-media-item"
				);
				if (mediaItemData) {
					const dragData: DragData = JSON.parse(mediaItemData);

					if (dragData.type === "text") {
						// Text elements have default duration of 5 seconds
						const newElementDuration = 5;
						const snappedTime = getDropSnappedTime(
							dropTime,
							newElementDuration
						);
						const newElementEnd = snappedTime + newElementDuration;

						hasOverlap = track.elements.some((existingElement) => {
							const existingStart = existingElement.startTime;
							const existingEnd =
								existingElement.startTime +
								(existingElement.duration -
									existingElement.trimStart -
									existingElement.trimEnd);
							return snappedTime < existingEnd && newElementEnd > existingStart;
						});
					} else if (dragData.type === "markdown") {
						const newElementDuration =
							TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION;
						const snappedTime = getDropSnappedTime(
							dropTime,
							newElementDuration
						);
						const newElementEnd = snappedTime + newElementDuration;

						hasOverlap = track.elements.some((existingElement) => {
							const existingStart = existingElement.startTime;
							const existingEnd =
								existingElement.startTime +
								(existingElement.duration -
									existingElement.trimStart -
									existingElement.trimEnd);
							return snappedTime < existingEnd && newElementEnd > existingStart;
						});
					} else {
						// Media elements
						const mediaItem = mediaItems.find(
							(item) => item.id === dragData.id
						);
						if (mediaItem) {
							const newElementDuration = mediaItem.duration || 5;
							const snappedTime = getDropSnappedTime(
								dropTime,
								newElementDuration
							);
							const newElementEnd = snappedTime + newElementDuration;

							hasOverlap = track.elements.some((existingElement) => {
								const existingStart = existingElement.startTime;
								const existingEnd =
									existingElement.startTime +
									(existingElement.duration -
										existingElement.trimStart -
										existingElement.trimEnd);
								return (
									snappedTime < existingEnd && newElementEnd > existingStart
								);
							});
						}
					}
				}
			} catch (error) {
				// Continue with default behavior
			}
		} else if (hasTimelineElement) {
			try {
				const timelineElementData = e.dataTransfer.getData(
					"application/x-timeline-element"
				);
				if (timelineElementData) {
					const { elementId, trackId: fromTrackId } =
						JSON.parse(timelineElementData);
					const sourceTrack = tracks.find(
						(t: TimelineTrack) => t.id === fromTrackId
					);
					const movingElement = sourceTrack?.elements.find(
						(c: TimelineElementType) => c.id === elementId
					);

					if (movingElement) {
						const movingElementDuration =
							movingElement.duration -
							movingElement.trimStart -
							movingElement.trimEnd;
						const snappedTime = getDropSnappedTime(
							dropTime,
							movingElementDuration,
							elementId
						);
						const movingElementEnd = snappedTime + movingElementDuration;

						hasOverlap = track.elements.some((existingElement) => {
							if (fromTrackId === track.id && existingElement.id === elementId)
								return false;

							const existingStart = existingElement.startTime;
							const existingEnd =
								existingElement.startTime +
								(existingElement.duration -
									existingElement.trimStart -
									existingElement.trimEnd);
							return (
								snappedTime < existingEnd && movingElementEnd > existingStart
							);
						});
					}
				}
			} catch (error) {
				// Continue with default behavior
			}
		}

		if (hasOverlap) {
			e.dataTransfer.dropEffect = "none";
			setWouldOverlap(true);
			// Use default duration for position indicator
			setDropPosition(getDropSnappedTime(dropTime, 5));
			return;
		}

		e.dataTransfer.dropEffect = hasTimelineElement ? "move" : "copy";
		setWouldOverlap(false);
		// Use default duration for position indicator
		setDropPosition(getDropSnappedTime(dropTime, 5));
	};

	const handleTrackDragEnter = (e: React.DragEvent) => {
		e.preventDefault();

		const hasTimelineElement = e.dataTransfer.types.includes(
			"application/x-timeline-element"
		);
		const hasMediaItem = e.dataTransfer.types.includes(
			"application/x-media-item"
		);

		if (!hasTimelineElement && !hasMediaItem) return;

		dragCounterRef.current++;
		setIsDropping(true);
	};

	const handleTrackDragLeave = (e: React.DragEvent) => {
		e.preventDefault();

		const hasTimelineElement = e.dataTransfer.types.includes(
			"application/x-timeline-element"
		);
		const hasMediaItem = e.dataTransfer.types.includes(
			"application/x-media-item"
		);

		if (!hasTimelineElement && !hasMediaItem) return;

		dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);

		if (dragCounterRef.current === 0) {
			setIsDropping(false);
			setWouldOverlap(false);
			setDropPosition(null);
		}
	};

	/**
	 * Core drop processing shared by both HTML5 drag-drop and touch-drop paths.
	 */
	const processDropAtPosition = (
		trackContainer: HTMLElement,
		clientX: number,
		clientY: number,
		mediaItemData: string | null,
		timelineElementData: string | null
	) => {
		// Reset all drag states
		dragCounterRef.current = 0;
		setIsDropping(false);
		setWouldOverlap(false);
		setDropPosition(null);

		const hasTimelineElement = !!timelineElementData;
		const hasMediaItem = !!mediaItemData;

		if (!hasTimelineElement && !hasMediaItem) return;

		const rect = trackContainer.getBoundingClientRect();
		const mouseX = Math.max(0, clientX - rect.left);
		const mouseY = clientY - rect.top;
		const newStartTime =
			mouseX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);
		const projectStore = useProjectStore.getState();
		const projectFps = projectStore.activeProject?.fps || 30;
		const snappedTime = snapTimeToFrame(newStartTime, projectFps);

		// Calculate drop position relative to tracks
		const currentTrackIndex = tracks.findIndex((t) => t.id === track.id);

		// Determine drop zone within the track (top 20px, middle 20px, bottom 20px)
		let dropZone: "above" | "on" | "below";
		if (mouseY < 20) {
			dropZone = "above";
		} else if (mouseY > 40) {
			dropZone = "below";
		} else {
			dropZone = "on";
		}

		try {
			if (hasTimelineElement) {
				// Handle timeline element movement
				if (!timelineElementData) return;

				const {
					elementId,
					trackId: fromTrackId,
					clickOffsetTime = 0,
				} = JSON.parse(timelineElementData);

				// Find the element being moved
				const sourceTrack = tracks.find(
					(t: TimelineTrack) => t.id === fromTrackId
				);
				const movingElement = sourceTrack?.elements.find(
					(c: TimelineElementType) => c.id === elementId
				);

				if (!movingElement) {
					toast.error("Element not found");
					return;
				}

				// Check for overlaps with existing elements (excluding the moving element itself)
				const movingElementDuration =
					movingElement.duration -
					movingElement.trimStart -
					movingElement.trimEnd;

				// Adjust position based on where user clicked on the element
				const adjustedStartTime = newStartTime - clickOffsetTime;
				const snappedStartTime = getDropSnappedTime(
					adjustedStartTime,
					movingElementDuration,
					elementId
				);
				const finalStartTime = Math.max(0, snappedStartTime);
				const movingElementEnd = finalStartTime + movingElementDuration;

				const hasOverlap = track.elements.some((existingElement) => {
					// Skip the element being moved if it's on the same track
					if (fromTrackId === track.id && existingElement.id === elementId)
						return false;

					const existingStart = existingElement.startTime;
					const existingEnd =
						existingElement.startTime +
						(existingElement.duration -
							existingElement.trimStart -
							existingElement.trimEnd);

					// Check if elements overlap
					return (
						finalStartTime < existingEnd && movingElementEnd > existingStart
					);
				});

				if (hasOverlap) {
					toast.error(
						"Cannot move element here - it would overlap with existing elements"
					);
					return;
				}

				if (fromTrackId === track.id) {
					// Moving within same track
					if (rippleEditingEnabled) {
						updateElementStartTimeWithRipple(
							track.id,
							elementId,
							finalStartTime
						);
					} else {
						updateElementStartTime(track.id, elementId, finalStartTime);
					}
				} else {
					// Moving to different track
					moveElementToTrack(fromTrackId, track.id, elementId);
					requestAnimationFrame(() => {
						if (rippleEditingEnabled) {
							updateElementStartTimeWithRipple(
								track.id,
								elementId,
								finalStartTime
							);
						} else {
							updateElementStartTime(track.id, elementId, finalStartTime);
						}
					});
				}
			} else if (hasMediaItem) {
				// Handle media item drop
				if (!mediaItemData) return;

				const dragData: DragData = JSON.parse(mediaItemData);

				if (dragData.type === "text") {
					let targetTrackId = track.id;
					let targetTrack = track;

					// Handle position-aware track creation for text
					if (track.type !== "text" || dropZone !== "on") {
						// Text tracks should go above the main track
						const mainTrack = getMainTrack(tracks);
						let insertIndex: number;

						if (dropZone === "above") {
							insertIndex = currentTrackIndex;
						} else if (dropZone === "below") {
							insertIndex = currentTrackIndex + 1;
						} else {
							// dropZone === "on" but track is not text type
							// Insert above main track if main track exists, otherwise at top
							if (mainTrack) {
								const mainTrackIndex = tracks.findIndex(
									(t) => t.id === mainTrack.id
								);
								insertIndex = mainTrackIndex;
							} else {
								insertIndex = 0; // Top of timeline
							}
						}

						targetTrackId = insertTrackAt("text", insertIndex);
						// Get the updated tracks array after creating the new track
						const updatedTracks = useTimelineStore.getState().tracks;
						const newTargetTrack = updatedTracks.find(
							(t) => t.id === targetTrackId
						);
						if (!newTargetTrack) return;
						targetTrack = newTargetTrack;
					}

					// Check for overlaps with existing elements in target track
					const newElementDuration = 5; // Default text duration
					const textSnappedTime = getDropSnappedTime(
						newStartTime,
						newElementDuration
					);
					const newElementEnd = textSnappedTime + newElementDuration;

					const hasOverlap = targetTrack.elements.some((existingElement) => {
						const existingStart = existingElement.startTime;
						const existingEnd =
							existingElement.startTime +
							(existingElement.duration -
								existingElement.trimStart -
								existingElement.trimEnd);

						// Check if elements overlap
						return (
							textSnappedTime < existingEnd && newElementEnd > existingStart
						);
					});

					if (hasOverlap) {
						toast.error(
							"Cannot place element here - it would overlap with existing elements"
						);
						return;
					}

					addElementToTrack(targetTrackId, {
						type: "text",
						name: dragData.name || "Text",
						content: dragData.content || "Default Text",
						duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
						startTime: textSnappedTime,
						trimStart: 0,
						trimEnd: 0,
						fontSize: 48,
						fontFamily: "Arial",
						color: "#ffffff",
						backgroundColor: "transparent",
						textAlign: "center",
						fontWeight: "normal",
						fontStyle: "normal",
						textDecoration: "none",
						x: 0,
						y: 0,
						rotation: 0,
						opacity: 1,
					});
				} else if (dragData.type === "markdown") {
					let targetTrackId = track.id;
					let targetTrack = track;

					if (track.type !== "markdown" || dropZone !== "on") {
						const mainTrack = getMainTrack(tracks);
						let insertIndex: number;

						if (dropZone === "above") {
							insertIndex = currentTrackIndex;
						} else if (dropZone === "below") {
							insertIndex = currentTrackIndex + 1;
						} else if (mainTrack) {
							const mainTrackIndex = tracks.findIndex(
								(t) => t.id === mainTrack.id
							);
							insertIndex = mainTrackIndex;
						} else {
							insertIndex = 0;
						}

						targetTrackId = insertTrackAt("markdown", insertIndex);
						const updatedTracks = useTimelineStore.getState().tracks;
						const newTargetTrack = updatedTracks.find(
							(t) => t.id === targetTrackId
						);
						if (!newTargetTrack) return;
						targetTrack = newTargetTrack;
					}

					const markdownDuration = TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION;
					const markdownSnappedTime = getDropSnappedTime(
						newStartTime,
						markdownDuration
					);
					const newElementEnd = markdownSnappedTime + markdownDuration;

					const hasOverlap = targetTrack.elements.some((existingElement) => {
						const existingStart = existingElement.startTime;
						const existingEnd =
							existingElement.startTime +
							(existingElement.duration -
								existingElement.trimStart -
								existingElement.trimEnd);
						return (
							markdownSnappedTime < existingEnd && newElementEnd > existingStart
						);
					});

					if (hasOverlap) {
						toast.error(
							"Cannot place element here - it would overlap with existing elements"
						);
						return;
					}

					addElementToTrack(targetTrackId, {
						type: "markdown",
						name: dragData.name || "Markdown",
						markdownContent:
							dragData.markdownContent || "# Title\n\nStart writing...",
						duration: markdownDuration,
						startTime: markdownSnappedTime,
						trimStart: 0,
						trimEnd: 0,
						theme: "dark",
						fontSize: 18,
						fontFamily: "Arial",
						padding: 16,
						backgroundColor: "rgba(0, 0, 0, 0.85)",
						textColor: "#ffffff",
						scrollMode: "static",
						scrollSpeed: 30,
						x: 0,
						y: 0,
						width: 720,
						height: 420,
						rotation: 0,
						opacity: 1,
					});
				} else {
					// Handle media items
					debugLog("[TimelineTrack] Processing media item drop:", {
						dragDataId: dragData.id,
						dragDataType: dragData.type,
						dragDataName: dragData.name,
						mediaItemsCount: mediaItems.length,
					});

					const mediaItem = mediaItems.find((item) => item.id === dragData.id);

					debugLog("[TimelineTrack] Found media item:", {
						found: !!mediaItem,
						mediaItemId: mediaItem?.id,
						mediaItemUrl: mediaItem?.url,
						isBlobUrl: mediaItem?.url?.startsWith("blob:"),
						mediaItemType: mediaItem?.type,
						mediaItemName: mediaItem?.name,
					});

					if (!mediaItem) {
						toast.error("Media item not found");
						return;
					}

					let targetTrackId = track.id;

					// Check if track type is compatible
					const isVideoOrImage =
						dragData.type === "video" || dragData.type === "image";
					const isAudio = dragData.type === "audio";
					const isCompatible = isVideoOrImage
						? canElementGoOnTrack("media", track.type)
						: isAudio
							? canElementGoOnTrack("media", track.type)
							: false;

					let targetTrack = tracks.find((t) => t.id === targetTrackId);

					// Handle position-aware track creation for media elements
					if (!isCompatible || dropZone !== "on") {
						if (isVideoOrImage) {
							// For video/image, check if we need a main track or additional media track
							const mainTrack = getMainTrack(tracks);

							if (!mainTrack) {
								// No main track exists, create it
								targetTrackId = addTrack("media");
								const updatedTracks = useTimelineStore.getState().tracks;
								const newTargetTrack = updatedTracks.find(
									(t) => t.id === targetTrackId
								);
								if (!newTargetTrack) return;
								targetTrack = newTargetTrack;
							} else if (mainTrack.elements.length === 0 && dropZone === "on") {
								// Main track exists and is empty, use it
								targetTrackId = mainTrack.id;
								targetTrack = mainTrack;
							} else {
								// Create new media track
								let insertIndex: number;

								if (dropZone === "above") {
									insertIndex = currentTrackIndex;
								} else if (dropZone === "below") {
									insertIndex = currentTrackIndex + 1;
								} else {
									// Insert above main track
									const mainTrackIndex = tracks.findIndex(
										(t) => t.id === mainTrack.id
									);
									insertIndex = mainTrackIndex;
								}

								targetTrackId = insertTrackAt("media", insertIndex);
								const updatedTracks = useTimelineStore.getState().tracks;
								const newTargetTrack = updatedTracks.find(
									(t) => t.id === targetTrackId
								);
								if (!newTargetTrack) return;
								targetTrack = newTargetTrack;
							}
						} else if (isAudio) {
							// Audio tracks go at the bottom
							const mainTrack = getMainTrack(tracks);
							let insertIndex: number;

							if (dropZone === "above") {
								insertIndex = currentTrackIndex;
							} else if (dropZone === "below") {
								insertIndex = currentTrackIndex + 1;
							} else {
								// Insert after main track (bottom area)
								if (mainTrack) {
									const mainTrackIndex = tracks.findIndex(
										(t) => t.id === mainTrack.id
									);
									insertIndex = mainTrackIndex + 1;
								} else {
									insertIndex = tracks.length; // Bottom of timeline
								}
							}

							targetTrackId = insertTrackAt("audio", insertIndex);
							const updatedTracks = useTimelineStore.getState().tracks;
							const newTargetTrack = updatedTracks.find(
								(t) => t.id === targetTrackId
							);
							if (!newTargetTrack) return;
							targetTrack = newTargetTrack;
						}
					}

					if (!targetTrack) return;

					// Check for overlaps with existing elements in target track
					const newElementDuration = mediaItem.duration || 5;
					const mediaSnappedTime = getDropSnappedTime(
						newStartTime,
						newElementDuration
					);
					const newElementEnd = mediaSnappedTime + newElementDuration;

					const hasOverlap = targetTrack.elements.some((existingElement) => {
						const existingStart = existingElement.startTime;
						const existingEnd =
							existingElement.startTime +
							(existingElement.duration -
								existingElement.trimStart -
								existingElement.trimEnd);

						// Check if elements overlap
						return (
							mediaSnappedTime < existingEnd && newElementEnd > existingStart
						);
					});

					if (hasOverlap) {
						toast.error(
							"Cannot place element here - it would overlap with existing elements"
						);
						return;
					}

					addElementToTrack(targetTrackId, {
						type: "media",
						mediaId: mediaItem.id,
						name: mediaItem.name,
						duration: mediaItem.duration || 5,
						startTime: mediaSnappedTime,
						trimStart: 0,
						trimEnd: 0,
					});
				}
			}
		} catch (error) {
			debugError("Error handling drop:", error);
			toast.error("Failed to add media to track");
		}
	};

	const handleTrackDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const trackContainer = e.currentTarget.querySelector(
			".track-elements-container"
		) as HTMLElement;
		if (!trackContainer) return;

		const mediaData = e.dataTransfer.types.includes("application/x-media-item")
			? e.dataTransfer.getData("application/x-media-item")
			: null;
		const timelineData = e.dataTransfer.types.includes(
			"application/x-timeline-element"
		)
			? e.dataTransfer.getData("application/x-timeline-element")
			: null;

		processDropAtPosition(
			trackContainer,
			e.clientX,
			e.clientY,
			mediaData,
			timelineData
		);
	};

	/** Handle touch-based drop from iOS/iPad pointer events fallback */
	const handleTouchDrop = (
		trackContainer: HTMLElement,
		data: string,
		clientX: number,
		clientY: number
	) => {
		// Touch drops from media panel always carry media item data
		processDropAtPosition(trackContainer, clientX, clientY, data, null);
	};

	return {
		isDropping,
		wouldOverlap,
		dropPosition,
		handleTrackDragOver,
		handleTrackDragEnter,
		handleTrackDragLeave,
		handleTrackDrop,
		handleTouchDrop,
	};
}
