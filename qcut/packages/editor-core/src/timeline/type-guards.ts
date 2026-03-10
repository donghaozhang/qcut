/**
 * Timeline element type guards.
 * Extracted from apps/web/src/types/timeline.ts
 *
 * @module @qcut/editor-core/timeline/type-guards
 */

import type {
	TimelineElement,
	MediaElement,
	TextElement,
	StickerElement,
	CaptionElement,
	RemotionElement,
	MarkdownElement,
	TimelineTrack,
} from "../types/timeline.js";

export function isMediaElement(
	element: TimelineElement
): element is MediaElement {
	return element.type === "media";
}

export function isTextElement(
	element: TimelineElement
): element is TextElement {
	return element.type === "text";
}

export function isStickerElement(
	element: TimelineElement
): element is StickerElement {
	return element.type === "sticker";
}

export function isCaptionElement(
	element: TimelineElement
): element is CaptionElement {
	return element.type === "captions";
}

export function isRemotionElement(
	element: TimelineElement
): element is RemotionElement {
	return element.type === "remotion";
}

export function isMarkdownElement(
	element: TimelineElement
): element is MarkdownElement {
	return element.type === "markdown";
}

/** Get all Remotion elements from a list of tracks. */
export function getRemotionElements(
	tracks: TimelineTrack[]
): RemotionElement[] {
	const remotionElements: RemotionElement[] = [];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (isRemotionElement(element)) {
				remotionElements.push(element);
			}
		}
	}
	return remotionElements;
}

/** Get Remotion elements active at a specific time. */
export function getActiveRemotionElements(
	tracks: TimelineTrack[],
	currentTime: number
): RemotionElement[] {
	return getRemotionElements(tracks).filter((element) => {
		const effectiveStart = element.startTime;
		const effectiveEnd =
			element.startTime +
			(element.duration - element.trimStart - element.trimEnd);
		return currentTime >= effectiveStart && currentTime < effectiveEnd;
	});
}
