import type {
	AlphaVideoLayout,
	AlphaVideoProgressKeyframe,
	AlphaVideoRuntimeDescriptor,
	StickerRuntimeCompletion,
	StickerRuntimeRepeat,
} from "./runtime-model.js";
import { assertAlphaVideoRuntimeDescriptor } from "./runtime-validation.js";

export function createAlphaVideoRuntimeDescriptor({
	source,
	sourceDurationSeconds,
	cycleDurationSeconds = sourceDurationSeconds,
	layout,
	progressKeyframes = [
		{ atSeconds: 0, sourceProgress: 0, interpolation: "linear" },
		{
			atSeconds: cycleDurationSeconds,
			sourceProgress: 1,
			interpolation: "hold",
		},
	],
	repeat = { kind: "finite", additionalIterations: 0 },
	completion = "freeze-last",
}: {
	source: string;
	sourceDurationSeconds: number;
	cycleDurationSeconds?: number;
	layout: AlphaVideoLayout;
	progressKeyframes?: readonly AlphaVideoProgressKeyframe[];
	repeat?: StickerRuntimeRepeat;
	completion?: StickerRuntimeCompletion;
}): AlphaVideoRuntimeDescriptor {
	const descriptor: AlphaVideoRuntimeDescriptor = {
		kind: "alpha-video",
		source,
		sourceDurationSeconds,
		cycleDurationSeconds,
		layout,
		progressKeyframes,
		repeat,
		completion,
	};
	assertAlphaVideoRuntimeDescriptor({ descriptor });
	return {
		...descriptor,
		progressKeyframes: progressKeyframes.map((keyframe) => ({ ...keyframe })),
	};
}
