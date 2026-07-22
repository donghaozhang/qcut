import type {
	ClipTransitionDirection,
	ClipTransitionMaskShape,
	ClipTransitionTuning,
	ClipTransitionType,
} from "@/types/timeline";
import {
	getTransitionPreviewAsset,
	type TransitionPreviewAsset,
} from "./transition-preview-assets";

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
	| "shake"
	| "motion-blur"
	| "pixel"
	| "ripple"
	| "particle"
	| "glass"
	| "page"
	| "texture"
	| "flare";

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
	delivery: "bundled" | "remote";
	preview: TransitionPreviewAsset;
	direction?: ClipTransitionDirection;
	clipType: ClipTransitionType;
	tuning?: ClipTransitionTuning;
	maskShape?: ClipTransitionMaskShape;
	premium?: boolean;
	downloaded?: boolean;
	popular?: boolean;
	latest?: boolean;
}

export interface ClipTransitionPresetConfig {
	type: ClipTransitionType;
	direction?: ClipTransitionDirection;
	tuning?: ClipTransitionTuning;
	maskShape?: ClipTransitionMaskShape;
}

type PresetInput = Omit<
	TransitionPreset,
	"version" | "downloaded" | "tags" | "description" | "delivery" | "preview"
> & {
	tags?: string[];
	description?: string;
	delivery?: TransitionPreset["delivery"];
	preview?: TransitionPreviewAsset;
};

export function defineTransitionPreset({
	tags = [],
	description,
	delivery = "bundled",
	preview,
	...preset
}: PresetInput): TransitionPreset {
	return {
		...preset,
		version: 1,
		delivery,
		preview: preview ?? getTransitionPreviewAsset({ presetId: preset.id }),
		downloaded: true,
		tags: [preset.category, preset.type, preset.localizedName, ...tags],
		description:
			description ??
			`${preset.localizedName}，浏览器预览与 FFmpeg 导出使用同一参数。`,
	};
}
