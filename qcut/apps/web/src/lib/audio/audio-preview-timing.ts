import type { MediaElement } from "@/types/timeline";
import {
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";

export interface AudioPreviewTiming {
	mediaTime: number;
	playbackRate: number;
	timelineDuration: number;
}

export function resolveAudioPreviewTiming({
	element,
	timelineTime,
	playbackSpeed,
	fps = 30,
}: {
	element: MediaElement;
	timelineTime: number;
	playbackSpeed: number;
	fps?: number;
}): AudioPreviewTiming {
	const localTimelineTime = timelineTime - element.startTime;
	const timing = mapMediaTimelineTime({ element, localTimelineTime, fps });
	const sourceTime = element.trimStart + timing.sourceTime;
	const mediaTime = element.reverse
		? element.duration - sourceTime
		: sourceTime;
	return {
		mediaTime: Math.min(element.duration, Math.max(0, mediaTime)),
		playbackRate: Math.min(
			16,
			Math.max(0.0625, playbackSpeed * Math.max(0.0625, timing.playbackRate))
		),
		timelineDuration: getMediaTimelineDuration(element, fps),
	};
}
