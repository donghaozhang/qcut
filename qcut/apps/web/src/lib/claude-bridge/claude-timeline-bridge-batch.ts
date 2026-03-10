import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { validateElementTrackCompatibility } from "@/types/timeline";
import type {
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeBatchDeleteResponse,
	ClaudeBatchUpdateResponse,
	ClaudeArrangeResponse,
} from "../../../../../electron/types/claude-api";
import { debugError } from "@/lib/debug/debug-config";
import { syncProjectMediaIfNeeded } from "./claude-timeline-bridge-helpers";
import type {
	ClaudeTimelineBridgeAPI,
	ClaudeTimelineBridgeSharedUtils,
} from "./claude-timeline-bridge";
import { applyElementChanges } from "./claude-timeline-bridge-elements";

const MAX_TIMELINE_BATCH_ITEMS = 50;

export function setupBatchHandlers({
	claudeAPI,
	sharedUtils,
}: {
	claudeAPI: ClaudeTimelineBridgeAPI;
	sharedUtils: ClaudeTimelineBridgeSharedUtils;
}): void {
	if (
		typeof claudeAPI.onBatchAddElements === "function" &&
		typeof claudeAPI.sendBatchAddElementsResponse === "function"
	) {
		claudeAPI.onBatchAddElements(async (data: any) => {
			const defaultErrorResponse: ClaudeBatchAddResponse = {
				added: [],
				failedCount: data.elements.length,
			};
			try {
				if (data.elements.length > MAX_TIMELINE_BATCH_ITEMS) {
					const message = `Batch add limit is ${MAX_TIMELINE_BATCH_ITEMS} elements`;
					const failedResponse: ClaudeBatchAddResponse = {
						added: data.elements.map((_: any, index: number) => ({
							index,
							success: false,
							error: message,
						})),
						failedCount: data.elements.length,
					};
					claudeAPI.sendBatchAddElementsResponse(
						data.requestId,
						failedResponse
					);
					return;
				}

				if (data.elements.length === 0) {
					claudeAPI.sendBatchAddElementsResponse(data.requestId, {
						added: [],
						failedCount: 0,
					});
					return;
				}

				const timelineStore = useTimelineStore.getState();
				const tracksById = new Map(
					timelineStore.tracks.map((track) => [track.id, track])
				);

				for (const element of data.elements) {
					const normalizedType = sharedUtils.normalizeClaudeElementType({
						type: element.type,
					});
					if (!normalizedType) {
						throw new Error(`Unsupported element type: ${element.type}`);
					}

					const track = tracksById.get(element.trackId);
					if (!track) {
						throw new Error(`Track not found: ${element.trackId}`);
					}

					if (
						typeof element.startTime !== "number" ||
						Number.isNaN(element.startTime) ||
						element.startTime < 0
					) {
						throw new Error("Element startTime must be a non-negative number");
					}
					if (
						typeof element.duration !== "number" ||
						Number.isNaN(element.duration) ||
						element.duration <= 0
					) {
						throw new Error("Element duration must be greater than 0");
					}

					const compatibility = validateElementTrackCompatibility(
						{ type: normalizedType },
						{ type: track.type }
					);
					if (!compatibility.isValid) {
						throw new Error(
							compatibility.errorMessage || "Track compatibility failed"
						);
					}
				}

				// Sync media from disk so newly-imported files are discoverable
				const projectId = useProjectStore.getState().activeProject?.id;
				if (projectId) {
					await syncProjectMediaIfNeeded({ projectId });
				}

				timelineStore.pushHistory();

				const added: ClaudeBatchAddResponse["added"] = [];
				let failedCount = 0;

				for (const [index, element] of data.elements.entries()) {
					try {
						const normalizedType = sharedUtils.normalizeClaudeElementType({
							type: element.type,
						});
						if (!normalizedType) {
							throw new Error(`Unsupported element type: ${element.type}`);
						}

						let createdElementId: string | null = null;

						if (normalizedType === "media") {
							const mediaId = sharedUtils.resolveMediaIdForBatchElement({
								element,
							});
							if (!mediaId) {
								throw new Error("Media source could not be resolved");
							}

							createdElementId = timelineStore.addElementToTrack(
								element.trackId,
								{
									type: "media",
									name: element.sourceName || "Media",
									mediaId,
									startTime: element.startTime,
									duration: element.duration,
									trimStart: 0,
									trimEnd: 0,
								},
								{
									pushHistory: false,
									selectElement: false,
								}
							);
						} else if (normalizedType === "text") {
							const style = element.style || {};
							const content =
								typeof element.content === "string" &&
								element.content.length > 0
									? element.content
									: "Text";

							createdElementId = timelineStore.addElementToTrack(
								element.trackId,
								{
									type: "text",
									name: content,
									content,
									startTime: element.startTime,
									duration: element.duration,
									trimStart: 0,
									trimEnd: 0,
									fontSize:
										typeof style.fontSize === "number" ? style.fontSize : 48,
									fontFamily:
										typeof style.fontFamily === "string"
											? style.fontFamily
											: "Inter",
									color:
										typeof style.color === "string" ? style.color : "#ffffff",
									backgroundColor:
										typeof style.backgroundColor === "string"
											? style.backgroundColor
											: "transparent",
									textAlign:
										style.textAlign === "left" ||
										style.textAlign === "right" ||
										style.textAlign === "center"
											? style.textAlign
											: "center",
									fontWeight: style.fontWeight === "bold" ? "bold" : "normal",
									fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
									textDecoration:
										style.textDecoration === "underline" ||
										style.textDecoration === "line-through"
											? style.textDecoration
											: "none",
									x: 0.5,
									y: 0.5,
									rotation: 0,
									opacity: 1,
								},
								{
									pushHistory: false,
									selectElement: false,
								}
							);
						} else if (normalizedType === "markdown") {
							const markdownContent =
								typeof element.markdownContent === "string" &&
								element.markdownContent.length > 0
									? element.markdownContent
									: typeof element.content === "string" &&
											element.content.length > 0
										? element.content
										: "Markdown";
							const style = element.style || {};

							createdElementId = timelineStore.addElementToTrack(
								element.trackId,
								{
									type: "markdown",
									name: markdownContent.slice(0, 50),
									markdownContent,
									startTime: element.startTime,
									duration: element.duration,
									trimStart: 0,
									trimEnd: 0,
									theme:
										style.theme === "light" || style.theme === "transparent"
											? style.theme
											: "dark",
									fontSize:
										typeof style.fontSize === "number" ? style.fontSize : 14,
									fontFamily:
										typeof style.fontFamily === "string"
											? style.fontFamily
											: "Inter",
									padding:
										typeof style.padding === "number" ? style.padding : 16,
									backgroundColor:
										typeof style.backgroundColor === "string"
											? style.backgroundColor
											: "#1a1a2e",
									textColor:
										typeof style.textColor === "string"
											? style.textColor
											: "#e0e0e0",
									scrollMode: "static",
									scrollSpeed: 50,
									x: 0,
									y: 0,
									width: 400,
									height: 300,
									rotation: 0,
									opacity: 1,
								},
								{
									pushHistory: false,
									selectElement: false,
								}
							);
						} else {
							throw new Error(`Unsupported batch add type: ${normalizedType}`);
						}

						if (!createdElementId) {
							throw new Error("Failed to create timeline element");
						}

						added.push({
							index,
							success: true,
							elementId: createdElementId,
						});
					} catch (error) {
						failedCount++;
						added.push({
							index,
							success: false,
							error: error instanceof Error ? error.message : "Unknown error",
						});
					}
				}

				claudeAPI.sendBatchAddElementsResponse(data.requestId, {
					added,
					failedCount,
				});
			} catch (error) {
				debugError(
					"[ClaudeTimelineBridge] Failed to batch add elements:",
					error
				);
				const errorMessage =
					error instanceof Error ? error.message : "Batch add failed";
				claudeAPI.sendBatchAddElementsResponse(data.requestId, {
					...defaultErrorResponse,
					added: data.elements.map((_: any, index: number) => ({
						index,
						success: false,
						error: errorMessage,
					})),
				});
			}
		});
	}

	if (
		typeof claudeAPI.onBatchUpdateElements === "function" &&
		typeof claudeAPI.sendBatchUpdateElementsResponse === "function"
	) {
		claudeAPI.onBatchUpdateElements((data: any) => {
			try {
				if (data.updates.length > MAX_TIMELINE_BATCH_ITEMS) {
					const limitMessage = `Batch update limit is ${MAX_TIMELINE_BATCH_ITEMS} items`;
					const failedResponse: ClaudeBatchUpdateResponse = {
						updatedCount: 0,
						failedCount: data.updates.length,
						results: data.updates.map((_: any, index: number) => ({
							index,
							success: false,
							error: limitMessage,
						})),
					};
					claudeAPI.sendBatchUpdateElementsResponse(
						data.requestId,
						failedResponse
					);
					return;
				}

				if (data.updates.length === 0) {
					claudeAPI.sendBatchUpdateElementsResponse(data.requestId, {
						updatedCount: 0,
						failedCount: 0,
						results: [],
					});
					return;
				}

				useTimelineStore.getState().pushHistory();

				const results: ClaudeBatchUpdateResponse["results"] = [];
				let updatedCount = 0;
				let failedCount = 0;

				for (const [index, update] of data.updates.entries()) {
					const success = applyElementChanges({
						elementId: update.elementId,
						changes: update,
						pushHistory: false,
					});
					if (success) {
						updatedCount++;
						results.push({ index, success: true });
						continue;
					}

					failedCount++;
					results.push({
						index,
						success: false,
						error: `Element not found: ${update.elementId}`,
					});
				}

				claudeAPI.sendBatchUpdateElementsResponse(data.requestId, {
					updatedCount,
					failedCount,
					results,
				});
			} catch (error) {
				debugError(
					"[ClaudeTimelineBridge] Failed to batch update elements:",
					error
				);
				const errorMessage =
					error instanceof Error ? error.message : "Batch update failed";
				claudeAPI.sendBatchUpdateElementsResponse(data.requestId, {
					updatedCount: 0,
					failedCount: data.updates.length,
					results: data.updates.map((_: any, index: number) => ({
						index,
						success: false,
						error: errorMessage,
					})),
				});
			}
		});
	}

	if (
		typeof claudeAPI.onBatchDeleteElements === "function" &&
		typeof claudeAPI.sendBatchDeleteElementsResponse === "function"
	) {
		claudeAPI.onBatchDeleteElements((data: any) => {
			try {
				if (data.elements.length > MAX_TIMELINE_BATCH_ITEMS) {
					const limitMessage = `Batch delete limit is ${MAX_TIMELINE_BATCH_ITEMS} items`;
					const failedResponse: ClaudeBatchDeleteResponse = {
						deletedCount: 0,
						failedCount: data.elements.length,
						results: data.elements.map((_: any, index: number) => ({
							index,
							success: false,
							error: limitMessage,
						})),
					};
					claudeAPI.sendBatchDeleteElementsResponse(
						data.requestId,
						failedResponse
					);
					return;
				}

				if (data.elements.length === 0) {
					claudeAPI.sendBatchDeleteElementsResponse(data.requestId, {
						deletedCount: 0,
						failedCount: 0,
						results: [],
					});
					return;
				}

				const timelineStore = useTimelineStore.getState();
				timelineStore.pushHistory();

				let deletedCount = 0;
				let failedCount = 0;
				const results: ClaudeBatchDeleteResponse["results"] = [];

				for (const [index, entry] of data.elements.entries()) {
					try {
						const currentTrack = useTimelineStore
							.getState()
							.tracks.find((track) => track.id === entry.trackId);
						const elementExists = currentTrack?.elements.some(
							(element) => element.id === entry.elementId
						);

						if (!elementExists) {
							throw new Error(`Element not found: ${entry.elementId}`);
						}

						if (data.ripple) {
							timelineStore.removeElementFromTrackWithRipple(
								entry.trackId,
								entry.elementId,
								false,
								true
							);
						} else {
							timelineStore.removeElementFromTrack(
								entry.trackId,
								entry.elementId,
								false
							);
						}
						deletedCount++;
						results.push({ index, success: true });
					} catch (error) {
						failedCount++;
						results.push({
							index,
							success: false,
							error: error instanceof Error ? error.message : "Delete failed",
						});
					}
				}

				claudeAPI.sendBatchDeleteElementsResponse(data.requestId, {
					deletedCount,
					failedCount,
					results,
				});
			} catch (error) {
				debugError(
					"[ClaudeTimelineBridge] Failed to batch delete elements:",
					error
				);
				const errorMessage =
					error instanceof Error ? error.message : "Batch delete failed";
				claudeAPI.sendBatchDeleteElementsResponse(data.requestId, {
					deletedCount: 0,
					failedCount: data.elements.length,
					results: data.elements.map((_: any, index: number) => ({
						index,
						success: false,
						error: errorMessage,
					})),
				});
			}
		});
	}

	if (
		typeof claudeAPI.onArrange === "function" &&
		typeof claudeAPI.sendArrangeResponse === "function"
	) {
		claudeAPI.onArrange((data: any) => {
			try {
				const timelineStore = useTimelineStore.getState();
				const track = timelineStore.tracks.find(
					(candidate) => candidate.id === data.request.trackId
				);

				if (!track || track.elements.length === 0) {
					claudeAPI.sendArrangeResponse(data.requestId, { arranged: [] });
					return;
				}

				const requestMode = data.request.mode;
				const startOffset =
					typeof data.request.startOffset === "number" &&
					data.request.startOffset >= 0
						? data.request.startOffset
						: 0;
				const gap =
					typeof data.request.gap === "number" && data.request.gap >= 0
						? data.request.gap
						: requestMode === "spaced"
							? 0.5
							: 0;

				const byStartTime = [...track.elements].sort(
					(left, right) => left.startTime - right.startTime
				);

				let orderedElements = byStartTime;
				if (requestMode === "manual" && data.request.order?.length) {
					const elementsById = new Map(
						byStartTime.map((element) => [element.id, element])
					);
					const manualOrder: typeof byStartTime = [];

					for (const elementId of data.request.order) {
						const element = elementsById.get(elementId);
						if (!element) {
							continue;
						}
						manualOrder.push(element);
						elementsById.delete(elementId);
					}

					orderedElements = [...manualOrder, ...elementsById.values()];
				}

				timelineStore.pushHistory();

				const arranged: ClaudeArrangeResponse["arranged"] = [];
				let currentStartTime = startOffset;
				for (const element of orderedElements) {
					const effectiveDuration = Math.max(
						0,
						element.duration - element.trimStart - element.trimEnd
					);

					timelineStore.updateElementStartTime(
						track.id,
						element.id,
						currentStartTime,
						false
					);
					arranged.push({
						elementId: element.id,
						newStartTime: currentStartTime,
					});
					currentStartTime += effectiveDuration + gap;
				}

				claudeAPI.sendArrangeResponse(data.requestId, { arranged });
			} catch (error) {
				debugError("[ClaudeTimelineBridge] Failed to arrange track:", error);
				claudeAPI.sendArrangeResponse(data.requestId, { arranged: [] });
			}
		});
	}
}
