/**
 * Claude Timeline Bridge
 * Connects Electron main process Claude API with renderer's Zustand stores.
 * Helper functions are in claude-timeline-bridge-helpers.ts.
 */

import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";
import type {
	ClaudeElement,
	ClaudeBatchAddElementRequest,
} from "../../../../../electron/types/claude-api";
import { debugLog, debugWarn, debugError } from "@/lib/debug/debug-config";
import {
	calculateTimelineDuration,
	findTrackByElementId,
} from "./claude-timeline-bridge-helpers";
import { setupRequestHandlers } from "./claude-timeline-bridge-request";
import { setupElementHandlers } from "./claude-timeline-bridge-elements";
import { setupBatchHandlers } from "./claude-timeline-bridge-batch";

const CLAUDE_TRACK_ELEMENT_TYPES = {
	media: "media",
	text: "text",
	sticker: "sticker",
	captions: "captions",
	remotion: "remotion",
	markdown: "markdown",
} as const;

type ClaudeTrackElementType =
	(typeof CLAUDE_TRACK_ELEMENT_TYPES)[keyof typeof CLAUDE_TRACK_ELEMENT_TYPES];

export type ClaudeTimelineBridgeAPI = NonNullable<
	NonNullable<import("@qcut/platform-core").PlatformClaudeAPI>["timeline"]
>;

export function normalizeClaudeElementType({
	type,
}: {
	type: Partial<ClaudeElement>["type"] | undefined;
}): ClaudeTrackElementType | null {
	if (!type) return null;
	if (type === "video" || type === "audio" || type === "image") {
		return CLAUDE_TRACK_ELEMENT_TYPES.media;
	}
	if (
		type === CLAUDE_TRACK_ELEMENT_TYPES.media ||
		type === CLAUDE_TRACK_ELEMENT_TYPES.text ||
		type === CLAUDE_TRACK_ELEMENT_TYPES.sticker ||
		type === CLAUDE_TRACK_ELEMENT_TYPES.captions ||
		type === CLAUDE_TRACK_ELEMENT_TYPES.remotion ||
		type === CLAUDE_TRACK_ELEMENT_TYPES.markdown
	) {
		return type;
	}
	return null;
}

