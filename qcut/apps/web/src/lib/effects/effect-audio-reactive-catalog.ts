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
] as const satisfies readonly VisualEffectCatalogEntry[];
