import {
	Aperture,
	Camera,
	CircleUserRound,
	Clapperboard,
	Coffee,
	Film,
	House,
	ImageIcon,
	Layers3,
	Mountain,
	MoonStar,
	Palette,
	ScanLine,
	Sparkles,
	Sun,
	Trees,
	WandSparkles,
	type LucideIcon,
} from "lucide-react";
import type { FilterCategory, FilterPreset } from "@/lib/filters/filter-types";

export type FilterCategoryId = "all" | "latest" | "mine" | FilterCategory;

export interface FilterCategoryOption {
	id: FilterCategoryId;
	label: string;
	localizedLabel: string;
	icon: LucideIcon;
}

export const FILTER_CATEGORIES: FilterCategoryOption[] = [
	{ id: "all", label: "All", localizedLabel: "全部", icon: Layers3 },
	{ id: "summer", label: "Summer", localizedLabel: "夏日", icon: Sun },
	{
		id: "portrait",
		label: "Portrait",
		localizedLabel: "人像",
		icon: CircleUserRound,
	},
	{
		id: "landscape",
		label: "Scenery",
		localizedLabel: "风景",
		icon: Mountain,
	},
	{ id: "food", label: "Food", localizedLabel: "美食", icon: Coffee },
	{
		id: "camera",
		label: "Camera",
		localizedLabel: "相机模拟",
		icon: Camera,
	},
	{
		id: "latest",
		label: "Latest",
		localizedLabel: "最新",
		icon: Sparkles,
	},
	{
		id: "night",
		label: "Night",
		localizedLabel: "夜景",
		icon: MoonStar,
	},
	{
		id: "cinematic",
		label: "Cinema",
		localizedLabel: "影视级",
		icon: Clapperboard,
	},
	{
		id: "outdoor",
		label: "Outdoor",
		localizedLabel: "户外",
		icon: Trees,
	},
	{
		id: "stylized",
		label: "Stylized",
		localizedLabel: "风格化",
		icon: Palette,
	},
	{
		id: "monochrome",
		label: "Monochrome",
		localizedLabel: "黑白",
		icon: ImageIcon,
	},
	{ id: "hd", label: "HD", localizedLabel: "高清", icon: ScanLine },
	{
		id: "film",
		label: "Vintage film",
		localizedLabel: "复古胶片",
		icon: Film,
	},
	{
		id: "basic",
		label: "Basic",
		localizedLabel: "基础",
		icon: WandSparkles,
	},
	{
		id: "indoor",
		label: "Indoor",
		localizedLabel: "室内",
		icon: House,
	},
	{
		id: "mine",
		label: "My filters",
		localizedLabel: "我的滤镜",
		icon: Aperture,
	},
];

export function filterPresetMatchesCategory({
	preset,
	category,
}: {
	preset: FilterPreset;
	category: FilterCategoryId;
}) {
	if (category === "all") return true;
	if (category === "latest") return preset.isNew === true;
	if (category === "mine") return false;
	return preset.category === category;
}
