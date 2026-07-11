import type {
	ClipTransitionDirection,
	ClipTransitionType,
} from "@/types/timeline";

export type TransitionCategory =
	| "all"
	| "basic"
	| "fade"
	| "slide"
	| "wipe"
	| "zoom"
	| "glitch"
	| "light"
	| "popular"
	| "latest";

export type TransitionType =
	| "dissolve"
	| "fade"
	| "slide"
	| "wipe"
	| "zoom"
	| "glitch"
	| "light";

export interface TransitionPreset {
	id: string;
	name: string;
	category: Exclude<TransitionCategory, "all" | "popular" | "latest">;
	type: TransitionType;
	defaultDuration: number;
	tags: string[];
	description: string;
	direction?: "left" | "right" | "up" | "down";
	premium?: boolean;
	downloaded?: boolean;
	popular?: boolean;
	latest?: boolean;
}

export interface ClipTransitionPresetConfig {
	type: ClipTransitionType;
	direction?: ClipTransitionDirection;
}

export const transitionPresets: TransitionPreset[] = [
	{
		id: "dissolve",
		name: "Dissolve",
		category: "fade",
		type: "dissolve",
		defaultDuration: 0.5,
		tags: ["crossfade", "soft", "classic", "blend"],
		description: "A soft crossfade between adjacent clips.",
		downloaded: true,
		popular: true,
	},
	{
		id: "fade-to-black",
		name: "Fade to Black",
		category: "fade",
		type: "fade",
		defaultDuration: 0.6,
		tags: ["black", "cinematic", "pause", "scene"],
		description: "Fade the outgoing clip through black before the next clip.",
		downloaded: true,
		popular: true,
	},
	{
		id: "slide-left",
		name: "Slide Left",
		category: "slide",
		type: "slide",
		direction: "left",
		defaultDuration: 0.45,
		tags: ["push", "motion", "left", "horizontal"],
		description: "Push the next clip in from the left edge.",
		downloaded: true,
	},
	{
		id: "slide-right",
		name: "Slide Right",
		category: "slide",
		type: "slide",
		direction: "right",
		defaultDuration: 0.45,
		tags: ["push", "motion", "right", "horizontal"],
		description: "Push the next clip in from the right edge.",
		downloaded: true,
	},
	{
		id: "wipe-left",
		name: "Wipe Left",
		category: "wipe",
		type: "wipe",
		direction: "left",
		defaultDuration: 0.5,
		tags: ["reveal", "edge", "left", "clean"],
		description: "Reveal the incoming clip with a clean horizontal wipe.",
		downloaded: true,
	},
	{
		id: "wipe-right",
		name: "Wipe Right",
		category: "wipe",
		type: "wipe",
		direction: "right",
		defaultDuration: 0.5,
		tags: ["reveal", "edge", "right", "clean"],
		description: "Reveal the incoming clip from the right edge.",
		downloaded: true,
	},
	{
		id: "zoom-blur",
		name: "Zoom Blur",
		category: "zoom",
		type: "zoom",
		defaultDuration: 0.55,
		tags: ["punch", "blur", "speed", "impact"],
		description: "A fast zoom with blur for energetic cuts.",
		popular: true,
	},
	{
		id: "glitch-shift",
		name: "Glitch Shift",
		category: "glitch",
		type: "glitch",
		defaultDuration: 0.4,
		tags: ["rgb", "digital", "shake", "distort"],
		description: "A digital distortion pass for stylized edits.",
		premium: true,
		latest: true,
	},
	{
		id: "light-sweep",
		name: "Light Sweep",
		category: "light",
		type: "light",
		defaultDuration: 0.5,
		tags: ["flare", "flash", "bright", "sweep"],
		description: "Sweep a bright light band across the cut.",
		premium: true,
		latest: true,
	},
];

export function filterTransitionPresets({
	category,
	query,
}: {
	category: TransitionCategory;
	query: string;
}): TransitionPreset[] {
	const normalizedQuery = query.trim().toLowerCase();

	return transitionPresets.filter((preset) => {
		const matchesCategory =
			category === "all" ||
			preset.category === category ||
			(category === "basic" &&
				(preset.downloaded || preset.tags.includes("classic"))) ||
			(category === "popular" && preset.popular) ||
			(category === "latest" && preset.latest);

		if (!matchesCategory) return false;
		if (!normalizedQuery) return true;

		const searchable = [
			preset.name,
			preset.category,
			preset.type,
			preset.description,
			...preset.tags,
		]
			.join(" ")
			.toLowerCase();

		return searchable.includes(normalizedQuery);
	});
}

export function getClipTransitionPresetConfig({
	preset,
}: {
	preset: TransitionPreset;
}): ClipTransitionPresetConfig | null {
	if (!preset.downloaded) return null;

	switch (preset.id) {
		case "dissolve":
			return { type: "dissolve" };
		case "fade-to-black":
			return { type: "fade-black" };
		case "slide-left":
		case "slide-right":
			return { type: "slide", direction: preset.direction };
		case "wipe-left":
		case "wipe-right":
			return { type: "wipe", direction: preset.direction };
		default:
			return null;
	}
}

export function getTransitionPresetById({
	presetId,
}: {
	presetId: string;
}): TransitionPreset | undefined {
	return transitionPresets.find((preset) => preset.id === presetId);
}
