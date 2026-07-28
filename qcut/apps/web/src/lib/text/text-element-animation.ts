import type { TextElement, TimelineTrack } from "@/types/timeline";
import { resolveTextKeyframes } from "./text-keyframes";
import { resolveTrackedTextElement } from "./text-tracking";

export function resolveAnimatedTextElement({
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
	const keyframedElement = resolveTextKeyframes(element, currentTime, fps);
	return resolveTrackedTextElement({
		element: keyframedElement,
		tracks,
		currentTime,
		fps,
	});
}
