import type { EffectDistortionVariant } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";

function createDistortionCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	variant,
	strength,
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
	variant: EffectDistortionVariant;
	strength: number;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "distortion",
		icon,
		parameters: {},
		renderProgram: {
			version: 1,
			stages: [{ kind: "distortion", variant, strength }],
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
			kind: "distortion",
			previewBackend: "canvas",
			// Canvas remap preview complete; frame-based export is a follow-up.
			exportBackend: "frame-renderer",
			parity: "pending",
		},
	};
}

export const DISTORTION_EFFECT_CATALOG = [
	createDistortionCatalogEntry({
		id: "basic-fisheye",
		name: "Fisheye",
		localizedName: "鱼眼",
		description: "A bulging wide-angle lens distortion.",
		localizedDescription: "凸起的广角鱼眼镜头畸变。",
		category: "basic",
		icon: "FE",
		variant: "fisheye",
		strength: 0.7,
		tags: ["fisheye", "lens", "distort", "basic"],
		releasedAt: "2026-07-20T06:00:00.000Z",
		popularityScore: 84,
	}),
	createDistortionCatalogEntry({
		id: "dynamic-ripple",
		name: "Ripple",
		localizedName: "水波纹",
		description: "Concentric water ripples rolling outward.",
		localizedDescription: "一圈圈向外扩散的水波纹。",
		category: "dynamic",
		icon: "RP",
		variant: "ripple",
		strength: 0.6,
		tags: ["ripple", "water", "wave", "dynamic"],
		releasedAt: "2026-07-20T06:01:00.000Z",
		popularityScore: 85,
	}),
	createDistortionCatalogEntry({
		id: "dynamic-shockwave",
		name: "Shockwave",
		localizedName: "冲击波",
		description: "An expanding shockwave ring warping the frame.",
		localizedDescription: "向外扩张的冲击波,扭曲整个画面。",
		category: "dynamic",
		icon: "SW",
		variant: "shockwave",
		strength: 0.8,
		tags: ["shockwave", "blast", "impact", "dynamic"],
		releasedAt: "2026-07-20T06:02:00.000Z",
		popularityScore: 86,
	}),
	createDistortionCatalogEntry({
		id: "basic-magnifier",
		name: "Magnifier",
		localizedName: "放大镜",
		description: "A circular loupe that magnifies the center of the frame.",
		localizedDescription: "圆形放大镜,放大画面中心区域。",
		category: "basic",
		icon: "MG",
		variant: "magnifier",
		strength: 0.7,
		tags: ["magnifier", "zoom", "loupe", "basic"],
		releasedAt: "2026-07-20T06:03:00.000Z",
		popularityScore: 80,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
