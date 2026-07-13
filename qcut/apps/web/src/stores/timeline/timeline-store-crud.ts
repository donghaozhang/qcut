/**
 * Timeline Store CRUD Operations
 *
 * All add/remove/move/update methods for tracks and elements.
 * Uses dependency injection for store closure helpers.
 *
 * @module stores/timeline-store-crud
 */

import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import {
	moveTrack as reorderTracks,
	validateElementTrackCompatibility,
} from "@/types/timeline";
import { generateUUID } from "@/lib/utils";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { clampMarkdownDuration } from "@/lib/markdown";
import {
	COMPACT_TRACK_HEIGHTS,
	getTrackHeight,
	TIMELINE_CONSTANTS,
} from "@/constants/timeline-constants";
import {
	DEFAULT_MEDIA_MASK,
	normalizeMediaMask,
	resolveMediaMasks,
} from "@/lib/video/video-properties";
import type { TimelineStore } from "./index";
import { createTrack } from "./index";
import type { StoreGet, StoreSet } from "./timeline-store-operations";
import { normalizeTrackAudioSettings } from "@/lib/audio/audio-mix-settings";
import { applyCaptionStyleToTracks } from "./caption-style-operations";
import {
	groupTimelineElements,
	moveTimelineElementGroup,
	ungroupTimelineElements,
} from "./timeline-group-operations";
import {
	breakApartMediaContainer,
	createMediaContainer,
	selectMulticamClip,
} from "./timeline-compound-operations";

export interface CrudDeps {
	updateTracksAndSave: (tracks: TimelineTrack[]) => void;
}

