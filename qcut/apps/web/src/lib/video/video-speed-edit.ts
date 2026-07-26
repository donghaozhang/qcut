import type { MediaElement } from "@/types/timeline";
import {
	clampPlaybackRate,
	getMediaSourceDuration,
	getMediaTimelineDuration,
	mapMediaSourceTime,
	mapMediaTimelineTime,
	resolveSpeedAtSourceTime,
} from "./video-timing";
import {
	cropMediaSpeedKeyframes,
	extendSpeedKeyframes,
} from "./video-speed-keyframes";

export { cropMediaSpeedKeyframes } from "./video-speed-keyframes";

const TIME_EPSILON = 1e-7;

export type MediaTimingUpdates = Partial<
	Pick<
		MediaElement,
		| "trimStart"
		| "trimEnd"
		| "speedKeyframes"
		| "freezeFrameTime"
		| "freezeFrameDuration"
	>
>;

export interface MediaTimingSplit {
	left: MediaTimingUpdates;
	right: MediaTimingUpdates;
}

export interface MediaTimingResize {
	updates: MediaTimingUpdates;
	startTimeDelta: number;
}

function getFreezeTimelineStart({
	element,
	sourceDuration,
	freezeSourceTime,
	fps,
}: {
	element: MediaElement;
	sourceDuration: number;
	freezeSourceTime: number;
	fps: number;
}): number {
	const visibleSourceTime = element.reverse
		? sourceDuration - freezeSourceTime
		: freezeSourceTime;
	return mapMediaSourceTime({
		element: { ...element, freezeFrameDuration: 0 },
		sourceTime: element.trimStart + visibleSourceTime,
		fps,
	});
}

function cropFreezeWindow({
	element,
	startSourceTime,
	endSourceTime,
	startTimelineTime,
	endTimelineTime,
	fps,
}: {
	element: MediaElement;
	startSourceTime: number;
	endSourceTime: number;
	startTimelineTime: number;
	endTimelineTime: number;
	fps: number;
}): Pick<MediaTimingUpdates, "freezeFrameTime" | "freezeFrameDuration"> {
	const freezeDuration = Math.max(0, element.freezeFrameDuration ?? 0);
	if (freezeDuration <= TIME_EPSILON) {
		return {
			freezeFrameTime: undefined,
			freezeFrameDuration: undefined,
		};
	}

	const sourceDuration = getMediaSourceDuration(element);
	const freezeSourceTime = Math.min(
		sourceDuration,
		Math.max(0, element.freezeFrameTime ?? sourceDuration)
	);
	const freezeTimelineStart = getFreezeTimelineStart({
		element,
		sourceDuration,
		freezeSourceTime,
		fps,
	});
	const overlapStart = Math.max(startTimelineTime, freezeTimelineStart);
	const overlapEnd = Math.min(
		endTimelineTime,
		freezeTimelineStart + freezeDuration
	);
	const croppedFreezeDuration = Math.max(0, overlapEnd - overlapStart);
	const includesFreezeSource =
		freezeSourceTime >= startSourceTime - TIME_EPSILON &&
		freezeSourceTime <= endSourceTime + TIME_EPSILON;

	if (croppedFreezeDuration <= TIME_EPSILON || !includesFreezeSource) {
		return {
			freezeFrameTime: undefined,
			freezeFrameDuration: undefined,
		};
	}

	return {
		freezeFrameTime: Math.min(
			endSourceTime - startSourceTime,
			Math.max(0, freezeSourceTime - startSourceTime)
		),
		freezeFrameDuration: croppedFreezeDuration,
	};
}

export function cropMediaTiming({
	element,
	startSourceTime,
	endSourceTime,
	startTimelineTime,
	endTimelineTime,
	fps = 30,
}: {
	element: MediaElement;
	startSourceTime: number;
	endSourceTime: number;
	startTimelineTime: number;
	endTimelineTime: number;
	fps?: number;
}): MediaTimingUpdates {
	const sourceDuration = getMediaSourceDuration(element);
	const clampedStartSourceTime = Math.min(
		sourceDuration,
		Math.max(0, startSourceTime)
	);
	const clampedEndSourceTime = Math.min(
		sourceDuration,
		Math.max(clampedStartSourceTime, endSourceTime)
	);
	const removedFromStart = clampedStartSourceTime;
	const removedFromEnd = sourceDuration - clampedEndSourceTime;
	const trims = element.reverse
		? {
				trimStart: element.trimStart + removedFromEnd,
				trimEnd: element.trimEnd + removedFromStart,
			}
		: {
				trimStart: element.trimStart + removedFromStart,
				trimEnd: element.trimEnd + removedFromEnd,
			};

	return {
		...trims,
		speedKeyframes: cropMediaSpeedKeyframes({
			keyframes: element.speedKeyframes,
			startSourceTime: clampedStartSourceTime,
			endSourceTime: clampedEndSourceTime,
			fps,
		}),
		...cropFreezeWindow({
			element,
			startSourceTime: clampedStartSourceTime,
			endSourceTime: clampedEndSourceTime,
			startTimelineTime,
			endTimelineTime,
			fps,
		}),
	};
}

