import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import type { ClaudeElement } from "../../../../../electron/types/claude-api";
import { debugLog, debugWarn, debugError } from "@/lib/debug/debug-config";
import {
	findTrackByElementId,
	isClaudeMediaElementType,
	addClaudeMediaElement,
	addClaudeTextElement,
	addClaudeAdjustmentElement,
	addClaudeStickerElement,
	addClaudeCaptionElement,
	addClaudeMarkdownElement,
	addClaudeRemotionElement,
	getClaudeAdjustmentFields,
	getClaudeTextProperties,
	getClaudeMediaTimingProperties,
} from "./claude-timeline-bridge-helpers";
import type { ClaudeTimelineBridgeAPI } from "./claude-timeline-bridge";

function timelineElementFromTransport({
	candidate,
}: {
	candidate: unknown;
}): Partial<ClaudeElement> {
	if (
		typeof candidate !== "object" ||
		candidate === null ||
		Array.isArray(candidate)
	) {
		throw new Error("Invalid timeline element payload");
	}
	return Object.fromEntries(
		Object.entries(candidate).filter(
			([key]) => key !== "requestId" && key !== "correlationId"
		)
	) as Partial<ClaudeElement>;
}

export const applyElementChanges = ({
	elementId,
	changes,
	pushHistory,
}: {
	elementId: string;
	changes: Partial<ClaudeElement>;
	pushHistory: boolean;
}): boolean => {
	try {
		const timelineStore = useTimelineStore.getState();
		const track = findTrackByElementId(timelineStore.tracks, elementId);
		if (!track) {
			debugWarn(
				"[ClaudeTimelineBridge] Could not find track for element:",
				elementId
			);
			return false;
		}

		const element = track.elements.find(
			(candidate) => candidate.id === elementId
		);
		if (!element) {
			debugWarn(
				"[ClaudeTimelineBridge] Could not find element in resolved track:",
				elementId
			);
			return false;
		}

		const styleChanges =
			typeof changes.style === "object" &&
			changes.style !== null &&
			!Array.isArray(changes.style)
				? changes.style
				: undefined;
		const updatesTextAnimationPreset =
			changes.textAnimationPreset !== undefined ||
			styleChanges?.textAnimationPreset !== undefined;
		const textUpdates =
			element.type === "text"
				? {
						...getClaudeTextProperties({
							element: {
								...(updatesTextAnimationPreset &&
								element.textAnimations !== undefined
									? { textAnimations: element.textAnimations }
									: {}),
								...changes,
							} as Partial<ClaudeElement> & Record<string, unknown>,
						}),
						...(typeof changes.content === "string"
							? { content: changes.content }
							: {}),
					}
				: null;

		if (pushHistory) {
			timelineStore.pushHistory();
		}

		if (typeof changes.startTime === "number") {
			timelineStore.updateElementStartTime(
				track.id,
				elementId,
				changes.startTime,
				false
			);
		}

		if (
			typeof changes.trimStart === "number" ||
			typeof changes.trimEnd === "number"
		) {
			timelineStore.updateElementTrim(
				track.id,
				elementId,
				changes.trimStart ?? element.trimStart,
				changes.trimEnd ?? element.trimEnd,
				false
			);
		}

		const isMarkdown = element.type === "markdown";
		if (typeof changes.duration === "number" && changes.duration > 0) {
			if (isMarkdown) {
				timelineStore.updateMarkdownElement(
					track.id,
					elementId,
					{ duration: changes.duration },
					false
				);
			} else {
				timelineStore.updateElementDuration(
					track.id,
					elementId,
					changes.duration,
					false
				);
			}
		} else if (typeof changes.endTime === "number") {
			const resolvedStart = changes.startTime ?? element.startTime;
			const resolvedDuration = changes.endTime - resolvedStart;
			if (resolvedDuration > 0) {
				if (isMarkdown) {
					timelineStore.updateMarkdownElement(
						track.id,
						elementId,
						{ duration: resolvedDuration },
						false
					);
				} else {
					timelineStore.updateElementDuration(
						track.id,
						elementId,
						resolvedDuration,
						false
					);
				}
			}
		}

		if (textUpdates) {
			if (Object.keys(textUpdates).length > 0) {
				timelineStore.updateTextElement(
					track.id,
					elementId,
					textUpdates,
					false
				);
			}
		}

		if (element.type === "markdown") {
			const markdownUpdates: Record<string, unknown> = {};
			if (typeof changes.content === "string") {
				markdownUpdates.markdownContent = changes.content;
			}
			if (Object.keys(markdownUpdates).length > 0) {
				timelineStore.updateMarkdownElement(
					track.id,
					elementId,
					markdownUpdates,
					false
				);
			}
		}

		if (element.type === "media") {
			const timingUpdates = getClaudeMediaTimingProperties({
				element: changes,
			});
			if (Object.keys(timingUpdates).length > 0) {
				timelineStore.updateMediaTiming(
					track.id,
					elementId,
					timingUpdates,
					false
				);
			}

			const mediaUpdates: Record<string, unknown> = {};
			if (typeof changes.style?.volume === "number") {
				mediaUpdates.volume = changes.style.volume;
			}
			if (Object.keys(mediaUpdates).length > 0) {
				timelineStore.updateMediaElement(
					track.id,
					elementId,
					mediaUpdates,
					false
				);
			}
		}

		if (element.type === "adjustment") {
			const adjustmentUpdates = getClaudeAdjustmentFields({
				element: changes as Partial<ClaudeElement> & Record<string, unknown>,
			});
			if (Object.keys(adjustmentUpdates).length > 0) {
				timelineStore.updateAdjustmentElement(
					track.id,
					elementId,
					adjustmentUpdates,
					false
				);
			}
		}

		return true;
	} catch (error) {
		debugError(
			"[ClaudeTimelineBridge] Failed to apply element changes:",
			error
		);
		return false;
	}
};

