import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import type { ClaudeElement } from "../../../../../electron/types/claude-api";
import { debugLog, debugWarn, debugError } from "@/lib/debug/debug-config";
import {
	findTrackByElementId,
	isClaudeMediaElementType,
	addClaudeMediaElement,
	addClaudeTextElement,
	addClaudeStickerElement,
	addClaudeCaptionElement,
	addClaudeMarkdownElement,
	addClaudeRemotionElement,
} from "./claude-timeline-bridge-helpers";
import type { ClaudeTimelineBridgeAPI } from "./claude-timeline-bridge";

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

		if (element.type === "text") {
			const textUpdates: Record<string, unknown> = {};
			if (typeof changes.content === "string") {
				textUpdates.content = changes.content;
			}
			if (changes.style) {
				const style = changes.style;
				if (typeof style.fontSize === "number")
					textUpdates.fontSize = style.fontSize;
				if (typeof style.fontFamily === "string")
					textUpdates.fontFamily = style.fontFamily;
				if (typeof style.color === "string") textUpdates.color = style.color;
				if (typeof style.backgroundColor === "string")
					textUpdates.backgroundColor = style.backgroundColor;
				if (typeof style.textAlign === "string")
					textUpdates.textAlign = style.textAlign;
				if (typeof style.fontWeight === "string")
					textUpdates.fontWeight = style.fontWeight;
				if (typeof style.fontStyle === "string")
					textUpdates.fontStyle = style.fontStyle;
				if (typeof style.textDecoration === "string")
					textUpdates.textDecoration = style.textDecoration;
			}
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

		if (element.type === "media" && changes.style) {
			const mediaUpdates: Record<string, unknown> = {};
			if (typeof changes.style.volume === "number") {
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
	claudeAPI.onAddElement(async (element: any) => {
		try {
			debugLog("[ClaudeTimelineBridge] Adding element:", element);

			const timelineStore = useTimelineStore.getState();
			const projectId = useProjectStore.getState().activeProject?.id;

			if (isClaudeMediaElementType({ type: element.type })) {
				await addClaudeMediaElement({
					element,
					timelineStore,
					projectId,
				});
				return;
			}

			if (element.type === "text") {
				addClaudeTextElement({
					element,
					timelineStore,
				});
				return;
			}

			if (element.type === "markdown") {
				addClaudeMarkdownElement({
					element,
					timelineStore,
				});
				return;
			}

			if (element.type === "sticker") {
				await addClaudeStickerElement({
					element,
					timelineStore,
				});
				return;
			}

			if (element.type === "remotion") {
				await addClaudeRemotionElement({
					element,
					timelineStore,
				});
				return;
			}

			if (element.type === "captions" || element.type === "caption") {
				console.log("[CaptionDebug] onAddElement matched caption type:", element.type);
				addClaudeCaptionElement({
					element,
					timelineStore,
				});
				return;
			}

			debugWarn(
				"[ClaudeTimelineBridge] Unsupported element type:",
				element.type
			);
		} catch (error) {
			debugError("[ClaudeTimelineBridge] Failed to add element:", error);
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
