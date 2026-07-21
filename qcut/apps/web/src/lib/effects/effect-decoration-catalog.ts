import type { EffectDecorationVariant } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";

function createDecorationCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	variant,
	color,
	opacity,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	category: VisualEffectCategoryId;
	icon: string;
	variant: EffectDecorationVariant;
	color: string;
	opacity: number;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "basic",
		icon,
		parameters: {},
		renderProgram: {
			version: 1,
			stages: [{ kind: "decoration", variant, color, opacity }],
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category,
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "overlay",
			previewBackend: "canvas",
			// The export pipeline bakes the same canvas frames to a transparent PNG
			// sequence (one frame for static grids) and composites them in the
			// native FFmpeg pass (effect-procedural-sources).
			exportBackend: "frame-renderer",
			parity: "verified",
		},
	};
}

export const DECORATION_EFFECT_CATALOG = [
	createDecorationCatalogEntry({
		id: "basic-grid",
		name: "Grid Overlay",
		localizedName: "上下网格",
		description: "A clean reference grid over the frame.",
		localizedDescription: "在画面上叠加整齐的参考网格。",
		category: "basic",
		icon: "GR",
		variant: "grid",
		color: "#ffffff",
		opacity: 0.35,
		tags: ["grid", "lines", "basic"],
		releasedAt: "2026-07-20T05:00:00.000Z",
		popularityScore: 78,
	}),
	createDecorationCatalogEntry({
		id: "basic-film-end",
		name: "The End",
		localizedName: "全剧终",
		description: "Cinematic letterbox with a fading 全剧终 title.",
		localizedDescription: "电影黑边配合渐显的“全剧终”字样。",
		category: "basic",
		icon: "TE",
		variant: "film-end",
		color: "#ffffff",
		opacity: 1,
		tags: ["end", "film", "title", "basic"],
		releasedAt: "2026-07-20T05:01:00.000Z",
		popularityScore: 82,
	}),
	createDecorationCatalogEntry({
		id: "atmosphere-rainbow-rays",
		name: "Rainbow Rays",
		localizedName: "彩虹射线",
		description: "Slowly rotating rainbow light rays.",
		localizedDescription: "缓慢旋转的彩虹光射线。",
		category: "atmosphere",
		icon: "RR",
		variant: "rainbow-rays",
		color: "#ffffff",
		opacity: 0.5,
		tags: ["rainbow", "rays", "light", "atmosphere"],
		releasedAt: "2026-07-20T05:02:00.000Z",
		popularityScore: 85,
	}),
	createDecorationCatalogEntry({
		id: "basic-iris",
		name: "Iris Open",
		localizedName: "开幕",
		description: "A circular iris that opens to reveal the frame.",
		localizedDescription: "圆形开幕遮罩,展开露出画面。",
		category: "basic",
		icon: "IR",
		variant: "iris",
		color: "#000000",
		opacity: 1,
		tags: ["iris", "open", "reveal", "basic"],
		releasedAt: "2026-07-20T05:03:00.000Z",
		popularityScore: 82,
	}),
	createDecorationCatalogEntry({
		id: "basic-standby",
		name: "Standby",
		localizedName: "悬浮待机",
		description: "Camera viewfinder brackets, REC dot, and a scanline.",
		localizedDescription: "取景框边角、录制指示与扫描线的待机界面。",
		category: "basic",
		icon: "SB",
		variant: "standby",
		color: "#ffffff",
		opacity: 0.9,
		tags: ["standby", "viewfinder", "record", "basic"],
		releasedAt: "2026-07-20T05:04:00.000Z",
		popularityScore: 79,
	}),
	createDecorationCatalogEntry({
		id: "dynamic-burst",
		name: "Ray Burst",
		localizedName: "射线爆闪",
		description: "Bright radial rays that flash from the center.",
		localizedDescription: "从中心爆发闪烁的放射状射线。",
		category: "dynamic",
		icon: "RB",
		variant: "burst",
		color: "#ffffff",
		opacity: 0.7,
		tags: ["burst", "rays", "flash", "dynamic"],
		releasedAt: "2026-07-20T05:05:00.000Z",
		popularityScore: 84,
	}),
	createDecorationCatalogEntry({
		id: "light-lens-flare",
		name: "Lens Flare",
		localizedName: "超大光斑",
		description: "A bright lens flare with drifting light circles.",
		localizedDescription: "明亮的镜头光斑与飘移光圈。",
		category: "light",
		icon: "LF",
		variant: "lens-flare",
		color: "#fff4d6",
		opacity: 0.8,
		tags: ["flare", "light", "glow", "light"],
		releasedAt: "2026-07-20T05:06:00.000Z",
		popularityScore: 87,
	}),
	createDecorationCatalogEntry({
		id: "atmosphere-floating-text",
		name: "Floating Glyphs",
		localizedName: "文字悬浮",
		description: "Drifting sparkle glyphs floating across the frame.",
		localizedDescription: "在画面中飘浮的闪耀符号。",
		category: "atmosphere",
		icon: "FT",
		variant: "floating-text",
		color: "#ffe38a",
		opacity: 0.85,
		tags: ["floating", "sparkle", "blessing", "atmosphere"],
		releasedAt: "2026-07-20T05:07:00.000Z",
		popularityScore: 83,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
