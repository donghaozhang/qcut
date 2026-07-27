import type { EffectMotionChannel } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";

function createMotionCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	channels,
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
	channels: EffectMotionChannel[];
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: category === "camera" ? "cinematic" : "distortion",
		icon,
		parameters: {},
		effectType: "motion",
		renderProgram: {
			version: 1,
			stages: [{ kind: "motion", intensity: 1, channels }],
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
			kind: "motion",
			previewBackend: "canvas",
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const EXTRA_MOTION_EFFECT_CATALOG = [
	createMotionCatalogEntry({
		id: "camera-slow-zoom",
		name: "Slow Zoom",
		localizedName: "渐渐放大",
		description: "A gentle continuous zoom that gradually magnifies the frame.",
		localizedDescription: "缓慢持续地放大画面，逐渐推近主体。",
		category: "camera",
		icon: "SZ",
		channels: [{ property: "scale", waveform: "linear", amplitude: 0.25 }],
		tags: ["zoom", "slow", "camera"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 92,
	}),
	createMotionCatalogEntry({
		id: "dynamic-lens-wobble",
		name: "Lens Wobble",
		localizedName: "镜头摇晃",
		description: "A loose lens wobble with offset phases on each axis.",
		localizedDescription: "镜头松动般的摇晃，各方向相位错开。",
		category: "dynamic",
		icon: "LW",
		channels: [
			{
				property: "x",
				waveform: "sine",
				amplitude: 0.012,
				frequencyHz: 2.4,
			},
			{
				property: "y",
				waveform: "sine",
				amplitude: 0.016,
				frequencyHz: 2.1,
				phase: 1.6,
			},
			{
				property: "rotation",
				waveform: "sine",
				amplitude: 1.2,
				frequencyHz: 1.8,
				phase: 0.8,
			},
		],
		tags: ["wobble", "shake", "lens", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 78,
	}),
	createMotionCatalogEntry({
		id: "camera-push-pull-fast",
		name: "Fast Push Pull",
		localizedName: "推近推远",
		description: "A brisk ping-pong zoom that pushes in and pulls back out.",
		localizedDescription: "较快的推近拉远变焦，来回往复。",
		category: "camera",
		icon: "PF",
		channels: [
			{
				property: "scale",
				waveform: "sine",
				amplitude: 0.12,
				frequencyHz: 0.5,
			},
		],
		tags: ["push", "pull", "zoom", "camera"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 80,
	}),
	createMotionCatalogEntry({
		id: "dynamic-offset-jitter",
		name: "Offset Jitter",
		localizedName: "位移抖动",
		description: "A high-frequency positional jitter with a small travel.",
		localizedDescription: "高频小幅度的位置抖动。",
		category: "dynamic",
		icon: "OJ",
		channels: [
			{ property: "x", waveform: "sine", amplitude: 0.008, frequencyHz: 6.5 },
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.008,
				frequencyHz: 7.6,
			},
		],
		tags: ["jitter", "shake", "offset", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 74,
	}),
	createMotionCatalogEntry({
		id: "dynamic-shake-flash",
		name: "Shake Flash",
		localizedName: "震动屏闪",
		description: "A hard shake combined with a rapid strobe flicker.",
		localizedDescription: "强烈震动并配合快速屏闪。",
		category: "dynamic",
		icon: "SF",
		channels: [
			{ property: "x", waveform: "sine", amplitude: 0.014, frequencyHz: 7 },
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.012,
				frequencyHz: 7,
			},
			{
				property: "opacity",
				waveform: "sine",
				amplitude: 0.35,
				frequencyHz: 14,
			},
		],
		tags: ["shake", "flash", "strobe", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 82,
	}),
	createMotionCatalogEntry({
		id: "dynamic-power-heartbeat",
		name: "Power Heartbeat",
		localizedName: "动感心跳",
		description: "A strong heartbeat zoom pulse with a slight tilt.",
		localizedDescription: "有力的心跳缩放脉冲，带轻微倾斜。",
		category: "dynamic",
		icon: "PH",
		channels: [
			{
				property: "scale",
				waveform: "sine",
				amplitude: 0.1,
				frequencyHz: 2.2,
			},
			{
				property: "rotation",
				waveform: "sine",
				amplitude: 0.6,
				frequencyHz: 2.2,
			},
		],
		tags: ["heartbeat", "pulse", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 83,
	}),
	createMotionCatalogEntry({
		id: "camera-silky-glide",
		name: "Silky Glide",
		localizedName: "丝滑运镜",
		description: "An ultra-smooth horizontal glide with a soft zoom breathe.",
		localizedDescription: "极其顺滑的水平滑动，配合轻柔的呼吸变焦。",
		category: "camera",
		icon: "SG",
		channels: [
			{ property: "x", waveform: "sine", amplitude: 0.02, frequencyHz: 0.18 },
			{
				property: "scale",
				waveform: "sine",
				amplitude: 0.05,
				frequencyHz: 0.12,
			},
		],
		tags: ["glide", "smooth", "camera"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 79,
	}),
	createMotionCatalogEntry({
		id: "camera-follow-2",
		name: "Follow II",
		localizedName: "跟随运镜Ⅱ",
		description: "A slow alternate tracking drift that follows the action.",
		localizedDescription: "缓慢的跟随漂移变体，如镜头换向追随主体。",
		category: "camera",
		icon: "F2",
		channels: [
			{
				property: "x",
				waveform: "cosine",
				amplitude: 0.026,
				frequencyHz: 0.09,
			},
			{ property: "y", waveform: "sine", amplitude: 0.02, frequencyHz: 0.12 },
		],
		tags: ["follow", "track", "camera"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 76,
	}),
	createMotionCatalogEntry({
		id: "camera-lens-zoom",
		name: "Lens Zoom",
		localizedName: "镜头变焦",
		description: "A pronounced breathing zoom in and out.",
		localizedDescription: "幅度明显的呼吸式变焦推拉。",
		category: "camera",
		icon: "LZ",
		channels: [
			{
				property: "scale",
				waveform: "sine",
				amplitude: 0.18,
				frequencyHz: 0.35,
			},
		],
		tags: ["zoom", "lens", "camera"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 77,
	}),
	createMotionCatalogEntry({
		id: "camera-fade-close",
		name: "Fade Close",
		localizedName: "渐隐闭幕",
		description: "Fades the frame out to black across the clip.",
		localizedDescription: "画面在整个片段中渐隐至黑。",
		category: "camera",
		icon: "FC",
		channels: [{ property: "opacity", waveform: "linear", amplitude: -1 }],
		tags: ["fade", "closing", "camera"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 91,
	}),
	createMotionCatalogEntry({
		id: "dynamic-soul-drift",
		name: "Soul Drift",
		localizedName: "灵魂出窍",
		description: "The frame swells and fades away like a departing soul.",
		localizedDescription: "画面逐渐放大并淡出，如灵魂飘离躯体。",
		category: "dynamic",
		icon: "SD",
		channels: [
			{ property: "scale", waveform: "linear", amplitude: 0.35 },
			{ property: "opacity", waveform: "linear", amplitude: -0.75 },
		],
		tags: ["soul", "fade", "zoom", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 81,
	}),
	createMotionCatalogEntry({
		id: "dynamic-beat-shake",
		name: "Beat Shake",
		localizedName: "卡点抖动",
		description: "A mid-amplitude shake with a scale bump for beat cuts.",
		localizedDescription: "适合卡点剪辑的中幅抖动并配合缩放跳动。",
		category: "dynamic",
		icon: "BS",
		channels: [
			{ property: "x", waveform: "sine", amplitude: 0.018, frequencyHz: 4 },
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.016,
				frequencyHz: 4,
			},
			{
				property: "scale",
				waveform: "sine",
				amplitude: 0.05,
				frequencyHz: 4,
			},
		],
		tags: ["beat", "shake", "rhythm", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 92,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
