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
import type { TimelineTrack } from "@/types/timeline";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";
import { blockedByTrackLock } from "./timeline-lock-guard";
import { overwriteRangeInElements } from "./timeline-collision-utils";
import {
	deriveTimelineLinks,
	resolveRippleDomain,
} from "@qcut/editor-core/timeline";

interface TimelineRange {
	startTime: number;
	endTime: number;
}

interface RangeDeletionResult {
	tracks: TimelineTrack[];
	deletedElements: number;
	splitElements: number;
	totalRemovedDuration: number;
}

function mergeTimelineRanges({ ranges }: { ranges: TimelineRange[] }) {
	const sorted = ranges
		.filter((range) => range.endTime > range.startTime)
		.sort((first, second) => first.startTime - second.startTime);
	const merged: TimelineRange[] = [];
	for (const range of sorted) {
		const previous = merged.at(-1);
		if (!previous || range.startTime > previous.endTime) {
			merged.push({ ...range });
			continue;
		}
		previous.endTime = Math.max(previous.endTime, range.endTime);
	}
	return merged;
}

function applyDeleteTimeRangeToTracks({
	tracks,
	startTime,
	endTime,
	targetTrackIds,
	rippleTrackIds,
	fps,
}: {
	tracks: TimelineTrack[];
	startTime: number;
	endTime: number;
	targetTrackIds: Set<string>;
	rippleTrackIds: Set<string>;
	fps: number;
}): RangeDeletionResult {
	let deletedElements = 0;
	let splitElements = 0;
	const rangeDuration = endTime - startTime;
	// One shared overwrite implementation (QTL-002): the same trim/split math
	// backs add-with-overwrite and every range-deletion path.
	const rangeAdjustedTracks = tracks.map((track) => {
		if (!targetTrackIds.has(track.id)) {
			return track;
		}
		const result = overwriteRangeInElements({
			elements: track.elements,
			range: { startTime, endTime },
			fps,
		});
		deletedElements += result.deletedElements;
		splitElements += result.splitElements;
		return { ...track, elements: result.elements };
	});

	const tracksAfterRipple = rangeAdjustedTracks
		.map((track) => {
			if (!rippleTrackIds.has(track.id)) {
				return track;
			}
			const shiftedElements = track.elements.map((element) => {
				if (element.startTime < endTime) {
					return element;
				}
				return {
					...element,
					startTime: Math.max(0, element.startTime - rangeDuration),
				};
			});
			return { ...track, elements: shiftedElements };
		})
		.filter(
			(track) =>
				track.elements.length > 0 ||
				track.isMain ||
				!targetTrackIds.has(track.id)
		);

	return {
		tracks: tracksAfterRipple,
		deletedElements,
		splitElements,
		totalRemovedDuration: rangeDuration,
	};
}

