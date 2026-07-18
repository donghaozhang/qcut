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

export const MOTION_EFFECT_CATALOG = [
	createMotionCatalogEntry({
		id: "dynamic-camera-shake",
		name: "Camera Shake",
		localizedName: "震动镜头",
		description: "Fast positional shake with a restrained rotational wobble.",
		localizedDescription: "快速位置震动，并带有轻微旋转摆动。",
		category: "dynamic",
		icon: "SH",
		channels: [
			{ property: "x", waveform: "sine", amplitude: 0.012, frequencyHz: 7.3 },
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.01,
				frequencyHz: 8.1,
			},
			{
				property: "rotation",
				waveform: "sine",
				amplitude: 0.7,
				frequencyHz: 6.2,
			},
		],
		tags: ["shake", "impact", "dynamic"],
		releasedAt: "2026-07-18T01:00:00.000Z",
		popularityScore: 92,
	}),
	createMotionCatalogEntry({
		id: "dynamic-rhythm-pulse",
		name: "Rhythm Pulse",
		localizedName: "节奏脉冲",
		description: "A steady scale pulse for rhythmic edits.",
		localizedDescription: "适合节奏剪辑的稳定缩放脉冲。",
		category: "dynamic",
		icon: "PU",
		channels: [
			{
				property: "scale",
				waveform: "sine",
				amplitude: 0.06,
				frequencyHz: 2,
			},
		],
		tags: ["pulse", "rhythm", "scale"],
		releasedAt: "2026-07-18T01:01:00.000Z",
		popularityScore: 88,
	}),
	createMotionCatalogEntry({
		id: "dynamic-elastic-bounce",
		name: "Elastic Bounce",
		localizedName: "弹性跳动",
		description: "Vertical bounce paired with a subtle elastic scale change.",
		localizedDescription: "垂直跳动并配合轻微弹性缩放。",
		category: "dynamic",
		icon: "BO",
		channels: [
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.025,
				frequencyHz: 1.5,
			},
			{
				property: "scale",
				waveform: "cosine",
				amplitude: -0.025,
				frequencyHz: 1.5,
			},
		],
		tags: ["bounce", "elastic", "dynamic"],
		releasedAt: "2026-07-18T01:02:00.000Z",
		popularityScore: 84,
	}),
	createMotionCatalogEntry({
		id: "camera-push-in",
		name: "Push In",
		localizedName: "缓慢推进",
		description: "A continuous forward camera push across the clip.",
		localizedDescription: "在整个片段中持续缓慢推进镜头。",
		category: "camera",
		icon: "PI",
		channels: [{ property: "scale", waveform: "linear", amplitude: 0.15 }],
		tags: ["push", "zoom", "camera"],
		releasedAt: "2026-07-18T01:03:00.000Z",
		popularityScore: 90,
	}),
	createMotionCatalogEntry({
		id: "camera-cinematic-drift",
		name: "Cinematic Drift",
		localizedName: "电影漂移",
		description: "Slow independent horizontal and vertical camera drift.",
		localizedDescription: "缓慢且独立的水平、垂直镜头漂移。",
		category: "camera",
		icon: "DR",
		channels: [
			{
				property: "x",
				waveform: "sine",
				amplitude: 0.025,
				frequencyHz: 0.12,
			},
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.018,
				frequencyHz: 0.16,
			},
		],
		tags: ["drift", "cinematic", "camera"],
		releasedAt: "2026-07-18T01:04:00.000Z",
		popularityScore: 86,
	}),
	createMotionCatalogEntry({
		id: "camera-handheld",
		name: "Handheld",
		localizedName: "手持镜头",
		description: "Natural low-amplitude handheld camera movement.",
		localizedDescription: "自然、低幅度的手持镜头运动。",
		category: "camera",
		icon: "HH",
		channels: [
			{
				property: "x",
				waveform: "sine",
				amplitude: 0.006,
				frequencyHz: 3.1,
			},
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.006,
				frequencyHz: 2.7,
			},
			{
				property: "rotation",
				waveform: "sine",
				amplitude: 0.35,
				frequencyHz: 2.2,
			},
		],
		tags: ["handheld", "camera", "natural"],
		releasedAt: "2026-07-18T01:05:00.000Z",
		popularityScore: 82,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
