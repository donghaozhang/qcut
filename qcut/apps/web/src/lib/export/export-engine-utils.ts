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

/** Interface for active elements at a specific time */
export interface ActiveElement {
	element: TimelineElement;
	track: TimelineTrack;
	mediaItem: MediaItem | null;
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

/** The subset of resolved media visual properties the canvas transform needs. */
export interface MediaTransformVisual {
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
	opacity: number;
}

export function isIdentityMediaTransform({
	visual,
}: {
	visual: MediaTransformVisual;
}): boolean {
	return (
		visual.x === 0 &&
		visual.y === 0 &&
		visual.rotation === 0 &&
		visual.scaleX === 1 &&
		visual.scaleY === 1 &&
		!visual.flipHorizontal &&
		!visual.flipVertical &&
		visual.opacity === 1
	);
}

/**
 * Draws a media element under its visual transform, matching the preview
 * semantics exactly: the element's bounds center moves to
 * (boundsCenter + x/y), rotation is clockwise-positive degrees about that
 * center (canvas and CSS agree in y-down space), flips ride the scale sign,
 * and opacity multiplies into globalAlpha. Identity transforms skip the
 * save/restore entirely so untouched exports stay byte-stable.
 */
export async function drawWithMediaTransform({
	ctx,
	visual,
	bounds,
	draw,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	visual: MediaTransformVisual;
	bounds: { x: number; y: number; width: number; height: number };
	draw: () => Promise<void> | void;
}): Promise<void> {
	if (isIdentityMediaTransform({ visual })) {
		await draw();
		return;
	}
	const centerX = bounds.x + bounds.width / 2;
	const centerY = bounds.y + bounds.height / 2;
	ctx.save();
	try {
		ctx.translate(centerX + visual.x, centerY + visual.y);
		ctx.rotate((visual.rotation * Math.PI) / 180);
		ctx.scale(
			visual.scaleX * (visual.flipHorizontal ? -1 : 1),
			visual.scaleY * (visual.flipVertical ? -1 : 1)
		);
		ctx.translate(-centerX, -centerY);
		ctx.globalAlpha *= Math.min(1, Math.max(0, visual.opacity));
		await draw();
	} finally {
		ctx.restore();
	}
}
