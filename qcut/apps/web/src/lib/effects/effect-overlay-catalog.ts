import type { EffectPreset } from "@/types/effects";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";
import { EFFECT_OVERLAY_RESOURCE_IDS } from "./effect-overlay-resource-definitions";

function createOverlayCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	resourceId,
	fit,
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
	resourceId: string;
	fit: "cover" | "contain" | "stretch";
	opacity: number;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "composite",
		icon,
		parameters: {},
		effectType: "resource-overlay",
		renderProgram: {
			version: 1,
			stages: [
				{
					kind: "overlay",
					resourceId,
					blendMode: "normal",
					opacity,
					fit,
				},
			],
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
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const OVERLAY_EFFECT_CATALOG = [
	createOverlayCatalogEntry({
		id: "border-today-frame",
		name: "Today Frame",
		localizedName: "今日取景框",
		description: "A warm creator frame from the bundled Frames sticker pack.",
		localizedDescription: "复用内置边框贴纸包的暖色创作取景框。",
		category: "border",
		icon: "TF",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.borderToday,
		fit: "stretch",
		opacity: 1,
		tags: ["frame", "today", "border"],
		releasedAt: "2026-07-18T03:00:00.000Z",
		popularityScore: 77,
	}),
	createOverlayCatalogEntry({
		id: "border-highlight-frame",
		name: "Highlight Frame",
		localizedName: "高光边框",
		description: "A bold highlight frame from the bundled Frames sticker pack.",
		localizedDescription: "复用内置边框贴纸包的高光边框。",
		category: "border",
		icon: "HF",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.borderHighlight,
		fit: "stretch",
		opacity: 1,
		tags: ["highlight", "frame", "border"],
		releasedAt: "2026-07-18T03:01:00.000Z",
		popularityScore: 75,
	}),
	createOverlayCatalogEntry({
		id: "border-snapshot-frame",
		name: "Snapshot Frame",
		localizedName: "定格边框",
		description: "A snapshot treatment from the bundled Frames sticker pack.",
		localizedDescription: "复用内置边框贴纸包的画面定格样式。",
		category: "border",
		icon: "SS",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.borderSnapshot,
		fit: "stretch",
		opacity: 1,
		tags: ["snapshot", "frame", "border"],
		releasedAt: "2026-07-18T03:02:00.000Z",
		popularityScore: 73,
	}),
	createOverlayCatalogEntry({
		id: "light-sparkle-pop",
		name: "Sparkle Pop",
		localizedName: "闪耀光点",
		description: "An animated sparkle overlay from QCut Motion Emphasis.",
		localizedDescription: "复用 QCut 动态强调包的闪耀动画。",
		category: "light",
		icon: "SP",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.lightSparkle,
		fit: "contain",
		opacity: 0.9,
		tags: ["sparkle", "light", "animated"],
		releasedAt: "2026-07-18T03:03:00.000Z",
		popularityScore: 89,
	}),
	createOverlayCatalogEntry({
		id: "light-creator-sparkle",
		name: "Creator Sparkle",
		localizedName: "创作闪光",
		description: "A colorful animated sparkle from QCut Creator Loops.",
		localizedDescription: "复用 QCut 创作循环包的彩色闪光动画。",
		category: "light",
		icon: "CS",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.lightCreatorSparkle,
		fit: "contain",
		opacity: 0.9,
		tags: ["sparkle", "creator", "light"],
		releasedAt: "2026-07-18T03:04:00.000Z",
		popularityScore: 85,
	}),
	createOverlayCatalogEntry({
		id: "light-summer-burst",
		name: "Summer Burst",
		localizedName: "夏日光芒",
		description: "A bright burst from the bundled Summer sticker pack.",
		localizedDescription: "复用内置夏日贴纸包的明亮光芒。",
		category: "light",
		icon: "SB",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.lightBurst,
		fit: "contain",
		opacity: 0.85,
		tags: ["summer", "burst", "light"],
		releasedAt: "2026-07-18T03:05:00.000Z",
		popularityScore: 80,
	}),
	createOverlayCatalogEntry({
		id: "heart-beat",
		name: "Heart Beat",
		localizedName: "心动",
		description: "An animated heart from QCut Motion Emphasis.",
		localizedDescription: "复用 QCut 动态强调包的心动动画。",
		category: "heart",
		icon: "HB",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.heartBeat,
		fit: "contain",
		opacity: 1,
		tags: ["heart", "love", "animated"],
		releasedAt: "2026-07-18T03:06:00.000Z",
		popularityScore: 91,
	}),
	createOverlayCatalogEntry({
		id: "heart-creator-beat",
		name: "Creator Heart",
		localizedName: "创作心动",
		description: "A colorful animated heart from QCut Creator Loops.",
		localizedDescription: "复用 QCut 创作循环包的彩色心动动画。",
		category: "heart",
		icon: "CH",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.heartCreatorBeat,
		fit: "contain",
		opacity: 1,
		tags: ["heart", "creator", "love"],
		releasedAt: "2026-07-18T03:07:00.000Z",
		popularityScore: 86,
	}),
	createOverlayCatalogEntry({
		id: "heart-romance-frame",
		name: "Romance Frame",
		localizedName: "浪漫心框",
		description: "A romance frame from the bundled themed sticker pack.",
		localizedDescription: "复用内置浪漫主题贴纸包的心形边框。",
		category: "heart",
		icon: "RF",
		resourceId: EFFECT_OVERLAY_RESOURCE_IDS.heartRomance,
		fit: "stretch",
		opacity: 1,
		tags: ["heart", "romance", "frame"],
		releasedAt: "2026-07-18T03:08:00.000Z",
		popularityScore: 82,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