export function setupElementHandlers({
	claudeAPI,
}: {
	claudeAPI: ClaudeTimelineBridgeAPI;
}): void {
	// Handle element addition from Claude
	claudeAPI.onAddElement(async (candidate: unknown) => {
		try {
			const element = timelineElementFromTransport({ candidate });
			const elementType = (element as Record<string, unknown>).type;
			debugLog("[ClaudeTimelineBridge] Adding element:", element);

			const timelineStore = useTimelineStore.getState();
			const projectId = useProjectStore.getState().activeProject?.id;
			let addedElementId: string;

			if (isClaudeMediaElementType({ type: element.type })) {
				addedElementId = await addClaudeMediaElement({
					element,
					timelineStore,
					projectId,
				});
			} else if (element.type === "text") {
				addedElementId = addClaudeTextElement({
					element,
					timelineStore,
				});
			} else if (element.type === "adjustment") {
				addedElementId = addClaudeAdjustmentElement({
					element,
					timelineStore,
				});
			} else if (element.type === "markdown") {
				addedElementId = addClaudeMarkdownElement({
					element,
					timelineStore,
				});
			} else if (element.type === "sticker") {
				addedElementId = await addClaudeStickerElement({
					element,
					timelineStore,
				});
			} else if (element.type === "remotion") {
				addedElementId = await addClaudeRemotionElement({
					element,
					timelineStore,
				});
			} else if (element.type === "captions" || elementType === "caption") {
				console.log(
					"[CaptionDebug] onAddElement matched caption type:",
					elementType
				);
				addedElementId = addClaudeCaptionElement({
					element:
						elementType === "caption"
							? { ...element, type: "captions" }
							: element,
					timelineStore,
				});
			} else {
				throw new Error(`Unsupported element type: ${String(elementType)}`);
			}

			debugLog(
				"[ClaudeTimelineBridge] Added element with renderer acknowledgement:",
				addedElementId
			);
		} catch (error) {
			debugError("[ClaudeTimelineBridge] Failed to add element:", error);
			throw error instanceof Error ? error : new Error(String(error));
		}
	});

	// Handle element update from Claude
	claudeAPI.onUpdateElement((data: any) => {
		try {
			debugLog("[ClaudeTimelineBridge] Updating element:", data.elementId);
			const updated = applyElementChanges({
				elementId: data.elementId,
				changes: data.changes,
				pushHistory: true,
			});
			if (!updated) {
				return;
			}
			debugLog("[ClaudeTimelineBridge] Updated element:", data.elementId);
		} catch (error) {
			debugError(
				"[ClaudeTimelineBridge] Failed to handle element update:",
				error
			);
		}
	});
}
