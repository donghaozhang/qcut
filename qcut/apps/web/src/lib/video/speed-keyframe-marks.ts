import { getMediaTimelineDuration, mapMediaSourceTime } from "./video-timing";
import type { MediaElement } from "@/types/timeline";

export interface SpeedKeyframeMark {
	id: string;
	/** Position along the clip, 0 at its left edge and 1 at its right edge. */
	ratio: number;
	value: number;
}

/**
 * Places speed keyframes along a timeline clip.
 *
 * Keyframe frames live in visible-source space (frame 0 is `trimStart`), so each
 * one is mapped through the timing profile — a 4x point sits much closer to the
 * clip start than its source position suggests.
 */
export function resolveSpeedKeyframeMarks({
	element,
	fps = 30,
}: {
	element: MediaElement;
	fps?: number;
}): SpeedKeyframeMark[] {
	const keyframes = element.speedKeyframes ?? [];
	if (keyframes.length === 0) return [];
	const timelineDuration = getMediaTimelineDuration(element, fps);
	if (timelineDuration <= 0) return [];
	return [...keyframes]
		.sort((left, right) => left.frame - right.frame)
		.map((keyframe) => {
			const localTimelineTime = mapMediaSourceTime({
				element,
				sourceTime: element.trimStart + keyframe.frame / fps,
				fps,
			});
			return {
				id: keyframe.id,
				ratio: Math.min(1, Math.max(0, localTimelineTime / timelineDuration)),
				value: keyframe.value,
			};
		});
}
