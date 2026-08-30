import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media/media-store";
import { normalizeMediaPortraitAdjustments } from "@qcut/editor-core";
import type {
	MediaElement,
	MediaPortraitAdjustments,
	StickerElement,
} from "@/types/timeline";
import { DEFAULT_MEDIA_ENHANCEMENTS } from "@/lib/video/video-properties";
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
	resolveClaudeStickerRuntime,
	parseClaudeMediaFilterStack,
} from "./claude-timeline-bridge-helpers";
import type { ClaudeTimelineBridgeAPI } from "./claude-timeline-bridge";
import {
	assertTimelineProjectActive,
	readRequiredTimelineProjectId,
} from "./claude-timeline-project-guard";
import { resolveClaudeStickerGeometry } from "./claude-sticker-geometry";
import { parseTimelineColorLabel } from "@/lib/timeline/timeline-color-labels";

function timelineElementFromTransport({ candidate }: { candidate: unknown }): {
	element: Partial<ClaudeElement>;
	projectId: string;
} {
	if (
		typeof candidate !== "object" ||
		candidate === null ||
		Array.isArray(candidate)
	) {
		throw new Error("Invalid timeline element payload");
	}
	const record = candidate as Record<string, unknown>;
	const projectId = readRequiredTimelineProjectId({
		candidate: record.projectId,
	});
	const element = Object.fromEntries(
		Object.entries(candidate).filter(
			([key]) =>
				key !== "requestId" && key !== "correlationId" && key !== "projectId"
		)
	) as Partial<ClaudeElement>;
	return { element, projectId };
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
		const updatesColorLabel = Object.hasOwn(changes, "colorLabel");
		const colorLabel = updatesColorLabel
			? parseTimelineColorLabel({ value: changes.colorLabel })
			: undefined;

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

		if (
			element.type === "media" &&
			changes.portraitAdjustments !== undefined &&
			(typeof changes.portraitAdjustments !== "object" ||
				changes.portraitAdjustments === null ||
				Array.isArray(changes.portraitAdjustments))
		) {
			throw new Error("portraitAdjustments must be an object");
		}

		if (
			element.type === "media" &&
			changes.enhancements !== undefined &&
			(typeof changes.enhancements !== "object" ||
				changes.enhancements === null ||
				Array.isArray(changes.enhancements))
		) {
			throw new Error("enhancements must be an object");
		}

		if (pushHistory) {
			timelineStore.pushHistory();
		}

		if (updatesColorLabel) {
			timelineStore.setColorLabelForElements({
				elements: [{ trackId: track.id, elementId }],
				colorLabel,
				pushHistory: false,
			});
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
			if (changes.portraitAdjustments !== undefined) {
				mediaUpdates.portraitAdjustments = normalizeMediaPortraitAdjustments({
					adjustments:
						changes.portraitAdjustments as Partial<MediaPortraitAdjustments>,
				});
			}
			if (changes.enhancements !== undefined) {
				mediaUpdates.enhancements = {
					...DEFAULT_MEDIA_ENHANCEMENTS,
					...element.enhancements,
					...(changes.enhancements as Partial<
						typeof DEFAULT_MEDIA_ENHANCEMENTS
					>),
				};
			}
			if (changes.keyframes !== undefined) {
				if (
					typeof changes.keyframes !== "object" ||
					changes.keyframes === null ||
					Array.isArray(changes.keyframes)
				) {
					throw new Error("keyframes must be an object");
				}
				mediaUpdates.keyframes = changes.keyframes as MediaElement["keyframes"];
			}
			if (changes.filterStack !== undefined) {
				mediaUpdates.filterStack = parseClaudeMediaFilterStack({
					value: changes.filterStack,
				});
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

		if (element.type === "sticker") {
			const stickerUpdates: Partial<StickerElement> = {};
			const replacesMedia = typeof changes.mediaId === "string";
			const replacementMedia = replacesMedia
				? useMediaStore
						.getState()
						.mediaItems.find((item) => item.id === changes.mediaId)
				: undefined;
			if (replacesMedia && !replacementMedia) {
				throw new Error(
					`Sticker replacement media could not be resolved: ${changes.mediaId}`
				);
			}
			const updatesGeometry =
				changes.x !== undefined ||
				changes.y !== undefined ||
				changes.width !== undefined ||
				changes.height !== undefined;
			if (updatesGeometry) {
				const canvasSize = useProjectStore.getState().activeProject
					?.canvasSize ?? {
					width: 1920,
					height: 1080,
				};
				Object.assign(
					stickerUpdates,
					resolveClaudeStickerGeometry({
						canvasSize,
						current: element,
						patch: changes,
						space: changes.stickerGeometrySpace,
					})
				);
			}
			if (replacesMedia) {
				stickerUpdates.mediaId = changes.mediaId;
			}
			if (typeof changes.stickerId === "string") {
				stickerUpdates.stickerId = changes.stickerId;
			}
			if (typeof changes.stickerAssetId === "string") {
				stickerUpdates.stickerAssetId = changes.stickerAssetId;
			}
			const hasRuntimePatch = Object.hasOwn(changes, "stickerRuntime");
			if (hasRuntimePatch || replacesMedia) {
				const runtimeCandidate =
					!hasRuntimePatch || changes.stickerRuntime === null
						? replacementMedia?.metadata?.stickerRuntime
						: changes.stickerRuntime;
				stickerUpdates.stickerRuntime =
					runtimeCandidate === undefined
						? undefined
						: resolveClaudeStickerRuntime({
								candidate: runtimeCandidate,
							});
			}
			if (typeof changes.rotation === "number") {
				stickerUpdates.rotation = changes.rotation;
			}
			if (typeof changes.opacity === "number") {
				stickerUpdates.opacity = changes.opacity;
			}
			if (Object.keys(stickerUpdates).length > 0) {
				timelineStore.updateStickerElement(
					track.id,
					elementId,
					stickerUpdates,
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
			const { element, projectId } = timelineElementFromTransport({
				candidate,
			});
			assertTimelineProjectActive({ projectId });
			const elementType = (element as Record<string, unknown>).type;
			debugLog("[ClaudeTimelineBridge] Adding element:", element);

			const timelineStore = useTimelineStore.getState();
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
					projectId,
					timelineStore,
				});
			} else if (element.type === "remotion") {
				addedElementId = await addClaudeRemotionElement({
					element,
					projectId,
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
