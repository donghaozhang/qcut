import type { EffectAudioReactiveRenderStage } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type { VisualEffectCatalogEntry } from "./effect-catalog-types";

function createAudioReactiveEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	icon,
	stage,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	icon: string;
	stage: EffectAudioReactiveRenderStage;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "artistic",
		icon,
		parameters: {},
		effectType: "audio-reactive",
		renderProgram: { version: 1, stages: [stage] },
	};
	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category: "audio",
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "audio-reactive",
			previewBackend: "canvas",
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const AUDIO_REACTIVE_EFFECT_CATALOG = [
	createAudioReactiveEntry({
		id: "audio-bass-pulse",
		name: "Bass Pulse",
		localizedName: "低频脉冲",
		description: "Scales the frame from the project audio's bass energy.",
		localizedDescription: "根据项目音频的低频能量缩放画面。",
		icon: "BP",
		stage: {
			kind: "audio-reactive",
			driver: "timeline",
			band: "bass",
			property: "scale",
			minimum: 1,
			maximum: 1.14,
			attackMs: 35,
			releaseMs: 180,
		},
		tags: ["audio", "bass", "pulse", "scale"],
		releasedAt: "2026-07-18T01:09:00.000Z",
		popularityScore: 89,
	}),
	createAudioReactiveEntry({
		id: "audio-luma-beat",
		name: "Luma Beat",
		localizedName: "亮度节拍",
		description: "Drives brightness from the full project mix.",
		localizedDescription: "根据项目完整混音驱动画面亮度。",
		icon: "LB",
		stage: {
			kind: "audio-reactive",
			driver: "timeline",
			band: "full",
			property: "brightness",
			minimum: 0.82,
			maximum: 1.3,
			attackMs: 25,
			releaseMs: 140,
		},
		tags: ["audio", "beat", "brightness", "luma"],
		releasedAt: "2026-07-18T01:10:00.000Z",
		popularityScore: 87,
	}),
	createAudioReactiveEntry({
		id: "audio-rhythm-fade",
		name: "Rhythm Fade",
		localizedName: "节奏显隐",
		description: "Modulates frame opacity from midrange rhythm energy.",
		localizedDescription: "根据中频节奏能量调制画面透明度。",
		icon: "RF",
		stage: {
			kind: "audio-reactive",
			driver: "timeline",
			band: "mid",
			property: "opacity",
			minimum: 0.55,
			maximum: 1,
			attackMs: 20,
			releaseMs: 120,
		},
		tags: ["audio", "rhythm", "opacity", "fade"],
		releasedAt: "2026-07-18T01:11:00.000Z",
		popularityScore: 84,
	}),
	createAudioReactiveEntry({
		id: "audio-beat-zoom",
		name: "Beat Zoom",
		localizedName: "卡点放大",
		description: "Zooms the frame on bass beats from the clip's own audio.",
		localizedDescription: "根据片段自身音频的低频节拍放大画面。",
		icon: "BZ",
		stage: {
			kind: "audio-reactive",
			driver: "source",
			band: "bass",
			property: "scale",
			minimum: 1,
			maximum: 1.22,
			attackMs: 20,
			releaseMs: 160,
		},
		tags: ["audio", "beat", "zoom", "scale"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 92,
	}),
	createAudioReactiveEntry({
		id: "audio-rhythm-flash",
		name: "Rhythm Flash",
		localizedName: "节奏闪光",
		description: "Flashes brightness on bass rhythm with a fast attack.",
		localizedDescription: "根据低频节奏快速提亮闪光。",
		icon: "RL",
		stage: {
			kind: "audio-reactive",
			driver: "timeline",
			band: "bass",
			property: "brightness",
			minimum: 1,
			maximum: 1.6,
			attackMs: 15,
			releaseMs: 110,
		},
		tags: ["audio", "rhythm", "flash", "brightness"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 80,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
