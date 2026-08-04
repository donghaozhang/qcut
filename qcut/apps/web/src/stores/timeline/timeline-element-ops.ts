import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import { createObjectURL } from "@/lib/media/blob-manager";
import {
	checkElementOverlaps,
	getTimelineElementDuration,
	getTimelineElementEndTime,
	resolveElementOverlaps,
} from "@/lib/timeline";
import { generateUUID } from "@/lib/utils";
import type {
	MediaElement,
	TimelineElement,
	TimelineTrack,
} from "@/types/timeline";
import type { MediaType } from "../media/media-store-types";
import { getElementNameWithSuffix } from "./index";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";
import { getTimelineSplitUpdates } from "./timeline-split-utils";
import { getTrackName } from "@qcut/editor-core";
import {
	assignNewStickerInstanceId,
	createStickerInstanceId,
} from "@/lib/stickers/sticker-instance";
import { blockedByTrackLock } from "./timeline-lock-guard";

export function createElementOps(
	get: StoreGet,
	_set: StoreSet,
	deps: OperationDeps
) {
	const { getProjectFps, updateTracksAndSave } = deps;

	return {
		updateElementStartTimeWithRipple: (
			trackId: string,
			elementId: string,
			newStartTime: number
		) => {
			const { _tracks, rippleEditingEnabled } = get();
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Update Element Start Time With Ripple",
					trackIds: [trackId],
				})
			) {
				return;
			}
			const clampedNewStartTime = Math.max(0, newStartTime);
			const groupedElement = _tracks
				.find((track) => track.id === trackId)
				?.elements.find((element) => element.id === elementId);
			if (groupedElement?.groupId) {
				get().updateElementStartTime(trackId, elementId, clampedNewStartTime);
				return;
			}

			if (!rippleEditingEnabled) {
				// If ripple editing is disabled, use regular update
				get().updateElementStartTime(trackId, elementId, clampedNewStartTime);
				return;
			}

			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((e) => e.id === elementId);

			if (!element || !track) return;

			get().pushHistory();

			const oldStartTime = element.startTime;
			const elementTimelineDuration = getTimelineElementDuration({ element });
			const oldEndTime = element.startTime + elementTimelineDuration;
			const newEndTime = clampedNewStartTime + elementTimelineDuration;
			const timeDelta = clampedNewStartTime - oldStartTime;

			// Update tracks based on multi-track ripple setting
			const updatedTracks = _tracks.map((currentTrack) => {
				// Only apply ripple effects to the same track unless multi-track ripple is enabled
				const shouldApplyRipple = currentTrack.id === trackId;

				const updatedElements = currentTrack.elements.map((currentElement) => {
					if (currentElement.id === elementId && currentTrack.id === trackId) {
						return { ...currentElement, startTime: clampedNewStartTime };
					}

					// Only apply ripple effects if we should process this track
					if (!shouldApplyRipple) {
						return currentElement;
					}

					// For ripple editing, we need to move elements that come after the moved element
					const currentElementStart = currentElement.startTime;

					// If moving element to the right (positive delta)
					if (timeDelta > 0) {
						// Move elements that start after the original position of the moved element
						if (currentElementStart >= oldEndTime) {
							return {
								...currentElement,
								startTime: currentElementStart + timeDelta,
							};
						}
					}
					// If moving element to the left (negative delta)
					else if (timeDelta < 0) {
						// Move elements that start after the new position of the moved element
						if (
							currentElementStart >= newEndTime &&
							currentElementStart >= oldStartTime
						) {
							return {
								...currentElement,
								startTime: Math.max(0, currentElementStart + timeDelta),
							};
						}
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
			});

			updateTracksAndSave(updatedTracks);
		},

		// -----------------------------------------------------------------------
		// Split operations
		// -----------------------------------------------------------------------

		splitElement: (
			trackId: string,
			elementId: string,
			splitTime: number,
			savePushHistory = true
		): string | null => {
			const { _tracks } = get();
			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);

			if (!element) return null;
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Split Element",
					trackIds: [trackId],
				})
			) {
				return null;
			}

			const effectiveStart = element.startTime;
			const effectiveEnd = getTimelineElementEndTime({ element });

			if (splitTime <= effectiveStart || splitTime >= effectiveEnd) return null;

			if (savePushHistory) get().pushHistory();

			const secondElementId = generateUUID();
			const splitUpdates = getTimelineSplitUpdates({
				element,
				splitTime,
				fps: getProjectFps(),
			});

			const leftPart = {
				...element,
				...splitUpdates.left,
				name: getElementNameWithSuffix(element.name, "left"),
			};

			const rightPart = assignNewStickerInstanceId({
				element: {
					...element,
					id: secondElementId,
					startTime: splitTime,
					...splitUpdates.right,
					name: getElementNameWithSuffix(element.name, "right"),
				},
				newStickerId: createStickerInstanceId(),
			});

			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								elements: track.elements.flatMap((c) =>
									c.id === elementId ? [leftPart, rightPart] : [c]
								),
							}
						: track
				)
			);

			return secondElementId;
		},

		// Split element and keep only the left portion
		splitAndKeepLeft: (
			trackId: string,
			elementId: string,
			splitTime: number,
			savePushHistory = true
		) => {
			const { _tracks } = get();
			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);

			if (!element) return;
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Split And Keep Left",
					trackIds: [trackId],
				})
			) {
				return;
			}

			const effectiveStart = element.startTime;
			const effectiveEnd = getTimelineElementEndTime({ element });

			if (splitTime <= effectiveStart || splitTime >= effectiveEnd) return;

			if (savePushHistory) get().pushHistory();

			const splitUpdates = getTimelineSplitUpdates({
				element,
				splitTime,
				fps: getProjectFps(),
			});

			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								elements: track.elements.map((c) =>
									c.id === elementId
										? {
												...c,
												...splitUpdates.left,
												name: getElementNameWithSuffix(c.name, "left"),
											}
										: c
								),
							}
						: track
				)
			);
		},

		// Split element and keep only the right portion
		splitAndKeepRight: (
			trackId: string,
			elementId: string,
			splitTime: number,
			savePushHistory = true
		) => {
			const { _tracks } = get();
			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);

			if (!element) return;
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Split And Keep Right",
					trackIds: [trackId],
				})
			) {
				return;
			}

			const effectiveStart = element.startTime;
			const effectiveEnd = getTimelineElementEndTime({ element });

			if (splitTime <= effectiveStart || splitTime >= effectiveEnd) return;

			if (savePushHistory) get().pushHistory();

			const splitUpdates = getTimelineSplitUpdates({
				element,
				splitTime,
				fps: getProjectFps(),
			});

			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								elements: track.elements.map((c) =>
									c.id === elementId
										? {
												...c,
												startTime: splitTime,
												...splitUpdates.right,
												name: getElementNameWithSuffix(c.name, "right"),
											}
										: c
								),
							}
						: track
				)
			);
		},

		// -----------------------------------------------------------------------
		// Audio & media operations
		// -----------------------------------------------------------------------

		// Get all audio elements for export
		getAudioElements: (): Array<{
			element: TimelineElement;
			trackId: string;
			absoluteStart: number;
		}> => {
			const { tracks } = get();
			const audioElements: Array<{
				element: TimelineElement;
				trackId: string;
				absoluteStart: number;
			}> = [];
			for (const track of tracks) {
				if (track.type === "audio" || track.type === "media") {
					for (const element of track.elements) {
						// Only media elements carry audio
						if (element.type === "media") {
							audioElements.push({
								element,
								trackId: track.id,
								absoluteStart: element.startTime,
							});
						}
					}
				}
			}
			return audioElements;
		},

		// Extract audio from video element to an audio track
		separateAudio: (trackId: string, elementId: string): string | null => {
			const { _tracks } = get();
			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);

			if (!element || element.type !== "media" || track?.type !== "media") {
				return null;
			}

			// The detached audio lands on the first audio track, so that track is
			// as much a target as the source track.
			const existingAudioTrack = _tracks.find((t) => t.type === "audio");
			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Separate Audio",
					trackIds: existingAudioTrack
						? [trackId, existingAudioTrack.id]
						: [trackId],
				})
			) {
				return null;
			}

			get().pushHistory();
			const audioElementId = generateUUID();
			const audioLinkGroupId = element.groupId ?? `group-${generateUUID()}`;
			const detachedAudioElement: MediaElement = {
				...element,
				id: audioElementId,
				groupId: audioLinkGroupId,
				name: getElementNameWithSuffix(element.name, "audio"),
				audio: element.audio ? { ...element.audio, enabled: true } : undefined,
			};
			const muteEmbeddedAudio = (
				candidate: TimelineElement
			): TimelineElement =>
				candidate.id === elementId && candidate.type === "media"
					? {
							...candidate,
							groupId: audioLinkGroupId,
							volume: 0,
							audio: candidate.audio
								? { ...candidate.audio, enabled: false }
								: undefined,
						}
					: candidate;

			if (existingAudioTrack) {
				updateTracksAndSave(
					get()._tracks.map((currentTrack) =>
						currentTrack.id === existingAudioTrack.id
							? {
									...currentTrack,
									elements: [...currentTrack.elements, detachedAudioElement],
								}
							: currentTrack.id === trackId
								? {
										...currentTrack,
										elements: currentTrack.elements.map(muteEmbeddedAudio),
									}
								: currentTrack
					)
				);
			} else {
				const newAudioTrack: TimelineTrack = {
					id: generateUUID(),
					name: getTrackName("audio"),
					type: "audio",
					elements: [detachedAudioElement],
					muted: false,
				};

				updateTracksAndSave([
					...get()._tracks.map((currentTrack) =>
						currentTrack.id === trackId
							? {
									...currentTrack,
									elements: currentTrack.elements.map(muteEmbeddedAudio),
								}
							: currentTrack
					),
					newAudioTrack,
				]);
			}

			return audioElementId;
		},

		// Replace media for an element
		replaceElementMedia: async (
			trackId: string,
			elementId: string,
			newFile: File
		): Promise<{ success: boolean; error?: string }> => {
			const { _tracks } = get();
			const track = _tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);

			if (!element) {
				return { success: false, error: "Timeline element not found" };
			}

			if (element.type !== "media") {
				return {
					success: false,
					error: "Replace is only available for media clips",
				};
			}

			if (
				blockedByTrackLock({
					tracks: _tracks,
					operation: "Replace Element Media",
					trackIds: [trackId],
				})
			) {
				return { success: false, error: "Cannot modify a locked track" };
			}

			try {
				const { useMediaStore } = await import("../media/media-store");
				const mediaStore = useMediaStore.getState();
				const { useProjectStore } = await import("../project-store");
				const projectStore = useProjectStore.getState();

				if (!projectStore.activeProject) {
					return { success: false, error: "No active project found" };
				}

				// Import required media processing functions
				const {
					getFileType,
					getImageDimensions,
					generateVideoThumbnail,
					getMediaDuration,
				} = await import("../media/media-store-loader").then((m) =>
					m.getMediaStoreUtils()
				);

				const fileType = getFileType(newFile);
				if (!fileType) {
					return {
						success: false,
						error:
							"Unsupported file type. Please select a video, audio, or image file.",
					};
				}

				// Process the new media file
				const mediaData: {
					name: string;
					type: MediaType;
					file: File;
					url: string;
					width?: number;
					height?: number;
					duration?: number;
					thumbnailUrl?: string;
				} = {
					name: newFile.name,
					type: fileType,
					file: newFile,
					url: createObjectURL(newFile, "timeline-add-media"),
				};

				try {
					// Get media-specific metadata
					if (fileType === "image") {
						const { width, height } = await getImageDimensions(newFile);
						mediaData.width = width;
						mediaData.height = height;
					} else if (fileType === "video") {
						const [duration, { thumbnailUrl, width, height }] =
							await Promise.all([
								getMediaDuration(newFile),
								generateVideoThumbnail(newFile),
							]);
						mediaData.duration = duration;
						mediaData.thumbnailUrl = thumbnailUrl;
						mediaData.width = width;
						mediaData.height = height;
					} else if (fileType === "audio") {
						mediaData.duration = await getMediaDuration(newFile);
					}
				} catch (error) {
					return {
						success: false,
						error: `Failed to process ${fileType} file: ${error instanceof Error ? error.message : "Unknown error"}`,
					};
				}

				// Add new media item to store
				let newMediaItemId: string;
				try {
					newMediaItemId = await mediaStore.addMediaItem(
						projectStore.activeProject.id,
						mediaData
					);
				} catch (error) {
					return {
						success: false,
						error: `Failed to add media to project: ${error instanceof Error ? error.message : "Unknown error"}`,
					};
				}

				// Re-acquire state after addMediaItem to avoid stale snapshot
				const newMediaItem = useMediaStore
					.getState()
					.mediaItems.find((item) => item.id === newMediaItemId);

				if (!newMediaItem) {
					return {
						success: false,
						error: "Failed to create media item in project. Please try again.",
					};
				}

				// The awaits above can span user edits: re-read the live timeline
				// instead of writing back the entry snapshot, and re-run the
				// preconditions against it.
				const currentTracks = get()._tracks;
				const currentElement = currentTracks
					.find((t) => t.id === trackId)
					?.elements.find((c) => c.id === elementId);
				if (!currentElement) {
					return {
						success: false,
						error: "Timeline element changed while importing the new media",
					};
				}
				if (
					blockedByTrackLock({
						tracks: currentTracks,
						operation: "Replace Element Media",
						trackIds: [trackId],
					})
				) {
					return { success: false, error: "Cannot modify a locked track" };
				}

				get().pushHistory();

				// Update the timeline element to reference the new media
				updateTracksAndSave(
					currentTracks.map((track) =>
						track.id === trackId
							? {
									...track,
									elements: track.elements.map((c) =>
										c.id === elementId
											? {
													...c,
													mediaId: newMediaItem.id,
													name: newMediaItem.name,
													// Update duration if the new media has a different duration
													duration: newMediaItem.duration || c.duration,
												}
											: c
									),
								}
							: track
					)
				);

				return { success: true };
			} catch (error) {
				handleError(error, {
					operation: "Replace Element Media",
					category: ErrorCategory.MEDIA_PROCESSING,
					severity: ErrorSeverity.MEDIUM,
					metadata: {
						elementId,
						trackId,
						fileName: newFile.name,
					},
				});
				return {
					success: false,
					error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		},
	};
}
