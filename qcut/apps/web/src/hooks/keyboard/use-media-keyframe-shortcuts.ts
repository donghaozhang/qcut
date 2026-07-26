import { useEffect } from "react";
import {
	easingForKeyframeCommand,
	KEYFRAME_VALUE_FOCUS_EVENT,
	MEDIA_KEYFRAME_COMMAND_EVENT,
	type KeyframeValueFocusDetail,
	type MediaKeyframeCommandDetail,
} from "@/lib/editor-shortcut-events";
import { generateUUID } from "@/lib/utils";
import {
	getMediaKeyframeValue,
	upsertMediaKeyframe,
} from "@/lib/video/video-properties";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	MediaElement,
	MediaKeyframeProperty,
	MediaPropertyKeyframe,
} from "@/types/timeline";

export function useMediaKeyframeShortcuts({
	currentTime,
	currentFrame,
	element,
	fps,
	keyframeProperty,
	onExpandKeyframes,
	onOpenBasic,
	trackId,
}: {
	currentTime: number;
	currentFrame: number;
	element: MediaElement;
	fps: number;
	keyframeProperty: MediaKeyframeProperty;
	onExpandKeyframes: () => void;
	onOpenBasic: () => void;
	trackId: string;
}) {
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);

	useEffect(() => {
		const handleCommand = (event: Event) => {
			const { command, elementId } = (
				event as CustomEvent<MediaKeyframeCommandDetail>
			).detail;
			if (elementId !== element.id) return;

			onOpenBasic();
			onExpandKeyframes();
			const keyframes = element.keyframes?.[keyframeProperty] ?? [];
			const existing = keyframes.find(
				(keyframe) => keyframe.frame === currentFrame
			);
			const keyframeId = existing?.id ?? generateUUID();
			const keyframe: MediaPropertyKeyframe = {
				id: keyframeId,
				frame: currentFrame,
				value: getMediaKeyframeValue({
					element,
					property: keyframeProperty,
					currentTime,
					fps,
				}),
				easing: easingForKeyframeCommand({
					command,
					fallback: existing?.easing ?? "linear",
				}),
			};
			updateMediaElement(trackId, element.id, {
				keyframes: {
					...element.keyframes,
					[keyframeProperty]: upsertMediaKeyframe({
						keyframes,
						keyframe,
					}),
				},
			});

			if (command !== "edit-value") return;
			requestAnimationFrame(() => {
				window.dispatchEvent(
					new CustomEvent<KeyframeValueFocusDetail>(
						KEYFRAME_VALUE_FOCUS_EVENT,
						{
							detail: {
								property: keyframeProperty,
								keyframeId,
							},
						}
					)
				);
			});
		};

		window.addEventListener(MEDIA_KEYFRAME_COMMAND_EVENT, handleCommand);
		return () =>
			window.removeEventListener(MEDIA_KEYFRAME_COMMAND_EVENT, handleCommand);
	}, [
		currentTime,
		currentFrame,
		element,
		fps,
		keyframeProperty,
		onExpandKeyframes,
		onOpenBasic,
		trackId,
		updateMediaElement,
	]);
}
