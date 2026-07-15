import type {
	ClipTransitionDirection,
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
	direction?: ClipTransitionDirection;
	tuning?: ClipTransitionTuning;
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
				direction: options?.direction,
				tuning: options?.tuning,
				tags: options?.tags,
				popular: options?.popular,
				latest: options?.latest,
			})
		);
	}

	return presets;
}
