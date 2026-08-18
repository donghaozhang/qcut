import {
	buildCompositionPlan,
	type TimelineElement,
	type TimelineTrack,
} from "@/types/timeline";
import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import type { MediaItem } from "@/stores/media/media-store-types";
import { debugLog, debugWarn } from "@/lib/debug/debug-config";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { getTimelineElementDuration } from "@/lib/timeline";
import type { EffectParameters } from "@qcut/editor-core";
import { buildRegionParametersByElementId } from "@/lib/effects/region-effects";

/** Interface for active elements at a specific time */
export interface ActiveElement {
	element: TimelineElement;
	track: TimelineTrack;
	mediaItem: MediaItem | null;
}

/**
 * Region-effect coverage for one export frame: which elements the active
 * untargeted effect segments apply to, with their merged parameters. Built
 * per frame beside getActiveElements so the export draws what the preview
 * shows.
 */
export function buildRegionParametersForFrame(
	tracks: TimelineTrack[],
	currentTime: number,
	fps = 30
): ReadonlyMap<string, EffectParameters> {
	const plan = buildCompositionPlan({
		tracks,
		currentTime,
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element, fps }),
	});
	return buildRegionParametersByElementId({ plan, currentTime });
}

/** Calculate total number of frames needed for export */
export function calculateTotalFrames(
	totalDuration: number,
	fps: number
): number {
	return Math.ceil(totalDuration * fps);
}

/** Get active elements at a specific time */
export function getActiveElements(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	currentTime: number,
	fps = 30
): ActiveElement[] {
	const plan = buildCompositionPlan({
		tracks,
		currentTime,
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element, fps }),
	});
	const activeElements = plan.visualLayers.map(({ element, track }) => {
		let mediaItem = null;
		if (element.type === "media" && element.mediaId !== TEST_MEDIA_ID) {
			mediaItem =
				mediaItems.find((item) => item.id === element.mediaId) || null;
			if (!mediaItem) {
				debugWarn(`[ExportEngine] Media item not found: ${element.mediaId}`);
			}
		}
		return { element, track, mediaItem };
	});

	// Log active elements for investigation
	if (activeElements.length > 0 && currentTime % 1 === 0) {
		debugLog(
			`\n🔍 EXPORT @ ${currentTime.toFixed(1)}s: ${activeElements.length} active elements`
		);
		for (const { element } of activeElements) {
			const effects = useEffectsStore.getState().getElementEffects(element.id);
			const hasEffects = effects && effects.length > 0;
			debugLog(
				`  🎥 Element: ${element.id} (${element.type}) - Effects: ${hasEffects ? effects.length : "none"}`
			);
			if (hasEffects) {
				debugLog(
					`    ✨ Effects applied: ${effects.map((e) => `${e.name}(${e.enabled ? "on" : "off"})`).join(", ")}`
				);
			}
		}
	}

	return activeElements;
}

/**
 * Calculate element bounds with smart resolution adjustment.
 *
 * Scaling rules:
 * 1. If media is SMALLER than canvas in BOTH dimensions:
 *    - Keep original size, center with black padding
 * 2. If media is LARGER than canvas in ANY dimension:
 *    - Scale down to fit while maintaining aspect ratio
 * 3. Always center the result
 */
export function calculateElementBounds(
	element: TimelineElement,
	mediaWidth: number,
	mediaHeight: number,
	canvasWidth: number,
	canvasHeight: number
): { x: number; y: number; width: number; height: number } {
	const canvasAspect = canvasWidth / canvasHeight;
	const mediaAspect = mediaWidth / mediaHeight;

	let width: number;
	let height: number;

	const isSmaller = mediaWidth <= canvasWidth && mediaHeight <= canvasHeight;

	if (isSmaller) {
		width = mediaWidth;
		height = mediaHeight;
		debugLog(
			`[ExportEngine] Video smaller than canvas (${mediaWidth}x${mediaHeight} vs ${canvasWidth}x${canvasHeight}), keeping original size with padding`
		);
	} else {
		if (mediaAspect > canvasAspect) {
			width = canvasWidth;
			height = width / mediaAspect;
		} else {
			width = canvasHeight * mediaAspect;
			height = canvasHeight;
		}
		debugLog(
			`[ExportEngine] Video larger than canvas, scaling down from ${mediaWidth}x${mediaHeight} to ${Math.round(width)}x${Math.round(height)}`
		);
	}

	const x = (canvasWidth - width) / 2;
	const y = (canvasHeight - height) / 2;

	const isTextLike = element.type === "text" || element.type === "markdown";
	const elementX = isTextLike ? element.x : undefined;
	const elementY = isTextLike ? element.y : undefined;

	return {
		x: elementX ?? x,
		y: elementY ?? y,
		width,
		height,
	};
}
