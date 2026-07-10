import type { TextElement, TimelineTrack } from "@/types/timeline";
import { resolveMediaKeyframes } from "@/lib/video/video-properties";

export function resolveTrackedTextElement({
	element,
	tracks,
	currentTime,
	fps,
}: {
	element: TextElement;
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
}): TextElement {
	if (!element.trackingTargetId) return element;
	const target = tracks
		.flatMap((track) => track.elements)
		.find(
			(candidate) =>
				candidate.id === element.trackingTargetId && candidate.type === "media"
		);
	if (!target || target.type !== "media") return element;
	const tracked = resolveMediaKeyframes({ element: target, currentTime, fps });
	return {
		...element,
		x: element.x + tracked.x + (element.trackingOffsetX ?? 0),
		y: element.y + tracked.y + (element.trackingOffsetY ?? 0),
		rotation:
			element.rotation + (element.trackingRotation ? tracked.rotation : 0),
	};
}
