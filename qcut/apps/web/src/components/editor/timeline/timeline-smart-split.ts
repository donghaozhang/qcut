import { mapMediaSourceTime } from "@/lib/video/video-timing";
import type { MediaElement } from "@/types/timeline";

export interface TimelineSceneBoundary {
	timestamp: number;
	confidence: number;
}

export function sceneTimelineSplitTimes({
	element,
	scenes,
	fps,
}: {
	element: MediaElement;
	scenes: TimelineSceneBoundary[];
	fps: number;
}): number[] {
	const frameDuration = 1 / Math.max(1, fps);
	const sourceStart = element.trimStart;
	const sourceEnd = element.duration - element.trimEnd;
	const splitTimes = scenes
		.map((scene) => scene.timestamp)
		.filter(
			(timestamp) =>
				Number.isFinite(timestamp) &&
				timestamp > sourceStart + frameDuration &&
				timestamp < sourceEnd - frameDuration
		)
		.map(
			(timestamp) =>
				element.startTime +
				mapMediaSourceTime({ element, sourceTime: timestamp, fps })
		)
		.sort((left, right) => left - right);

	const uniqueTimes: number[] = [];
	for (const splitTime of splitTimes) {
		const previous = uniqueTimes[uniqueTimes.length - 1];
		if (previous === undefined || splitTime - previous >= frameDuration) {
			uniqueTimes.push(splitTime);
		}
	}
	return uniqueTimes;
}

export function applyTimelineSceneSplits({
	trackId,
	elementId,
	splitTimes,
	pushHistory,
	splitElement,
}: {
	trackId: string;
	elementId: string;
	splitTimes: number[];
	pushHistory: () => void;
	splitElement: (
		trackId: string,
		elementId: string,
		splitTime: number,
		pushHistory: boolean
	) => string | null;
}): string[] {
	if (splitTimes.length === 0) return [];
	pushHistory();
	const createdElementIds: string[] = [];
	let rightElementId = elementId;
	for (const splitTime of splitTimes) {
		const createdElementId = splitElement(
			trackId,
			rightElementId,
			splitTime,
			false
		);
		if (!createdElementId) continue;
		createdElementIds.push(createdElementId);
		rightElementId = createdElementId;
	}
	return createdElementIds;
}
