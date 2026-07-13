import {
	ApertureIcon,
	BlendIcon,
	CameraIcon,
	FlameIcon,
	FocusIcon,
	GalleryHorizontalIcon,
	HeartIcon,
	MoveIcon,
	PartyPopperIcon,
	ScanLineIcon,
	SmileIcon,
	SparklesIcon,
	StarIcon,
	SunIcon,
	WandSparklesIcon,
	WavesIcon,
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
	{ id: "dissolve", label: "叠化", icon: BlendIcon },
	{ id: "natural", label: "自然", icon: FocusIcon },
	{ id: "slideshow", label: "幻灯片", icon: GalleryHorizontalIcon },
	{ id: "split", label: "分割", icon: ScanLineIcon },
	{ id: "blur", label: "模糊", icon: ApertureIcon },
	{ id: "camera", label: "运镜", icon: MoveIcon },
	{ id: "shooting", label: "拍摄", icon: CameraIcon },
	{ id: "distortion", label: "扭曲", icon: WavesIcon },
	{ id: "light", label: "光效", icon: SunIcon },
	{ id: "glitch", label: "故障", icon: ZapIcon },
	{ id: "variety", label: "综艺", icon: PartyPopperIcon },
	{ id: "mg", label: "MG 动画", icon: WandSparklesIcon },
	{ id: "emoji", label: "互动 emoji", icon: SmileIcon },
];
