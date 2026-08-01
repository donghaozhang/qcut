import type {
	ClipTransitionDirection,
	ClipTransitionEasing,
	ClipTransitionMaskShape,
	ClipTransitionTuning,
	ClipTransitionType,
} from "@/types/timeline";
import {
	defineTransitionPreset,
	type TransitionContentCategory,
	type TransitionPreset,
	type TransitionType,
} from "../transition-preset-types";

interface ExpandedPresetOptions {
	easing?: ClipTransitionEasing;
	direction?: ClipTransitionDirection;
	tuning?: ClipTransitionTuning;
	maskShape?: ClipTransitionMaskShape;
	tags?: string[];
	popular?: boolean;
	latest?: boolean;
}

type ExpandedPresetRow = readonly [
	id: string,
	name: string,
	localizedName: string,
	type: TransitionType,
	clipType: ClipTransitionType,
	defaultDuration: number,
	options?: ExpandedPresetOptions,
];

export function categoryExpansion({
	category,
	rows,
}: {
	category: TransitionContentCategory;
	rows: ExpandedPresetRow[];
}): TransitionPreset[] {
	const presets: TransitionPreset[] = [];

	for (const row of rows) {
		const [id, name, localizedName, type, clipType, defaultDuration, options] =
			row;
		presets.push(
			defineTransitionPreset({
				id,
				name,
				localizedName,
				category,
				type,
				clipType,
				defaultDuration,
				easing: options?.easing,
				direction: options?.direction,
				tuning: options?.tuning,
				maskShape: options?.maskShape,
				tags: options?.tags,
				popular: options?.popular,
				latest: options?.latest,
			})
		);
	}

	return presets;
}
