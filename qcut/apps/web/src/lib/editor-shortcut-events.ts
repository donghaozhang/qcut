import type { EasingType } from "@/lib/remotion/keyframe-converter";

export const TIMELINE_ZOOM_EVENT = "qcut:timeline-zoom";
export const MEDIA_KEYFRAME_COMMAND_EVENT = "qcut:media-keyframe-command";
export const KEYFRAME_VALUE_FOCUS_EVENT = "qcut:keyframe-value-focus";

export type TimelineZoomDirection = "in" | "out";
export type MediaKeyframeCommand =
	| "add"
	| "ease-in"
	| "ease-out"
	| "linear"
	| "edit-value";

export interface MediaKeyframeCommandDetail {
	elementId: string;
	command: MediaKeyframeCommand;
}

export interface KeyframeValueFocusDetail {
	property: string;
	keyframeId: string;
}

export function easingForKeyframeCommand({
	command,
	fallback,
}: {
	command: MediaKeyframeCommand;
	fallback: EasingType;
}): EasingType {
	const easingByCommand: Partial<Record<MediaKeyframeCommand, EasingType>> = {
		"ease-in": "easeIn",
		"ease-out": "easeOut",
		linear: "linear",
	};
	return easingByCommand[command] ?? fallback;
}

export function dispatchTimelineZoom({
	direction,
}: {
	direction: TimelineZoomDirection;
}) {
	window.dispatchEvent(
		new CustomEvent<TimelineZoomDirection>(TIMELINE_ZOOM_EVENT, {
			detail: direction,
		})
	);
}

export function dispatchMediaKeyframeCommand(
	detail: MediaKeyframeCommandDetail
) {
	window.dispatchEvent(
		new CustomEvent<MediaKeyframeCommandDetail>(MEDIA_KEYFRAME_COMMAND_EVENT, {
			detail,
		})
	);
}
