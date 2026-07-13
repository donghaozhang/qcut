import type {
	MediaCrop,
	MediaElement,
	MediaKeyframeProperty,
} from "@/types/timeline";
import { upsertMediaKeyframe } from "@/lib/video/video-properties";

export type MediaCanvasMutation = Partial<
	Pick<MediaElement, "x" | "y" | "scaleX" | "scaleY" | "rotation" | "crop">
>;

type MediaCanvasUpdate = Partial<
	Pick<
		MediaElement,
		"x" | "y" | "scaleX" | "scaleY" | "rotation" | "crop" | "keyframes"
	>
>;

const CROP_PROPERTIES: Record<keyof MediaCrop, MediaKeyframeProperty> = {
	top: "cropTop",
	right: "cropRight",
	bottom: "cropBottom",
	left: "cropLeft",
};

function keyframeValues({
	mutation,
}: {
	mutation: MediaCanvasMutation;
}): Partial<Record<MediaKeyframeProperty, number>> {
	const values: Partial<Record<MediaKeyframeProperty, number>> = {};
	for (const property of ["x", "y", "scaleX", "scaleY", "rotation"] as const) {
		const value = mutation[property];
		if (value !== undefined) values[property] = value;
	}
	if (mutation.crop) {
		for (const side of Object.keys(CROP_PROPERTIES) as Array<keyof MediaCrop>) {
			values[CROP_PROPERTIES[side]] = mutation.crop[side];
		}
	}
	return values;
}

export function buildMediaCanvasUpdate({
	element,
	mutation,
	currentTime,
	fps,
}: {
	element: MediaElement;
	mutation: MediaCanvasMutation;
	currentTime: number;
	fps: number;
}): MediaCanvasUpdate {
	const values = keyframeValues({ mutation });
	const frame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	let nextKeyframes = element.keyframes;
	let changedKeyframes = false;

	for (const [property, value] of Object.entries(values) as Array<
		[MediaKeyframeProperty, number]
	>) {
		const existingKeyframes = element.keyframes?.[property];
		if (!existingKeyframes?.length) continue;
		const existing = existingKeyframes.find(
			(keyframe) => keyframe.frame === frame
		);
		nextKeyframes = {
			...nextKeyframes,
			[property]: upsertMediaKeyframe({
				keyframes: existingKeyframes,
				keyframe: {
					id:
						existing?.id ?? `canvas-${element.id}-${property}-${String(frame)}`,
					frame,
					value,
					easing: existing?.easing ?? "linear",
				},
			}),
		};
		changedKeyframes = true;
	}

	return changedKeyframes
		? { ...mutation, keyframes: nextKeyframes }
		: mutation;
}