/** Creates track/element CRUD operations (add, remove, move, update) for the timeline store. */
export function createCrudOperations(
	get: StoreGet,
	set: StoreSet,
	deps: CrudDeps
) {
	const { updateTracksAndSave } = deps;

	return {
		addTrack: (type) => {
			get().pushHistory();
			const newTrack = createTrack(type);
			updateTracksAndSave([...get()._tracks, newTrack]);
			return newTrack.id;
		},

		insertTrackAt: (type, index) => {
			get().pushHistory();
			const newTrack = createTrack(type);
			const newTracks = [...get()._tracks];
			const clampedIndex = Math.min(Math.max(0, index), newTracks.length);
			newTracks.splice(clampedIndex, 0, newTrack);
			updateTracksAndSave(newTracks);
			return newTrack.id;
		},

		moveTrack: (trackId, toIndex) => {
			const reorderedTracks = reorderTracks({
				tracks: get()._tracks,
				trackId,
				toIndex,
			});
			if (
				reorderedTracks.every(
					(track, index) => track.id === get()._tracks[index]?.id
				)
			) {
				return;
			}

			get().pushHistory();
			updateTracksAndSave(reorderedTracks);
		},

		addElementToTrack: (
			trackId,
			elementData,
			options = { pushHistory: true, selectElement: true }
		) => {
			const shouldPushHistory = options.pushHistory !== false;
			const shouldSelectElement = options.selectElement !== false;

			// Validate element type matches track type
			const track = get()._tracks.find((t) => t.id === trackId);
			if (!track) {
				handleError(new Error(`Track not found: ${trackId}`), {
					operation: "Add Element to Track",
					category: ErrorCategory.VALIDATION,
					severity: ErrorSeverity.MEDIUM,
					metadata: { trackId },
				});
				return null;
			}

			// Use utility function for validation
			const validation = validateElementTrackCompatibility(elementData, track);
			if (!validation.isValid) {
				handleError(
					new Error(
						validation.errorMessage || "Invalid element for track type"
					),
					{
						operation: "Element Track Compatibility",
						category: ErrorCategory.VALIDATION,
						severity: ErrorSeverity.MEDIUM,
						metadata: {
							trackType: track.type,
							elementType: elementData.type,
						},
					}
				);
				return null;
			}

			// For media elements, validate mediaId exists
			if (elementData.type === "media" && !elementData.mediaId) {
				handleError(new Error("Media element must have mediaId"), {
					operation: "Media Element Validation",
					category: ErrorCategory.VALIDATION,
					severity: ErrorSeverity.MEDIUM,
					metadata: { elementType: "media", trackId },
				});
				return null;
			}

			// For text elements, validate required text properties
			if (elementData.type === "text" && !elementData.content) {
				handleError(new Error("Text element must have content"), {
					operation: "Text Element Validation",
					category: ErrorCategory.VALIDATION,
					severity: ErrorSeverity.MEDIUM,
					metadata: { elementType: "text", trackId },
				});
				return null;
			}

			// For markdown elements, validate required markdown content
			if (
				elementData.type === "markdown" &&
				typeof elementData.markdownContent !== "string"
			) {
				handleError(new Error("Markdown element must have markdownContent"), {
					operation: "Markdown Element Validation",
					category: ErrorCategory.VALIDATION,
					severity: ErrorSeverity.MEDIUM,
					metadata: { elementType: "markdown", trackId },
				});
				return null;
			}

			// Push history after all validations pass
			if (shouldPushHistory) {
				get().pushHistory();
			}

			// Check if this is the first element being added to the timeline
			const currentState = get();
			const totalElementsInTimeline = currentState._tracks.reduce(
				(total, t) => total + t.elements.length,
				0
			);
			const isFirstElement = totalElementsInTimeline === 0;

			const normalizedElementData =
				elementData.type === "markdown"
					? {
							...elementData,
							duration: clampMarkdownDuration({
								duration:
									elementData.duration ??
									TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
							}),
						}
					: elementData;

			const newElement: TimelineElement = {
				...normalizedElementData,
				id: generateUUID(),
				startTime: normalizedElementData.startTime ?? 0,
				trimStart: normalizedElementData.trimStart ?? 0,
				trimEnd: normalizedElementData.trimEnd ?? 0,
			} as TimelineElement; // Type assertion since we trust the caller passes valid data

			// If this is the first element and it's a media element, automatically set the project canvas size
			// to match the media's aspect ratio and FPS (for videos)
			if (isFirstElement && newElement.type === "media") {
				import("../media/media-store")
					.then(({ useMediaStore, getMediaAspectRatio }) => {
						const mediaStore = useMediaStore.getState();
						const mediaItem = mediaStore.mediaItems.find(
							(item) => item.id === newElement.mediaId
						);

						if (
							mediaItem &&
							(mediaItem.type === "image" || mediaItem.type === "video")
						) {
							import("../editor/editor-store").then(({ useEditorStore }) => {
								const editorStore = useEditorStore.getState();
								editorStore.setCanvasSizeFromAspectRatio(
									getMediaAspectRatio(mediaItem)
								);
							});
						}

						// Set project FPS from the first video element
						if (mediaItem && mediaItem.type === "video" && mediaItem.fps) {
							const fps = mediaItem.fps;
							import("../project-store")
								.then(({ useProjectStore }) => {
									const projectStore = useProjectStore.getState();
									if (projectStore.activeProject) {
										projectStore.updateProjectFps(fps);
									}
								})
								.catch((error) => {
									handleError(error, {
										operation: "Update FPS from Project Store",
										category: ErrorCategory.STORAGE,
										severity: ErrorSeverity.LOW,
										showToast: false,
										metadata: { operation: "fps-update" },
									});
								});
						}
					})
					.catch((error) => {
						handleError(error, {
							operation: "Set canvas size from first element",
							category: ErrorCategory.STORAGE,
							severity: ErrorSeverity.LOW,
							showToast: false,
						});
					});
			}

			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId ? { ...t, elements: [...t.elements, newElement] } : t
				)
			);

			if (shouldSelectElement) {
				get().selectElement(trackId, newElement.id);
			}

			return newElement.id;
		},

		removeElementFromTrack: (trackId, elementId, pushHistory = true) => {
			// If removing a sticker element, also clean up the overlay store
			const track = get()._tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((el) => el.id === elementId);
			if (element?.type === "sticker" && "stickerId" in element) {
				const stickerId = (element as { stickerId: string }).stickerId;
				import("@/stores/stickers-overlay-store")
					.then(({ useStickersOverlayStore }) => {
						// Guard: only remove if sticker still exists (prevents infinite loop)
						if (
							useStickersOverlayStore.getState().overlayStickers.has(stickerId)
						) {
							useStickersOverlayStore
								.getState()
								.removeOverlaySticker(stickerId);
						}
					})
					.catch((error) => {
						handleError(error, {
							operation: "Clean up sticker overlay",
							category: ErrorCategory.STORAGE,
							severity: ErrorSeverity.LOW,
							showToast: false,
						});
					});
			}

			const { rippleEditingEnabled } = get();

			if (rippleEditingEnabled) {
				get().removeElementFromTrackWithRipple(trackId, elementId, pushHistory);
			} else {
				if (pushHistory) get().pushHistory();
				updateTracksAndSave(
					get()
						._tracks.map((t) =>
							t.id === trackId
								? {
										...t,
										elements: t.elements.filter((el) => el.id !== elementId),
									}
								: t
						)
						.filter((t) => t.elements.length > 0 || t.isMain)
				);
			}
		},

		moveElementToTrack: (fromTrackId, toTrackId, elementId) => {
			const fromTrack = get()._tracks.find((t) => t.id === fromTrackId);
			const toTrack = get()._tracks.find((t) => t.id === toTrackId);
			const elementToMove = fromTrack?.elements.find(
				(el) => el.id === elementId
			);

			if (!elementToMove || !toTrack) return;

			// Validate element type compatibility with target track
			const validation = validateElementTrackCompatibility(
				elementToMove,
				toTrack
			);
			if (!validation.isValid) {
				handleError(
					new Error(validation.errorMessage || "Invalid drag operation"),
					{
						operation: "Timeline Drag Validation",
						category: ErrorCategory.VALIDATION,
						severity: ErrorSeverity.MEDIUM,
						metadata: { targetTrackId: toTrackId, elementId },
					}
				);
				return;
			}

			// Push history after validation passes
			get().pushHistory();

			const newTracks = get()
				._tracks.map((t) => {
					if (t.id === fromTrackId) {
						return {
							...t,
							elements: t.elements.filter((el) => el.id !== elementId),
						};
					}
					if (t.id === toTrackId) {
						return {
							...t,
							elements: [...t.elements, elementToMove],
						};
					}
					return t;
				})
				.filter((t) => t.elements.length > 0 || t.isMain);

			updateTracksAndSave(newTracks);
		},

		updateElementTrim: (
			trackId,
			elementId,
			trimStart,
			trimEnd,
			pushHistory = true
		) => {
			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId ? { ...el, trimStart, trimEnd } : el
								),
							}
						: t
				)
			);
		},

		updateElementDuration: (
			trackId,
			elementId,
			duration,
			pushHistory = true
		) => {
			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId ? { ...el, duration } : el
								),
							}
						: t
				)
			);
		},

		updateElementStartTime: (
			trackId,
			elementId,
			startTime,
			pushHistory = true
		) => {
			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				moveTimelineElementGroup({
					tracks: get()._tracks,
					trackId,
					elementId,
					startTime,
				})
			);
		},

		toggleTrackMute: (trackId) => {
			get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId ? { ...t, muted: !t.muted } : t
				)
			);
		},

		updateTrackAudio: (trackId, updates, pushHistory = true) => {
			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								audio: normalizeTrackAudioSettings({
									audio: { ...track.audio, ...updates },
								}),
							}
						: track
				)
			);
		},

		updateTrackHeight: (trackId, height, pushHistory = true) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			if (!track) return;
			const nextHeight = getTrackHeight(track.type, height);
			if (getTrackHeight(track.type, track.height) === nextHeight) return;
			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? { ...candidate, height: nextHeight }
						: candidate
				)
			);
		},

		setTrackHeightMode: (mode) => {
			get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((track) => ({
					...track,
					height:
						mode === "compact" ? COMPACT_TRACK_HEIGHTS[track.type] : undefined,
				}))
			);
		},

		groupSelectedElements: () => {
			const selectedElements = get().selectedElements;
			if (selectedElements.length < 2) return null;
			const groupId = `group-${generateUUID()}`;
			const result = groupTimelineElements({
				tracks: get()._tracks,
				selectedElements,
				groupId,
			});
			if (result.groupedCount < 2) return null;
			get().pushHistory();
			updateTracksAndSave(result.tracks);
			return groupId;
		},

		ungroupElements: (groupId) => {
			const result = ungroupTimelineElements({
				tracks: get()._tracks,
				groupId,
			});
			if (result.ungroupedCount === 0) return 0;
			get().pushHistory();
			updateTracksAndSave(result.tracks);
			return result.ungroupedCount;
		},

		createMediaContainerFromSelection: (kind) => {
			const containerId = `${kind}-${generateUUID()}`;
			const result = createMediaContainer({
				tracks: get()._tracks,
				selectedElements: get().selectedElements,
				containerId,
				kind,
			});
			if (!result.container || !result.trackId) return null;
			get().pushHistory();
			updateTracksAndSave(result.tracks);
			set({
				selectedElements: [
					{ trackId: result.trackId, elementId: result.container.id },
				],
				selectedTransition: null,
			});
			return result.container.id;
		},

		breakApartMediaContainer: (trackId, elementId) => {
			const result = breakApartMediaContainer({
				tracks: get()._tracks,
				trackId,
				elementId,
			});
			if (result.restoredCount === 0) return 0;
			get().pushHistory();
			updateTracksAndSave(result.tracks);
			set({ selectedElements: [], selectedTransition: null });
			return result.restoredCount;
		},

		selectMulticamClip: (trackId, elementId, clipId) => {
			const result = selectMulticamClip({
				tracks: get()._tracks,
				trackId,
				elementId,
				clipId,
			});
			if (!result.changed) return false;
			get().pushHistory();
			updateTracksAndSave(result.tracks);
			return true;
		},

		toggleTrackSolo: (trackId) => {
			get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								audio: normalizeTrackAudioSettings({
									audio: {
										...track.audio,
										solo: !track.audio?.solo,
									},
								}),
							}
						: track
				)
			);
		},

		toggleTrackHidden: (trackId) => {
			get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId ? { ...track, hidden: !track.hidden } : track
				)
			);
		},

		toggleTrackLocked: (trackId) => {
			get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId ? { ...track, locked: !track.locked } : track
				)
			);
		},

		toggleElementHidden: (trackId, elementId) => {
			get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId ? { ...el, hidden: !el.hidden } : el
								),
							}
						: t
				)
			);
		},

		updateTextElement: (trackId, elementId, updates, pushHistory = true) => {
			if (pushHistory) {
				get().pushHistory();
			}
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId && el.type === "text"
										? { ...el, ...updates }
										: el
								),
							}
						: t
				)
			);
		},

		updateCaptionElement: (trackId, elementId, updates, pushHistory = true) => {
			if (pushHistory) {
				get().pushHistory();
			}
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId && el.type === "captions"
										? {
												...el,
												...updates,
												style:
													updates.style !== undefined
														? {
																...(
																	el as import("@/types/timeline").CaptionElement
																).style,
																...updates.style,
															}
														: (el as import("@/types/timeline").CaptionElement)
																.style,
											}
										: el
								),
							}
						: t
				)
			);
		},

		applyCaptionStyle: ({
			trackId,
			elementId,
			style,
			scope,
			pushHistory = true,
		}) => {
			const result = applyCaptionStyleToTracks({
				tracks: get()._tracks,
				selectedElements: get().selectedElements,
				trackId,
				elementId,
				style,
				scope,
			});
			if (result.updatedCount === 0) return 0;

			if (pushHistory) get().pushHistory();
			updateTracksAndSave(result.tracks);
			return result.updatedCount;
		},

		updateStickerElement: (trackId, elementId, updates, pushHistory = true) => {
			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				get()._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								elements: track.elements.map((element) =>
									element.id === elementId && element.type === "sticker"
										? { ...element, ...updates }
										: element
								),
							}
						: track
				)
			);
		},

		updateMarkdownElement: (
			trackId,
			elementId,
			updates,
			pushHistory = true
		) => {
			if (pushHistory) {
				get().pushHistory();
			}
			const normalizedUpdates =
				updates.duration !== undefined
					? {
							...updates,
							duration: clampMarkdownDuration({ duration: updates.duration }),
						}
					: updates;

			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId && el.type === "markdown"
										? { ...el, ...normalizedUpdates }
										: el
								),
							}
						: t
				)
			);
		},

		updateElementTransform: (elementId, updates, options) => {
			const push = options?.pushHistory !== false;
			if (push) get().pushHistory();
			const newTracks = get()._tracks.map((t) => ({
				...t,
				elements: t.elements.map((el) => {
					if (el.id !== elementId) return el;
					return {
						...el,
						...(updates.position && {
							x: updates.position.x,
							y: updates.position.y,
						}),
						...(updates.size && {
							width: updates.size.width,
							height: updates.size.height,
							...(updates.size.x !== undefined && { x: updates.size.x }),
							...(updates.size.y !== undefined && { y: updates.size.y }),
						}),
						...(updates.rotation !== undefined && {
							rotation: updates.rotation,
						}),
					};
				}),
			}));
			updateTracksAndSave(newTracks);
		},

		updateElementPosition: (elementId, position) =>
			get().updateElementTransform(
				elementId,
				{ position },
				{ pushHistory: true }
			),

		updateElementSize: (elementId, size) =>
			get().updateElementTransform(elementId, { size }, { pushHistory: true }),

		updateElementRotation: (elementId, rotation) =>
			get().updateElementTransform(
				elementId,
				{ rotation },
				{ pushHistory: true }
			),

		updateMediaElement: (trackId, elementId, updates, pushHistory = true) => {
			if (pushHistory) {
				get().pushHistory();
			}
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) => {
									if (el.id !== elementId || el.type !== "media") return el;
									if (updates.masks !== undefined) {
										const masks = updates.masks
											.filter((mask) => mask.type !== "none")
											.map((mask, index) => normalizeMediaMask(mask, index));
										return {
											...el,
											...updates,
											masks,
											mask: masks[0] ?? normalizeMediaMask(DEFAULT_MEDIA_MASK),
										};
									}
									if (updates.mask) {
										const existing = resolveMediaMasks(el);
										const first = normalizeMediaMask(
											{ ...existing[0], ...updates.mask },
											0
										);
										const masks =
											first.type === "none"
												? []
												: [first, ...existing.slice(1)];
										return { ...el, ...updates, mask: first, masks };
									}
									return { ...el, ...updates };
								}),
							}
						: t
				)
			);
		},

		updateRemotionElement: (
			trackId,
			elementId,
			updates,
			pushHistory = true
		) => {
			if (pushHistory) {
				get().pushHistory();
			}
			updateTracksAndSave(
				get()._tracks.map((t) =>
					t.id === trackId
						? {
								...t,
								elements: t.elements.map((el) =>
									el.id === elementId && el.type === "remotion"
										? { ...el, ...updates }
										: el
								),
							}
						: t
				)
			);
		},
	} satisfies Partial<TimelineStore>;
}
