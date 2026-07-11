import {
	ArrowLeftRightIcon,
	BadgePlusIcon,
	FlameIcon,
	LightbulbIcon,
	ScanLineIcon,
	SparklesIcon,
	StarIcon,
	WavesIcon,
	ZapIcon,
	ZoomInIcon,
	type LucideIcon,
} from "lucide-react";
import type { TransitionCategory } from "./transition-presets";

export interface TransitionCategoryItem {
	id: TransitionCategory;
	label: string;
	icon: LucideIcon;
}

export const transitionCategories: TransitionCategoryItem[] = [
	{ id: "all", label: "All", icon: SparklesIcon },
	{ id: "basic", label: "Basic", icon: ArrowLeftRightIcon },
	{ id: "fade", label: "Fade", icon: WavesIcon },
	{ id: "slide", label: "Slide", icon: BadgePlusIcon },
	{ id: "wipe", label: "Wipe", icon: ScanLineIcon },
	{ id: "zoom", label: "Zoom", icon: ZoomInIcon },
	{ id: "glitch", label: "Glitch", icon: ZapIcon },
	{ id: "light", label: "Light", icon: LightbulbIcon },
	{ id: "popular", label: "Popular", icon: FlameIcon },
	{ id: "latest", label: "Latest", icon: StarIcon },
];
