"use client";

import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import { getVideoSource, type VideoSource } from "@/lib/media/media-source";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TranscriptionSegment } from "@/types/captions";
import type { TProject } from "@/types/project";
import type { SubtitleStyle } from "@/types/timeline";
import type { WordItem } from "@/types/word-timeline";
import { WORD_FILTER_STATE } from "@/types/word-timeline";
import { useMemo } from "react";
import type { ActiveElement } from "./types";

interface UsePreviewMediaParams {
	activeElements: ActiveElement[];
	mediaItems: MediaItem[];
	activeProject: TProject | null;
}

interface UsePreviewMediaResult {
	captionSegments: TranscriptionSegment[];
	captionStyle?: Partial<SubtitleStyle>;
	captionWords: WordItem[];
	blurBackgroundElements: ActiveElement[];
	videoSourcesById: Map<string, VideoSource>;
	activeVideoSource: VideoSource | null;
	blurBackgroundSource: VideoSource | null;
	currentMediaElement: ActiveElement | null;
}

/** Derives video sources, caption segments, and blur background data from active timeline elements. */
export function usePreviewMedia({
	activeElements,
	mediaItems,
	activeProject,
}: UsePreviewMediaParams): UsePreviewMediaResult {
	const currentMediaElement = useMemo(() => {
		try {
			for (let index = activeElements.length - 1; index >= 0; index--) {
				const item = activeElements[index];
				if (item.preload) continue;
				if (item.element.type === "media" && item.mediaItem?.type === "video") {
					return item;
				}
			}
			return null;
		} catch {
			return null;
		}
	}, [activeElements]);

	const captionSegments = useMemo(() => {
		try {
			const segments: TranscriptionSegment[] = [];
			let index = 0;

			for (const elementData of activeElements) {
				if (elementData.element.type !== "captions") {
					continue;
				}

				const element = elementData.element;
				segments.push({
					id: index,
					seek: element.startTime * 1000,
					start: element.startTime,
					end: element.startTime + element.duration,
					text: element.text,
					tokens: [],
					temperature: 0,
					avg_logprob: -0.5,
					compression_ratio: 1,
					no_speech_prob:
						element.confidence !== undefined && element.confidence !== null
							? Math.min(1, Math.max(0, 1 - (element.confidence ?? 0)))
							: 0.1,
				});

				index += 1;
			}

			return segments;
		} catch {
			return [];
		}
	}, [activeElements]);
	const captionPresentation = useMemo(() => {
		const captionWords: WordItem[] = [];
		let captionStyle: Partial<SubtitleStyle> | undefined;
		for (const elementData of activeElements) {
			if (elementData.element.type !== "captions") continue;
			captionStyle = elementData.element.style;
			for (const word of elementData.element.words ?? []) {
				captionWords.push({
					id: word.id,
					text: word.text,
					start: word.start,
					end: word.end,
					type: word.type,
					speaker_id: word.speakerId,
					filterState: WORD_FILTER_STATE.NONE,
				});
			}
		}
		return { captionStyle, captionWords };
	}, [activeElements]);

	const blurBackgroundElements = useMemo(() => {
		try {
			return activeElements.filter(({ element, mediaItem, preload }) => {
				if (preload || element.type !== "media" || !mediaItem) {
					return false;
				}

				const isSupportedMediaType =
					mediaItem.type === "video" || mediaItem.type === "image";
				return isSupportedMediaType && element.mediaId !== TEST_MEDIA_ID;
			});
		} catch {
			return [];
		}
	}, [activeElements]);

	const videoSourcesById = useMemo(() => {
		try {
			const sources = new Map<string, VideoSource>();

			for (const item of mediaItems) {
				if (item.type !== "video") {
					continue;
				}

				const source = getVideoSource(item);
				sources.set(item.id, source);
			}

			return sources;
		} catch {
			return new Map<string, VideoSource>();
		}
	}, [mediaItems]);

	const activeVideoSource = useMemo(() => {
		try {
			const mediaId = currentMediaElement?.mediaItem?.id;
			if (!mediaId) {
				return null;
			}
			return videoSourcesById.get(mediaId) ?? null;
		} catch {
			return null;
		}
	}, [currentMediaElement, videoSourcesById]);

	const blurBackgroundSource = useMemo(() => {
		try {
			if (activeProject?.backgroundType !== "blur") {
				return null;
			}

			if (blurBackgroundElements.length === 0) {
				return null;
			}

			const firstBackgroundElement = blurBackgroundElements[0];
			const mediaItem = firstBackgroundElement.mediaItem;
			if (!mediaItem || mediaItem.type !== "video") {
				return null;
			}

			return videoSourcesById.get(mediaItem.id) ?? null;
		} catch {
			return null;
		}
	}, [activeProject?.backgroundType, blurBackgroundElements, videoSourcesById]);

	return {
		captionSegments,
		captionStyle: captionPresentation.captionStyle,
		captionWords: captionPresentation.captionWords,
		blurBackgroundElements,
		videoSourcesById,
		activeVideoSource,
		blurBackgroundSource,
		currentMediaElement,
	};
}
