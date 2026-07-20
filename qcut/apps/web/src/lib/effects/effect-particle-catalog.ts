import type { EffectParticleVariant } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type { VisualEffectCatalogEntry } from "./effect-catalog-types";

function createParticleCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	icon,
	variant,
	density,
	speed,
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
	icon: string;
	variant: EffectParticleVariant;
	density: number;
	speed: number;
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
			stages: [{ kind: "particles", variant, density, speed, color, opacity }],
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category: "atmosphere",
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "particles",
			previewBackend: "canvas",
			// Rendered per-frame from the deterministic particle model. Preview is
			// complete; frame-based export burn-in is the tracked follow-up, so the
			// contract is honestly marked pending (see effect-catalog audit).
			exportBackend: "frame-renderer",
			parity: "pending",
		},
	};
}

export const PARTICLE_EFFECT_CATALOG = [
	createParticleCatalogEntry({
		id: "atmosphere-snow",
		name: "Snowfall",
		localizedName: "雪花散落",
		description: "Soft snow drifting gently down the frame.",
		localizedDescription: "柔软的雪花轻轻飘落。",
		icon: "SN",
		variant: "snow",
		density: 0.8,
		speed: 1,
		color: "#ffffff",
		opacity: 0.85,
		tags: ["snow", "winter", "atmosphere", "particles"],
		releasedAt: "2026-07-20T03:00:00.000Z",
		popularityScore: 90,
	}),
	createParticleCatalogEntry({
		id: "atmosphere-sakura",
		name: "Sakura",
		localizedName: "樱花飘落",
		description: "Pink cherry petals swaying as they fall.",
		localizedDescription: "粉色樱花花瓣摇曳飘落。",
		icon: "SK",
		variant: "sakura",
		density: 0.6,
		speed: 0.9,
		color: "#ffb7d5",
		opacity: 0.9,
		tags: ["sakura", "petals", "spring", "atmosphere", "particles"],
		releasedAt: "2026-07-20T03:01:00.000Z",
		popularityScore: 92,
	}),
	createParticleCatalogEntry({
		id: "atmosphere-embers",
		name: "Embers",
		localizedName: "星火",
		description: "Warm glowing embers rising and twinkling.",
		localizedDescription: "温暖的星火向上升腾并闪烁。",
		icon: "EM",
		variant: "embers",
		density: 0.7,
		speed: 1,
		color: "#ff9a3c",
		opacity: 0.9,
		tags: ["embers", "fire", "sparks", "atmosphere", "particles"],
		releasedAt: "2026-07-20T03:02:00.000Z",
		popularityScore: 87,
	}),
	createParticleCatalogEntry({
		id: "atmosphere-stars",
		name: "Starfield",
		localizedName: "繁星点点",
		description: "A field of gently twinkling stars.",
		localizedDescription: "满屏轻柔闪烁的繁星。",
		icon: "ST",
		variant: "stars",
		density: 0.85,
		speed: 1,
		color: "#fff4c2",
		opacity: 0.85,
		tags: ["stars", "night", "twinkle", "atmosphere", "particles"],
		releasedAt: "2026-07-20T03:03:00.000Z",
		popularityScore: 88,
	}),
	createParticleCatalogEntry({
		id: "atmosphere-confetti",
		name: "Confetti",
		localizedName: "缤纷彩带",
		description: "Colorful confetti tumbling down for celebrations.",
		localizedDescription: "五彩缤纷的彩带欢庆飘落。",
		icon: "CF",
		variant: "confetti",
		density: 0.75,
		speed: 1.1,
		color: "#ff5d8f",
		opacity: 0.95,
		tags: ["confetti", "celebrate", "party", "atmosphere", "particles"],
		releasedAt: "2026-07-20T03:04:00.000Z",
		popularityScore: 86,
	}),
	createParticleCatalogEntry({
		id: "atmosphere-fog",
		name: "Drifting Fog",
		localizedName: "腾云驾雾",
		description: "Soft fog banks drifting across the frame.",
		localizedDescription: "柔和的雾气在画面中缓缓流动。",
		icon: "FG",
		variant: "fog",
		density: 0.9,
		speed: 0.6,
		color: "#e8eef5",
		opacity: 0.4,
		tags: ["fog", "mist", "cloud", "atmosphere", "particles"],
		releasedAt: "2026-07-20T03:05:00.000Z",
		popularityScore: 84,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