export function decodeDeterministicMediaSourceName({
	sourceId,
}: {
	sourceId: string;
}): string | null {
	try {
		if (!sourceId.startsWith("media_")) {
			return null;
		}
		const encodedName = sourceId.slice("media_".length);
		if (!encodedName) {
			return null;
		}
		const base64 = encodedName.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
		const binary = window.atob(padded);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

export function resolveMediaIdForBatchElement({
	element,
}: {
	element: ClaudeBatchAddElementRequest;
}): string | null {
	const { mediaItems } = useMediaStore.getState();

	if (element.mediaId) {
		const byMediaId = mediaItems.find((item) => item.id === element.mediaId);
		if (byMediaId) {
			return byMediaId.id;
		}

		const decodedMediaIdName = decodeDeterministicMediaSourceName({
			sourceId: element.mediaId,
		});
		if (decodedMediaIdName) {
			const byDecodedMediaIdName = mediaItems.find(
				(item) => item.name === decodedMediaIdName
			);
			if (byDecodedMediaIdName) {
				return byDecodedMediaIdName.id;
			}
		}
	}

	if (element.sourceId) {
		const bySourceId = mediaItems.find((item) => item.id === element.sourceId);
		if (bySourceId) {
			return bySourceId.id;
		}

		const decodedName = decodeDeterministicMediaSourceName({
			sourceId: element.sourceId,
		});
		if (decodedName) {
			const byDecodedName = mediaItems.find(
				(item) => item.name === decodedName
			);
			if (byDecodedName) {
				return byDecodedName.id;
			}
		}
	}

	if (element.sourceName) {
		const byName = mediaItems.find((item) => item.name === element.sourceName);
		if (byName) {
			return byName.id;
		}
	}

	return null;
}

export type ClaudeTimelineBridgeSharedUtils = {
	normalizeClaudeElementType: typeof normalizeClaudeElementType;
	resolveMediaIdForBatchElement: typeof resolveMediaIdForBatchElement;
};

/**
 * Setup Claude Timeline Bridge
 * Call this once during app initialization
 */
export function setupClaudeTimelineBridge(): void {
	const claude = platform().claude;
	if (!claude?.timeline) {
		debugWarn("[ClaudeTimelineBridge] Claude Timeline API not available");
		return;
	}

	const claudeAPI = claude.timeline;
	debugLog("[ClaudeTimelineBridge] Setting up bridge...");

	// Listen for media imports so the renderer store gets the File object (needed for preview)
	if (claude.media?.onMediaImported) {
		claude.media.onMediaImported(async (data: any) => {
			try {
				const projectId = useProjectStore.getState().activeProject?.id;
				if (!projectId) return;

				// Check if already in store by ID or path (avoid duplicates)
				const existing = useMediaStore
					.getState()
					.mediaItems.find(
						(item) =>
							item.id === data.id ||
							(item.localPath && item.localPath === data.path)
					);
				if (existing?.file) return;

				debugLog(
					"[ClaudeTimelineBridge] Loading imported media into store:",
					data.name
				);

				const buffer = await platform().files.readFile(data.path);
				if (!buffer) return;

				const ext = data.name.split(".").pop()?.toLowerCase() || "";
				const mimeMap: Record<string, string> = {
					mp4: "video/mp4",
					webm: "video/webm",
					mov: "video/quicktime",
					mp3: "audio/mpeg",
					wav: "audio/wav",
					png: "image/png",
					jpg: "image/jpeg",
					jpeg: "image/jpeg",
				};
				const mimeType = mimeMap[ext] || `${data.type || "application"}/${ext}`;

				const uint8 = new Uint8Array(buffer);
				const blob = new Blob([uint8], { type: mimeType });
				const fileObj = new File([blob], data.name, { type: mimeType });

				const { getOrCreateObjectURL } = await import(
					"@/lib/media/blob-manager"
				);
				const displayUrl = getOrCreateObjectURL(fileObj, "claude-media-import");

				await useMediaStore.getState().addMediaItem(projectId, {
					id: data.id,
					name: data.name,
					type: (data.type as "video" | "audio" | "image") || "video",
					file: fileObj,
					url: displayUrl,
					localPath: data.path,
					isLocalFile: true,
				});

				debugLog("[ClaudeTimelineBridge] Media loaded into store:", data.name);
			} catch (error) {
				debugWarn(
					"[ClaudeTimelineBridge] Failed to load imported media:",
					error
				);
			}
		});
	}

	setupRequestHandlers({ claudeAPI });

	setupElementHandlers({ claudeAPI });

	setupBatchHandlers({
		claudeAPI,
		sharedUtils: {
			normalizeClaudeElementType,
			resolveMediaIdForBatchElement,
		},
	});

	// Handle element removal
	claudeAPI.onRemoveElement((elementId: any) => {
		try {
			debugLog("[ClaudeTimelineBridge] Removing element:", elementId);
			const timelineStore = useTimelineStore.getState();
			const tracks = timelineStore.tracks;

			const track = findTrackByElementId(tracks, elementId);
			if (track) {
				timelineStore.removeElementFromTrack(track.id, elementId);
				return;
			}

			debugWarn(
				"[ClaudeTimelineBridge] Could not find track for element:",
				elementId
			);
		} catch (error) {
			debugError(
				"[ClaudeTimelineBridge] Failed to handle element removal:",
				error
			);
		}
	});

	// Handle element split (request-response: returns secondElementId)
	claudeAPI.onSplitElement(
		(data: any) => {
			try {
				debugLog(
					"[ClaudeTimelineBridge] Splitting element:",
					data.elementId,
					"at",
					data.splitTime,
					"mode:",
					data.mode
				);
				const timelineStore = useTimelineStore.getState();
				const track = findTrackByElementId(
					timelineStore.tracks,
					data.elementId
				);

				if (!track) {
					debugWarn(
						"[ClaudeTimelineBridge] Could not find track for element:",
						data.elementId
					);
					claudeAPI.sendSplitResponse(data.requestId, {
						secondElementId: null,
					});
					return;
				}

				let secondElementId: string | null = null;
				if (data.mode === "keepLeft") {
					timelineStore.splitAndKeepLeft(
						track.id,
						data.elementId,
						data.splitTime
					);
				} else if (data.mode === "keepRight") {
					timelineStore.splitAndKeepRight(
						track.id,
						data.elementId,
						data.splitTime
					);
				} else {
					secondElementId = timelineStore.splitElement(
						track.id,
						data.elementId,
						data.splitTime
					);
				}

				claudeAPI.sendSplitResponse(data.requestId, { secondElementId });
				debugLog("[ClaudeTimelineBridge] Split complete:", { secondElementId });
			} catch (error) {
				debugError("[ClaudeTimelineBridge] Failed to split element:", error);
				claudeAPI.sendSplitResponse(data.requestId, {
					secondElementId: null,
				});
			}
		}
	);

	// Handle element move (fire-and-forget)
	claudeAPI.onMoveElement(
		(data: any) => {
			try {
				debugLog(
					"[ClaudeTimelineBridge] Moving element:",
					data.elementId,
					"to track:",
					data.toTrackId
				);
				const timelineStore = useTimelineStore.getState();
				const fromTrack = findTrackByElementId(
					timelineStore.tracks,
					data.elementId
				);

				if (!fromTrack) {
					debugWarn(
						"[ClaudeTimelineBridge] Could not find track for element:",
						data.elementId
					);
					return;
				}

				timelineStore.moveElementToTrack(
					fromTrack.id,
					data.toTrackId,
					data.elementId
				);

				if (typeof data.newStartTime === "number") {
					useTimelineStore
						.getState()
						.updateElementStartTime(
							data.toTrackId,
							data.elementId,
							data.newStartTime
						);
				}

				debugLog("[ClaudeTimelineBridge] Move complete:", data.elementId);
			} catch (error) {
				debugError("[ClaudeTimelineBridge] Failed to move element:", error);
			}
		}
	);

	// Handle selection set (fire-and-forget)
	claudeAPI.onSelectElements(
		(data: any) => {
			try {
				debugLog(
					"[ClaudeTimelineBridge] Setting selection:",
					data.elements.length,
					"elements"
				);
				const timelineStore = useTimelineStore.getState();
				timelineStore.clearSelectedElements();
				for (const el of data.elements) {
					useTimelineStore
						.getState()
						.selectElement(el.trackId, el.elementId, true);
				}
			} catch (error) {
				debugError("[ClaudeTimelineBridge] Failed to set selection:", error);
			}
		}
	);

	// Handle get selection (request-response)
	claudeAPI.onGetSelection((data: any) => {
		try {
			const { selectedElements } = useTimelineStore.getState();
			claudeAPI.sendSelectionResponse(data.requestId, selectedElements);
		} catch (error) {
			debugError("[ClaudeTimelineBridge] Failed to get selection:", error);
			claudeAPI.sendSelectionResponse(data.requestId, []);
		}
	});

	// Handle playback commands (fire-and-forget)
	if (typeof claudeAPI.onPlayback === "function") {
		claudeAPI.onPlayback(async (data: any) => {
			try {
				const { usePlaybackStore } = await import(
					"@/stores/editor/playback-store"
				);
				const store = usePlaybackStore.getState();
				switch (data.action) {
					case "play":
						store.play();
						break;
					case "pause":
						store.pause();
						break;
					case "toggle":
						store.toggle();
						break;
					case "seek":
						if (typeof data.time === "number") {
							store.seek(data.time);
						}
						break;
					default:
						debugWarn(
							"[ClaudeTimelineBridge] Unknown playback action:",
							data.action
						);
				}
				debugLog(
					"[ClaudeTimelineBridge] Playback action applied:",
					data.action
				);
			} catch (error) {
				debugError("[ClaudeTimelineBridge] Failed to handle playback:", error);
			}
		});
	}

	// Handle clear selection (fire-and-forget)
	claudeAPI.onClearSelection(() => {
		try {
			debugLog("[ClaudeTimelineBridge] Clearing selection");
			useTimelineStore.getState().clearSelectedElements();
		} catch (error) {
			debugError("[ClaudeTimelineBridge] Failed to clear selection:", error);
		}
	});

	// Handle batch cuts (request-response: removes multiple time ranges from an element)
	claudeAPI.onExecuteCuts(
		(data: any) => {
			const emptyResult = {
				cutsApplied: 0,
				elementsRemoved: 0,
				remainingElements: [] as Array<{
					id: string;
					startTime: number;
					duration: number;
				}>,
				totalRemovedDuration: 0,
			};

			try {
				debugLog(
					"[ClaudeTimelineBridge] Batch cuts:",
					data.cuts.length,
					"on element:",
					data.elementId
				);
				const timelineStore = useTimelineStore.getState();
				const track = findTrackByElementId(
					timelineStore.tracks,
					data.elementId
				);

				if (!track) {
					debugWarn(
						"[ClaudeTimelineBridge] Could not find track for element:",
						data.elementId
					);
					claudeAPI.sendExecuteCutsResponse(data.requestId, emptyResult);
					return;
				}

				// Push history ONCE for atomic undo
				timelineStore.pushHistory();

				// Sort cuts descending by start — process from end to avoid offset drift
				const sortedCuts = [...data.cuts].sort((a, b) => b.start - a.start);

				let cutsApplied = 0;
				let elementsRemoved = 0;
				let totalRemovedDuration = 0;

				for (const cut of sortedCuts) {
					const currentTracks = useTimelineStore.getState().tracks;
					const currentTrack = currentTracks.find((t) => t.id === track.id);
					if (!currentTrack) break;

					// Find element that contains this cut range
					const targetElement = currentTrack.elements.find((el) => {
						const elStart = el.startTime;
						const elEnd =
							el.startTime + (el.duration - el.trimStart - el.trimEnd);
						return elStart < cut.end && elEnd > cut.start;
					});

					if (!targetElement) continue;

					const effStart = targetElement.startTime;
					const effEnd =
						targetElement.startTime +
						(targetElement.duration -
							targetElement.trimStart -
							targetElement.trimEnd);

					const clampedStart = Math.max(cut.start, effStart);
					const clampedEnd = Math.min(cut.end, effEnd);
					if (clampedStart >= clampedEnd) continue;

					const store = useTimelineStore.getState();

					// Cut covers entire element → remove
					if (clampedStart <= effStart && clampedEnd >= effEnd) {
						store.removeElementFromTrack(track.id, targetElement.id, false);
						elementsRemoved++;
						totalRemovedDuration += effEnd - effStart;
						cutsApplied++;
						continue;
					}

					// Cut at end → keepLeft
					if (clampedEnd >= effEnd) {
						store.splitAndKeepLeft(
							track.id,
							targetElement.id,
							clampedStart,
							false
						);
						totalRemovedDuration += effEnd - clampedStart;
						cutsApplied++;
						continue;
					}

					// Cut at start → keepRight
					if (clampedStart <= effStart) {
						store.splitAndKeepRight(
							track.id,
							targetElement.id,
							clampedEnd,
							false
						);
						totalRemovedDuration += clampedEnd - effStart;
						cutsApplied++;
						continue;
					}

					// Cut in middle → split at start, split at end, remove middle
					const rightId = store.splitElement(
						track.id,
						targetElement.id,
						clampedStart,
						false
					);
					if (rightId) {
						const tailId = useTimelineStore
							.getState()
							.splitElement(track.id, rightId, clampedEnd, false);
						if (tailId) {
							useTimelineStore
								.getState()
								.removeElementFromTrack(track.id, rightId, false);
							elementsRemoved++;
						}
					}
					totalRemovedDuration += clampedEnd - clampedStart;
					cutsApplied++;
				}

				// Build remaining elements list
				const finalTracks = useTimelineStore.getState().tracks;
				const finalTrack = finalTracks.find((t) => t.id === track.id);
				const remainingElements = (finalTrack?.elements ?? []).map((el) => ({
					id: el.id,
					startTime: el.startTime,
					duration: el.duration - el.trimStart - el.trimEnd,
				}));

				claudeAPI.sendExecuteCutsResponse(data.requestId, {
					cutsApplied,
					elementsRemoved,
					remainingElements,
					totalRemovedDuration: Math.round(totalRemovedDuration * 100) / 100,
				});
			} catch (error) {
				debugError(
					"[ClaudeTimelineBridge] Failed to execute batch cuts:",
					error
				);
				claudeAPI.sendExecuteCutsResponse(data.requestId, emptyResult);
			}
		}
	);

	// Handle range delete (request-response: removes content in a time range)
	claudeAPI.onDeleteRange(
		(data: any) => {
			const emptyResult = {
				deletedElements: 0,
				splitElements: 0,
				totalRemovedDuration: 0,
			};

			try {
				const { startTime, endTime, trackIds, ripple, crossTrackRipple } =
					data.request;
				debugLog(
					"[ClaudeTimelineBridge] Range delete:",
					startTime,
					"to",
					endTime,
					"ripple:",
					ripple,
					"crossTrackRipple:",
					crossTrackRipple
				);

				const result = useTimelineStore.getState().deleteTimeRange({
					startTime,
					endTime,
					trackIds,
					ripple: ripple ?? true,
					crossTrackRipple: crossTrackRipple ?? false,
				});

				claudeAPI.sendDeleteRangeResponse(data.requestId, result);
			} catch (error) {
				debugError(
					"[ClaudeTimelineBridge] Failed to execute range delete:",
					error
				);
				claudeAPI.sendDeleteRangeResponse(data.requestId, emptyResult);
			}
		}
	);

	// Load transcription into Smart Speech panel
	if (typeof claudeAPI.onLoadSpeech === "function") {
		claudeAPI.onLoadSpeech(async (data: any) => {
			try {
				debugLog("[ClaudeTimelineBridge] Loading speech data:", data.fileName);
				const { useWordTimelineStore } = await import(
					"@/stores/timeline/word-timeline-store"
				);
				const { useMediaPanelStore } = await import(
					"@/components/editor/media-panel/store"
				);
				await useWordTimelineStore
					.getState()
					.loadFromTranscription(data, data.fileName);
				useMediaPanelStore.getState().setActiveTab("word-timeline");
				debugLog("[ClaudeTimelineBridge] Speech data loaded successfully");
			} catch (error) {
				debugError("[ClaudeTimelineBridge] Failed to load speech data:", error);
			}
		});
	}

	debugLog("[ClaudeTimelineBridge] Bridge setup complete");
}

/**
 * Cleanup bridge listeners
 */
export function cleanupClaudeTimelineBridge(): void {
	try {
		const claude = platform().claude;
		if (claude?.timeline?.removeListeners) {
			claude.timeline.removeListeners();
		}
	} catch {
		// Platform may not be initialized during cleanup
	}
	debugLog("[ClaudeTimelineBridge] Bridge cleanup complete");
}

/**
 * Setup Claude Project Bridge (for stats requests)
 */
export function setupClaudeProjectBridge(): void {
	const claude = platform().claude;
	if (!claude?.project) {
		return;
	}

	const projectAPI = claude.project;

	// Respond to stats request (must forward requestId for main process matching)
	projectAPI.onStatsRequest((_projectId: string, requestId: string) => {
		const timelineState = useTimelineStore.getState();
		const projectState = useProjectStore.getState();
		const tracks = timelineState.tracks;

		// Count media by type
		const mediaCount = { video: 0, audio: 0, image: 0 };
		let elementCount = 0;
		const mediaItems = useMediaStore.getState().mediaItems;

		for (const track of tracks) {
			elementCount += track.elements.length;
			for (const element of track.elements) {
				if (element.type === "media") {
					const mediaItem = mediaItems.find((m) => m.id === element.mediaId);
					if (mediaItem && mediaItem.type in mediaCount) {
						mediaCount[mediaItem.type]++;
					} else {
						// Fallback to video if media not found
						mediaCount.video++;
					}
				}
			}
		}

		const stats = {
			totalDuration: calculateTimelineDuration(tracks),
			mediaCount,
			trackCount: tracks.length,
			elementCount,
			lastModified:
				projectState.activeProject?.updatedAt?.getTime() || Date.now(),
			fileSize: 0, // Would need to calculate
		};

		projectAPI.sendStatsResponse(stats, requestId);
	});
}

/**
 * Cleanup project bridge listeners
 */
export function cleanupClaudeProjectBridge(): void {
	try {
		const claude = platform().claude;
		if (claude?.project?.removeListeners) {
			claude.project.removeListeners();
		}
	} catch {
		// Platform may not be initialized during cleanup
	}
}
