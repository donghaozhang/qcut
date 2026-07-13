import type {
	ClipTransitionDirection,
	ClipTransitionTuning,
	ClipTransitionType,
} from "@/types/timeline";

export const TRANSITION_CONTENT_CATEGORIES = [
	"dissolve",
	"natural",
	"slideshow",
	"split",
	"blur",
	"camera",
	"shooting",
	"distortion",
	"light",
	"glitch",
	"variety",
	"mg",
	"emoji",
] as const;

export type TransitionContentCategory =
	(typeof TRANSITION_CONTENT_CATEGORIES)[number];

export type TransitionCategory =
	| "all"
	| "favorites"
	| "popular"
	| "latest"
	| TransitionContentCategory;

export type TransitionType =
	| "dissolve"
	| "fade"
	| "slide"
	| "wipe"
	| "push"
	| "zoom"
	| "whip"
	| "flash"
	| "light"
	| "glitch"
	| "shake";

export interface TransitionPreset {
	id: string;
	name: string;
	localizedName: string;
	category: TransitionContentCategory;
	type: TransitionType;
	defaultDuration: number;
	tags: string[];
	description: string;
	version: number;
	direction?: ClipTransitionDirection;
	clipType: ClipTransitionType;
	tuning?: ClipTransitionTuning;
	premium?: boolean;
	downloaded?: boolean;
	popular?: boolean;
	latest?: boolean;
}

export interface ClipTransitionPresetConfig {
	type: ClipTransitionType;
	direction?: ClipTransitionDirection;
	tuning?: ClipTransitionTuning;
}

type PresetInput = Omit<
	TransitionPreset,
	"version" | "downloaded" | "tags" | "description"
> & {
	tags?: string[];
	description?: string;
};

export function defineTransitionPreset({
	tags = [],
	description,
	...preset
}: PresetInput): TransitionPreset {
	return {
		...preset,
		version: 1,
		downloaded: true,
		tags: [preset.category, preset.type, preset.localizedName, ...tags],
		description:
			description ??
			`${preset.localizedName}，浏览器预览与 FFmpeg 导出使用同一参数。`,
	};
}