export function splitMediaTiming({
	element,
	localTimelineTime,
	fps = 30,
}: {
	element: MediaElement;
	localTimelineTime: number;
	fps?: number;
}): MediaTimingSplit {
	const timelineDuration = getMediaTimelineDuration(element, fps);
	const clampedTimelineTime = Math.min(
		timelineDuration,
		Math.max(0, localTimelineTime)
	);
	const sourceDuration = getMediaSourceDuration(element);
	const playbackTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: clampedTimelineTime,
		fps,
	});
	const splitSourceTime = Math.min(
		sourceDuration,
		Math.max(
			0,
			element.reverse
				? sourceDuration - playbackTiming.sourceTime
				: playbackTiming.sourceTime
		)
	);

	return {
		left: cropMediaTiming({
			element,
			startSourceTime: 0,
			endSourceTime: splitSourceTime,
			startTimelineTime: 0,
			endTimelineTime: clampedTimelineTime,
			fps,
		}),
		right: cropMediaTiming({
			element,
			startSourceTime: splitSourceTime,
			endSourceTime: sourceDuration,
			startTimelineTime: clampedTimelineTime,
			endTimelineTime: timelineDuration,
			fps,
		}),
	};
}

function extendMediaTiming({
	element,
	side,
	requestedTimelineExtension,
	fps,
}: {
	element: MediaElement;
	side: "left" | "right";
	requestedTimelineExtension: number;
	fps: number;
}): MediaTimingResize {
	const sourceDuration = getMediaSourceDuration(element);
	const boundarySourceTime = side === "left" ? 0 : sourceDuration;
	const boundaryRate =
		(element.speedKeyframes?.length ?? 0) > 0
			? resolveSpeedAtSourceTime({
					baseRate: element.playbackRate ?? 1,
					keyframes: element.speedKeyframes,
					sourceTime: boundarySourceTime,
					fps,
				})
			: clampPlaybackRate(element.playbackRate);
	const availableSource =
		side === "left"
			? element.reverse
				? element.trimEnd
				: element.trimStart
			: element.reverse
				? element.trimStart
				: element.trimEnd;
	const sourceExtension = Math.min(
		availableSource,
		Math.max(0, requestedTimelineExtension) * boundaryRate
	);
	const timelineExtension = sourceExtension / boundaryRate;
	const trimStart =
		side === "left"
			? element.reverse
				? element.trimStart
				: element.trimStart - sourceExtension
			: element.reverse
				? element.trimStart - sourceExtension
				: element.trimStart;
	const trimEnd =
		side === "left"
			? element.reverse
				? element.trimEnd - sourceExtension
				: element.trimEnd
			: element.reverse
				? element.trimEnd
				: element.trimEnd - sourceExtension;
	const freezeFrameTime =
		element.freezeFrameTime === undefined
			? undefined
			: side === "left"
				? element.freezeFrameTime + sourceExtension
				: element.freezeFrameTime;

	return {
		updates: {
			trimStart,
			trimEnd,
			speedKeyframes: extendSpeedKeyframes({
				element,
				side,
				sourceExtension,
				fps,
			}),
			freezeFrameTime,
			freezeFrameDuration: element.freezeFrameDuration,
		},
		startTimeDelta: side === "left" ? -timelineExtension : 0,
	};
}

export function resizeMediaTiming({
	element,
	side,
	timelineDelta,
	minTimelineDuration = 0.1,
	fps = 30,
}: {
	element: MediaElement;
	side: "left" | "right";
	timelineDelta: number;
	minTimelineDuration?: number;
	fps?: number;
}): MediaTimingResize {
	const timelineDuration = getMediaTimelineDuration(element, fps);
	const sourceDuration = getMediaSourceDuration(element);

	if (side === "left" && timelineDelta < 0) {
		return extendMediaTiming({
			element,
			side,
			requestedTimelineExtension: -timelineDelta,
			fps,
		});
	}
	if (side === "right" && timelineDelta > 0) {
		return extendMediaTiming({
			element,
			side,
			requestedTimelineExtension: timelineDelta,
			fps,
		});
	}

	const nextTimelineStart =
		side === "left"
			? Math.min(
					Math.max(0, timelineDelta),
					Math.max(0, timelineDuration - minTimelineDuration)
				)
			: 0;
	const nextTimelineEnd =
		side === "right"
			? Math.max(
					Math.min(timelineDuration, timelineDuration + timelineDelta),
					Math.min(timelineDuration, minTimelineDuration)
				)
			: timelineDuration;
	const startTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: nextTimelineStart,
		fps,
	});
	const endTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: nextTimelineEnd,
		fps,
	});
	const toPlaybackSourceTime = (sourceTime: number) =>
		element.reverse ? sourceDuration - sourceTime : sourceTime;
	const startSourceTime = toPlaybackSourceTime(startTiming.sourceTime);
	const endSourceTime = toPlaybackSourceTime(endTiming.sourceTime);

	return {
		updates: cropMediaTiming({
			element,
			startSourceTime: Math.min(startSourceTime, endSourceTime),
			endSourceTime: Math.max(startSourceTime, endSourceTime),
			startTimelineTime: nextTimelineStart,
			endTimelineTime: nextTimelineEnd,
			fps,
		}),
		startTimeDelta: nextTimelineStart,
	};
}
