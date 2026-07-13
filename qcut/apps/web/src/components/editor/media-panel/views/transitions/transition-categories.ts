import {
	ApertureIcon,
	FlameIcon,
	FocusIcon,
	HeartIcon,
	MoveIcon,
	ScanLineIcon,
	SparklesIcon,
	StarIcon,
	SunIcon,
	WandSparklesIcon,
	ZapIcon,
	type LucideIcon,
} from "lucide-react";
import type { TransitionCategory } from "./transition-presets";

export interface TransitionCategoryItem {
	id: TransitionCategory;
	label: string;
	icon: LucideIcon;
}

export const transitionCategories: TransitionCategoryItem[] = [
	{ id: "all", label: "全部", icon: SparklesIcon },
	{ id: "favorites", label: "收藏", icon: HeartIcon },
	{ id: "popular", label: "热门", icon: FlameIcon },
	{ id: "latest", label: "最新", icon: StarIcon },
	{ id: "natural", label: "自然", icon: FocusIcon },
	{ id: "split", label: "分割", icon: ScanLineIcon },
	{ id: "blur", label: "模糊", icon: ApertureIcon },
	{ id: "camera", label: "运镜", icon: MoveIcon },
	{ id: "light", label: "光效", icon: SunIcon },
	{ id: "glitch", label: "故障", icon: ZapIcon },
	{ id: "mg", label: "MG 动画", icon: WandSparklesIcon },
];
