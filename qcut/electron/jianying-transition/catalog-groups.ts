import type { JianyingTransitionGroup } from "./catalog-types.js";

export const JIANYING_TRANSITION_GROUPS = [
	{ id: "all", label: "全部" },
	{ id: "ai-one-take", label: "AI 一镜到底" },
	{ id: "dissolve", label: "叠化" },
	{ id: "split", label: "分割" },
	{ id: "glitch", label: "故障" },
	{ id: "light", label: "光效" },
	{ id: "emoji", label: "互动 emoji" },
	{ id: "slideshow", label: "幻灯片" },
	{ id: "blur", label: "模糊" },
	{ id: "distortion", label: "扭曲" },
	{ id: "shooting", label: "拍摄" },
	{ id: "camera", label: "运镜" },
	{ id: "natural", label: "自然" },
	{ id: "variety", label: "综艺" },
	{ id: "mg", label: "MG 动画" },
] as const satisfies ReadonlyArray<{
	id: "all" | JianyingTransitionGroup;
	label: string;
}>;
