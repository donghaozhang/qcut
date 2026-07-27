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

/**
 * 节奏光束 pairs the rainbow-rays decoration with an audio-reactive
 * brightness stage so the beams pulse to the music. Hand-written because
 * the factory above emits a single decoration stage.
 */
function createRhythmBeamsCatalogEntry(): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id: "light-rhythm-beams",
		name: "Rhythm Beams",
		description: "Rotating light beams with brightness pulsing to the beat.",
		category: "basic",
		icon: "RH",
		parameters: {},
		renderProgram: {
			version: 1,
			stages: [
				{
					kind: "decoration",
					variant: "rainbow-rays",
					color: "#ffe9c4",
					opacity: 0.65,
				},
				{
					kind: "audio-reactive",
					driver: "timeline",
					band: "bass",
					property: "brightness",
					minimum: 1,
					maximum: 1.4,
					attackMs: 25,
					releaseMs: 150,
				},
			],
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName: "节奏光束",
		localizedDescription: "旋转光束配合节奏驱动画面亮度脉冲。",
		family: "visual",
		category: "light",
		tags: ["beams", "rhythm", "audio", "light"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 85,
		publication: "published",
		render: {
			kind: "overlay",
			previewBackend: "canvas",
			exportBackend: "frame-renderer",
			parity: "verified",
		},
	};
}

/**
 * 丁达尔摇摆: warm volumetric light rays combined with a slow motion sway,
 * so the beams drift like sunlight through haze. Hand-written because the
 * factory above emits a single decoration stage.
 */
function createTyndallSwayCatalogEntry(): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id: "light-tyndall-sway",
		name: "Tyndall Sway",
		description: "Warm volumetric rays drifting with a gentle sway.",
		category: "basic",
		icon: "TS",
		parameters: {},
		renderProgram: {
			version: 1,
			stages: [
				{
					kind: "decoration",
					variant: "rainbow-rays",
					color: "#ffedc9",
					opacity: 0.5,
				},
				{
					kind: "motion",
					intensity: 1,
					channels: [
						{
							property: "x",
							waveform: "sine",
							amplitude: 0.008,
							frequencyHz: 0.25,
						},
						{
							property: "rotation",
							waveform: "sine",
							amplitude: 1.5,
							frequencyHz: 0.2,
							phase: 0.9,
						},
					],
				},
			],
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName: "丁达尔摇摆",
		localizedDescription: "暖色丁达尔光束随画面缓缓摇摆,如透过薄雾的阳光。",
		family: "visual",
		category: "light",
		tags: ["tyndall", "rays", "sway", "light"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 82,
		publication: "published",
		render: {
			kind: "overlay",
			previewBackend: "canvas",
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
	// 2026-07-27 剪映补齐包 — recolor variants of existing decoration models.
	createDecorationCatalogEntry({
		id: "dynamic-explosion",
		name: "Explosion",
		localizedName: "爆炸",
		description: "Orange-red rays bursting violently from the center.",
		localizedDescription: "橙红色射线从中心猛烈爆发。",
		category: "dynamic",
		icon: "EX",
		variant: "burst",
		color: "#ff6a2b",
		opacity: 0.85,
		tags: ["explosion", "burst", "impact", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 92,
	}),
	createDecorationCatalogEntry({
		id: "heart-pink-hearts",
		name: "Pink Hearts",
		localizedName: "粉红心心",
		description: "Pink hearts orbiting playfully around the frame.",
		localizedDescription: "粉色爱心环绕画面俏皮飞舞。",
		category: "heart",
		icon: "PH",
		variant: "hearts-orbit",
		color: "#ff8fc0",
		opacity: 0.9,
		tags: ["hearts", "pink", "love", "heart"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 86,
	}),
	createDecorationCatalogEntry({
		id: "atmosphere-blessing-orbit",
		name: "Blessing Orbit",
		localizedName: "祝福环绕",
		description: "Golden blessing glyphs drifting around the frame.",
		localizedDescription: "金色祝福符号环绕画面飘浮。",
		category: "atmosphere",
		icon: "BO",
		variant: "floating-text",
		color: "#ffd45e",
		opacity: 0.9,
		tags: ["blessing", "glyphs", "gold", "atmosphere"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 82,
	}),
	createDecorationCatalogEntry({
		id: "light-dynamic-beams",
		name: "Dynamic Beams",
		localizedName: "动感光束",
		description: "Warm white light beams sweeping dynamically across.",
		localizedDescription: "暖白色光束动感旋转扫过画面。",
		category: "light",
		icon: "DB",
		variant: "rainbow-rays",
		color: "#fff3e0",
		opacity: 0.75,
		tags: ["beams", "sweep", "dynamic", "light"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 91,
	}),
	createDecorationCatalogEntry({
		id: "light-ray-beams",
		name: "Ray Beams",
		localizedName: "射线光束",
		description: "Subtle golden ray beams rotating gently.",
		localizedDescription: "金色射线光束轻柔旋转,若隐若现。",
		category: "light",
		icon: "RY",
		variant: "rainbow-rays",
		color: "#ffd36b",
		opacity: 0.4,
		tags: ["rays", "beams", "gold", "light"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 80,
	}),
	createDecorationCatalogEntry({
		id: "basic-opening-2",
		name: "Iris Open II",
		localizedName: "开幕Ⅱ",
		description: "A warm-toned circular iris opening onto the frame.",
		localizedDescription: "暖色调圆形开幕遮罩,展开露出画面。",
		category: "basic",
		icon: "O2",
		variant: "iris",
		color: "#2b1608",
		opacity: 1,
		tags: ["iris", "open", "warm", "basic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 91,
	}),
	createDecorationCatalogEntry({
		id: "heart-peach-hearts",
		name: "Peach Hearts",
		localizedName: "桃粉爱心",
		description: "Soft peach-pink hearts floating around the frame.",
		localizedDescription: "桃粉色爱心温柔环绕画面飘动。",
		category: "heart",
		icon: "TH",
		variant: "hearts-orbit",
		color: "#ffb3a1",
		opacity: 0.85,
		tags: ["hearts", "peach", "romance", "heart"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 91,
	}),
	createRhythmBeamsCatalogEntry(),
	createTyndallSwayCatalogEntry(),
] as const satisfies readonly VisualEffectCatalogEntry[];
