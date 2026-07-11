import {
	CircleUserRound,
	Clapperboard,
	Coffee,
	Film,
	ImageIcon,
	Layers3,
	Mountain,
	Sun,
	WandSparkles,
	type LucideIcon,
} from "lucide-react";
import type { FilterCategory } from "@/lib/filters/filter-types";

export type FilterCategoryId = "all" | "mine" | FilterCategory;

export interface FilterCategoryOption {
	id: FilterCategoryId;
	label: string;
	icon: LucideIcon;
}

export const FILTER_CATEGORIES: FilterCategoryOption[] = [
	{ id: "all", label: "All", icon: Layers3 },
	{ id: "basic", label: "Basic", icon: WandSparkles },
	{ id: "summer", label: "Summer", icon: Sun },
	{ id: "landscape", label: "Scenery", icon: Mountain },
	{ id: "food", label: "Food", icon: Coffee },
	{ id: "cinematic", label: "Cinema", icon: Clapperboard },
	{ id: "film", label: "Film", icon: Film },
	{ id: "monochrome", label: "B&W", icon: ImageIcon },
	{ id: "portrait", label: "Portrait", icon: CircleUserRound },
	{ id: "mine", label: "My filters", icon: Layers3 },
];