export function createTrackOps(
	get: StoreGet,
	_set: StoreSet,
	deps: OperationDeps
) {
	const { getProjectFps, updateTracksAndSave } = deps;

	return {
		removeTrack: (trackId: string) => {
			const { rippleEditingEnabled, selectedElements } = get();
			if (
				blockedByTrackLock({
					tracks: get()._tracks,
					operation: "Remove Track",
					trackIds: [trackId],
				})
			) {
				return;
			}

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
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Remove Track With Ripple",
					trackIds: [trackId],
				})
			) {
				return;
			}

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

			// Remove the track and apply ripple effects to remaining tracks.
			// Locked tracks hold their position: the ripple domain skips them.
			const updatedTracks = _tracks
				.filter((track) => track.id !== trackId)
				.map((track) => {
					if (track.locked) return track;
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
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Remove Element With Ripple",
					trackIds: [trackId],
				})
			) {
				return;
			}

			if (!rippleEditingEnabled && !forceRipple) {
				// If ripple editing is disabled, use regular removal
				get().removeElementFromTrack(trackId, elementId, pushHistory);
				return;
			}

			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((e) => e.id === elementId);

			if (!element || !track) return;

			// Ripple domain (QTL-003): the edited track plus tracks linked to its
			// elements. A locked linked dependency blocks the whole command —
			// shifting one side of a link would desynchronize the pair.
			const rippleDomain = resolveRippleDomain({
				tracks: _tracks,
				seedTrackIds: [trackId],
				links: deriveTimelineLinks({ tracks: _tracks }),
			});
			if (rippleDomain.lockedDependencyTrackIds.length > 0) {
				handleError(
					new Error("Cannot ripple: a linked dependency track is locked"),
					{
						operation: "Remove Element With Ripple",
						category: ErrorCategory.VALIDATION,
						severity: ErrorSeverity.MEDIUM,
						metadata: {
							lockedTrackIds: rippleDomain.lockedDependencyTrackIds,
						},
					}
				);
				return;
			}

			if (pushHistory) get().pushHistory();
			get().deselectElement(trackId, elementId);

			const elementStartTime = element.startTime;
			const elementDuration = getTimelineElementDuration({ element });
			const elementEndTime = elementStartTime + elementDuration;

			// Remove the element and shift the ripple domain after it
			const updatedTracks = _tracks
				.map((currentTrack) => {
					const shouldApplyRipple = rippleDomain.domainTrackIds.has(
						currentTrack.id
					);

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
					// Locked tracks hold their position during cross-track ripple.
					if (excludedTrackIds.has(track.id) || track.locked) {
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

		deleteSelectedElementsWithRipple: (
			selections = get().selectedElements,
			pushHistory = true
		) => {
			try {
				const { _tracks } = get();
				// Deleting is an explicit content edit: any locked selection fails
				// the whole batch instead of leaving a half-applied delete.
				if (
					blockedByTrackLock({
						tracks: _tracks,
						operation: "Delete Selected Elements With Ripple",
						trackIds: selections.map((selection) => selection.trackId),
					})
				) {
					return {
						deletedElements: 0,
						splitElements: 0,
						totalRemovedDuration: 0,
					};
				}
				const selectionKeys = new Set(
					selections.map(
						(selection) => `${selection.trackId}:${selection.elementId}`
					)
				);
				const selectedRanges: TimelineRange[] = [];
				const selectedTrackIds = new Set<string>();
				for (const track of _tracks) {
					for (const element of track.elements) {
						if (!selectionKeys.has(`${track.id}:${element.id}`)) {
							continue;
						}
						selectedTrackIds.add(track.id);
						selectedRanges.push({
							startTime: element.startTime,
							endTime: getTimelineElementEndTime({ element }),
						});
					}
				}
				const mergedRanges = mergeTimelineRanges({ ranges: selectedRanges });
				if (mergedRanges.length === 0) {
					return {
						deletedElements: 0,
						splitElements: 0,
						totalRemovedDuration: 0,
					};
				}

				// Ripple domain (QTL-003): only the edited tracks and tracks linked
				// to their elements shift; unrelated tracks hold their positions. A
				// locked linked dependency blocks the whole batch.
				const rippleDomain = resolveRippleDomain({
					tracks: _tracks,
					seedTrackIds: selectedTrackIds,
					links: deriveTimelineLinks({ tracks: _tracks }),
				});
				if (rippleDomain.lockedDependencyTrackIds.length > 0) {
					handleError(
						new Error("Cannot ripple: a linked dependency track is locked"),
						{
							operation: "Delete Selected Elements With Ripple",
							category: ErrorCategory.VALIDATION,
							severity: ErrorSeverity.MEDIUM,
							metadata: {
								lockedTrackIds: rippleDomain.lockedDependencyTrackIds,
							},
						}
					);
					return {
						deletedElements: 0,
						splitElements: 0,
						totalRemovedDuration: 0,
					};
				}

				if (pushHistory) get().pushHistory();

				let workingTracks = _tracks;
				let deletedElements = 0;
				let splitElements = 0;
				let totalRemovedDuration = 0;
				for (const range of [...mergedRanges].reverse()) {
					const result = applyDeleteTimeRangeToTracks({
						tracks: workingTracks,
						startTime: range.startTime,
						endTime: range.endTime,
						targetTrackIds: selectedTrackIds,
						rippleTrackIds: rippleDomain.domainTrackIds,
						fps: getProjectFps(),
					});
					workingTracks = result.tracks;
					deletedElements += result.deletedElements;
					splitElements += result.splitElements;
					totalRemovedDuration += result.totalRemovedDuration;
				}

				updateTracksAndSave(workingTracks);
				get().clearSelectedElements();
				return { deletedElements, splitElements, totalRemovedDuration };
			} catch (error) {
				handleError(error, {
					operation: "Delete Selected Timeline Elements With Ripple",
					category: ErrorCategory.SYSTEM,
					severity: ErrorSeverity.HIGH,
					metadata: {
						selectionCount: selections.length,
					},
				});
				return {
					deletedElements: 0,
					splitElements: 0,
					totalRemovedDuration: 0,
				};
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
				// Explicitly named tracks fail closed on a lock; the "all tracks"
				// default is a derived set and skips locked tracks instead.
				const hasExplicitTargets = Boolean(trackIds && trackIds.length > 0);
				if (
					hasExplicitTargets &&
					blockedByTrackLock({
						tracks: _tracks,
						operation: "Delete Timeline Time Range",
						trackIds,
					})
				) {
					return {
						deletedElements: 0,
						splitElements: 0,
						totalRemovedDuration: 0,
					};
				}
				const targetTrackIds = hasExplicitTargets
					? new Set(trackIds)
					: new Set(
							_tracks.filter((track) => !track.locked).map((track) => track.id)
						);

				get().pushHistory();

				const rippleTrackIds = new Set<string>();
				if (ripple) {
					if (crossTrackRipple) {
						for (const track of _tracks) {
							if (!track.locked) rippleTrackIds.add(track.id);
						}
					} else {
						for (const trackId of targetTrackIds) {
							rippleTrackIds.add(trackId);
						}
					}
				}

				const result = applyDeleteTimeRangeToTracks({
					tracks: _tracks,
					startTime: clampedStartTime,
					endTime: clampedEndTime,
					targetTrackIds,
					rippleTrackIds,
					fps: getProjectFps(),
				});

				updateTracksAndSave(result.tracks);

				return {
					deletedElements: result.deletedElements,
					splitElements: result.splitElements,
					totalRemovedDuration: result.totalRemovedDuration,
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
