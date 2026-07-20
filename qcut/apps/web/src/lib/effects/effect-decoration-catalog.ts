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
			// Canvas preview complete; frame-based export burn-in is a follow-up.
			exportBackend: "frame-renderer",
			parity: "pending",
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
] as const satisfies readonly VisualEffectCatalogEntry[];
