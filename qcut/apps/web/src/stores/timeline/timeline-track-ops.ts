import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import {
	checkElementOverlaps,
	getTimelineElementDuration,
	getTimelineElementEndTime,
	resolveElementOverlaps,
} from "@/lib/timeline";
import { generateUUID } from "@/lib/utils";
import type { TimelineElement } from "@/types/timeline";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";
import { getTimelineSplitTrimValues } from "./timeline-split-utils";

export function createTrackOps(
	get: StoreGet,
	_set: StoreSet,
	deps: OperationDeps
) {
	const { updateTracksAndSave } = deps;

	return {
		removeTrack: (trackId: string) => {
			const { rippleEditingEnabled, selectedElements } = get();

			if (rippleEditingEnabled) {
				get().removeTrackWithRipple(trackId);
			} else {
				get().pushHistory();

				// Clear selection for elements on the removed track to avoid dangling references
				for (const sel of selectedElements) {
					if (sel.trackId === trackId) {
						get().deselectElement(sel.trackId, sel.elementId);
					}
				}

				updateTracksAndSave(
					get()._tracks.filter((track) => track.id !== trackId)
				);
			}
		},

		removeTrackWithRipple: (trackId: string) => {
			const { _tracks, selectedElements } = get();
			const trackToRemove = _tracks.find((t) => t.id === trackId);

			if (!trackToRemove) return;

			get().pushHistory();

			// Clear selection for elements on the removed track to avoid dangling references
			for (const sel of selectedElements) {
				if (sel.trackId === trackId) {
					get().deselectElement(sel.trackId, sel.elementId);
				}
			}

			// If track has no elements, just remove it normally
			if (trackToRemove.elements.length === 0) {
				updateTracksAndSave(_tracks.filter((track) => track.id !== trackId));
				return;
			}

			// Find all the time ranges occupied by elements in the track being removed
			const occupiedRanges = trackToRemove.elements.map((element) => ({
				startTime: element.startTime,
				endTime: getTimelineElementEndTime({ element }),
			}));

			// Sort ranges by start time
			occupiedRanges.sort((a, b) => a.startTime - b.startTime);

			// Merge overlapping ranges to get consolidated gaps
			const mergedRanges: Array<{
				startTime: number;
				endTime: number;
				duration: number;
			}> = [];

			for (const range of occupiedRanges) {
				if (mergedRanges.length === 0) {
					mergedRanges.push({
						startTime: range.startTime,
						endTime: range.endTime,
						duration: range.endTime - range.startTime,
					});
				} else {
					const lastRange = mergedRanges[mergedRanges.length - 1];
					if (range.startTime <= lastRange.endTime) {
						// Overlapping or adjacent ranges, merge them
						lastRange.endTime = Math.max(lastRange.endTime, range.endTime);
						lastRange.duration = lastRange.endTime - lastRange.startTime;
					} else {
						// Non-overlapping range, add as new
						mergedRanges.push({
							startTime: range.startTime,
							endTime: range.endTime,
							duration: range.endTime - range.startTime,
						});
					}
				}
			}

			// Remove the track and apply ripple effects to remaining tracks
			const updatedTracks = _tracks
				.filter((track) => track.id !== trackId)
				.map((track) => {
					const updatedElements = track.elements.map((element) => {
						let newStartTime = element.startTime;

						// Process gaps from right to left (latest to earliest) to avoid cumulative shifts
						for (let i = mergedRanges.length - 1; i >= 0; i--) {
							const gap = mergedRanges[i];
							// If this element starts after the gap, shift it left by the gap duration
							if (newStartTime >= gap.endTime) {
								newStartTime -= gap.duration;
							}
						}

						return {
							...element,
							startTime: Math.max(0, newStartTime),
						};
					});

					// Check for overlaps and resolve them if necessary
					const hasOverlaps = checkElementOverlaps(updatedElements);
					if (hasOverlaps) {
						const resolvedElements = resolveElementOverlaps(updatedElements);
						return { ...track, elements: resolvedElements };
					}

					return { ...track, elements: updatedElements };
				});

			updateTracksAndSave(updatedTracks);
		},

		// -----------------------------------------------------------------------
		// Ripple element removal
		// -----------------------------------------------------------------------

		removeElementFromTrackWithRipple: (
			trackId: string,
			elementId: string,
			pushHistory = true,
			forceRipple = false
		) => {
			const { _tracks, rippleEditingEnabled } = get();

			if (!rippleEditingEnabled && !forceRipple) {
				// If ripple editing is disabled, use regular removal
				get().removeElementFromTrack(trackId, elementId, pushHistory);
				return;
			}

			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((e) => e.id === elementId);

			if (!element || !track) return;

			if (pushHistory) get().pushHistory();
			get().deselectElement(trackId, elementId);

			const elementStartTime = element.startTime;
			const elementDuration = getTimelineElementDuration({ element });
			const elementEndTime = elementStartTime + elementDuration;

			// Remove the element and shift all elements that come after it
			const updatedTracks = _tracks
				.map((currentTrack) => {
					// Only apply ripple effects to the same track unless multi-track ripple is enabled
					const shouldApplyRipple = currentTrack.id === trackId;

					const updatedElements = currentTrack.elements
						.filter((currentElement) => {
							// Remove the target element
							if (
								currentElement.id === elementId &&
								currentTrack.id === trackId
							) {
								return false;
							}
							return true;
						})
						.map((currentElement) => {
							// Only apply ripple effects if we should process this track
							if (!shouldApplyRipple) {
								return currentElement;
							}

							// Shift elements that start after the removed element
							if (currentElement.startTime >= elementEndTime) {
								return {
									...currentElement,
									startTime: Math.max(
										0,
										currentElement.startTime - elementDuration
									),
								};
							}
							return currentElement;
						});

					// Check for overlaps and resolve them if necessary
					const hasOverlaps = checkElementOverlaps(updatedElements);
					if (hasOverlaps) {
						// Resolve overlaps by adjusting element positions
						const resolvedElements = resolveElementOverlaps(updatedElements);
						return { ...currentTrack, elements: resolvedElements };
					}

					return { ...currentTrack, elements: updatedElements };
				})
				.filter((track) => track.elements.length > 0 || track.isMain);

			updateTracksAndSave(updatedTracks);
		},

		rippleDeleteAcrossTracks: (
			startTime: number,
			endTime: number,
			excludeTrackIds: string[] = []
		) => {
			try {
				const rippleDuration = endTime - startTime;
				if (rippleDuration <= 0) {
					return;
				}

				get().pushHistory();

				const excludedTrackIds = new Set(excludeTrackIds);
				const updatedTracks = get()._tracks.map((track) => {
					if (excludedTrackIds.has(track.id)) {
						return track;
					}

					const updatedElements = track.elements.map((element) => {
						if (element.startTime < endTime) {
							return element;
						}
						return {
							...element,
							startTime: Math.max(0, element.startTime - rippleDuration),
						};
					});

					return { ...track, elements: updatedElements };
				});

				updateTracksAndSave(updatedTracks);
			} catch (error) {
				handleError(error, {
					operation: "Ripple Delete Across Tracks",
					category: ErrorCategory.SYSTEM,
					severity: ErrorSeverity.MEDIUM,
					metadata: {
						startTime,
						endTime,
						excludeTrackCount: excludeTrackIds.length,
					},
				});
			}
		},

		deleteTimeRange: ({
			startTime,
			endTime,
			trackIds,
			ripple = true,
			crossTrackRipple = false,
		}: {
			startTime: number;
			endTime: number;
			trackIds?: string[];
			ripple?: boolean;
			crossTrackRipple?: boolean;
		}) => {
			try {
				const clampedStartTime = Math.max(0, startTime);
				const clampedEndTime = Math.max(clampedStartTime, endTime);
				const rangeDuration = clampedEndTime - clampedStartTime;

				if (rangeDuration <= 0) {
					return {
						deletedElements: 0,
						splitElements: 0,
						totalRemovedDuration: 0,
					};
				}

				const { _tracks } = get();
				const targetTrackIds =
					trackIds && trackIds.length > 0
						? new Set(trackIds)
						: new Set(_tracks.map((track) => track.id));

				let deletedElements = 0;
				let splitElements = 0;

				get().pushHistory();

				const rangeAdjustedTracks = _tracks.map((track) => {
					if (!targetTrackIds.has(track.id)) {
						return track;
					}

					const nextElements: TimelineElement[] = [];

					for (const element of track.elements) {
						const elementStart = element.startTime;
						const elementEnd = getTimelineElementEndTime({ element });
						const overlapsRange =
							elementStart < clampedEndTime && elementEnd > clampedStartTime;

						if (!overlapsRange) {
							nextElements.push(element);
							continue;
						}

						const isFullyContained =
							elementStart >= clampedStartTime && elementEnd <= clampedEndTime;
						if (isFullyContained) {
							deletedElements++;
							continue;
						}

						const overlapsAtEnd =
							elementStart < clampedStartTime &&
							elementEnd > clampedStartTime &&
							elementEnd <= clampedEndTime;
						if (overlapsAtEnd) {
							splitElements++;
							const splitTrims = getTimelineSplitTrimValues({
								element,
								splitTime: clampedStartTime,
							});
							nextElements.push({
								...element,
								trimStart: splitTrims.leftTrimStart,
								trimEnd: splitTrims.leftTrimEnd,
							});
							continue;
						}

						const overlapsAtStart =
							elementStart >= clampedStartTime &&
							elementStart < clampedEndTime &&
							elementEnd > clampedEndTime;
						if (overlapsAtStart) {
							splitElements++;
							const splitTrims = getTimelineSplitTrimValues({
								element,
								splitTime: clampedEndTime,
							});
							nextElements.push({
								...element,
								startTime: clampedEndTime,
								trimStart: splitTrims.rightTrimStart,
								trimEnd: splitTrims.rightTrimEnd,
							});
							continue;
						}

						const spansEntireRange =
							elementStart < clampedStartTime && elementEnd > clampedEndTime;
						if (spansEntireRange) {
							splitElements++;
							const leftSplitTrims = getTimelineSplitTrimValues({
								element,
								splitTime: clampedStartTime,
							});
							const rightSplitTrims = getTimelineSplitTrimValues({
								element,
								splitTime: clampedEndTime,
							});

							nextElements.push({
								...element,
								trimStart: leftSplitTrims.leftTrimStart,
								trimEnd: leftSplitTrims.leftTrimEnd,
							});

							nextElements.push({
								...element,
								id: generateUUID(),
								startTime: clampedEndTime,
								trimStart: rightSplitTrims.rightTrimStart,
								trimEnd: rightSplitTrims.rightTrimEnd,
							});
							continue;
						}

						// All overlap cases are handled above; this point is unreachable.
						// Defensively skip the element rather than risk timeline corruption.
						deletedElements++;
					}

					return { ...track, elements: nextElements };
				});

				const rippleTrackIds = new Set<string>();
				if (ripple) {
					if (crossTrackRipple) {
						for (const track of rangeAdjustedTracks) {
							rippleTrackIds.add(track.id);
						}
					} else {
						for (const trackId of targetTrackIds) {
							rippleTrackIds.add(trackId);
						}
					}
				}

				const finalTracks = rangeAdjustedTracks
					.map((track) => {
						if (!rippleTrackIds.has(track.id)) {
							return track;
						}

						const shiftedElements = track.elements.map((element) => {
							if (element.startTime < clampedEndTime) {
								return element;
							}
							return {
								...element,
								startTime: Math.max(0, element.startTime - rangeDuration),
							};
						});

						return { ...track, elements: shiftedElements };
					})
					.filter((track) => track.elements.length > 0 || track.isMain);

				updateTracksAndSave(finalTracks);

				return {
					deletedElements,
					splitElements,
					totalRemovedDuration: rangeDuration,
				};
			} catch (error) {
				handleError(error, {
					operation: "Delete Timeline Time Range",
					category: ErrorCategory.SYSTEM,
					severity: ErrorSeverity.HIGH,
					metadata: {
						startTime,
						endTime,
						trackCount: trackIds?.length || 0,
						ripple,
						crossTrackRipple,
					},
				});
				return {
					deletedElements: 0,
					splitElements: 0,
					totalRemovedDuration: 0,
				};
			}
		},
	};
}
