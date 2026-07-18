import type { EffectMotionChannel } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type { VisualEffectCatalogEntry } from "./effect-catalog-types";

function createSoundEffectEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	icon,
	channels,
	resourceId,
	durationSeconds,
	gain,
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
	channels: EffectMotionChannel[];
	resourceId: string;
	durationSeconds: number;
	gain: number;
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
		effectType: "motion",
		renderProgram: {
			version: 1,
			stages: [{ kind: "motion", intensity: 1, channels }],
		},
		audioCompanion: {
			resourceId,
			offsetSeconds: 0,
			durationSeconds,
			gain,
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category: "sound",
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

export const SOUND_EFFECT_CATALOG = [
	createSoundEffectEntry({
		id: "sound-cinematic-impact",
		name: "Sonic Impact",
		localizedName: "声浪冲击",
		description: "A forceful frame hit paired with a cinematic impact sound.",
		localizedDescription: "强烈画面震动，并同步电影感冲击音。",
		icon: "IM",
		channels: [
			{ property: "x", waveform: "sine", amplitude: 0.018, frequencyHz: 8.2 },
			{
				property: "y",
				waveform: "cosine",
				amplitude: 0.014,
				frequencyHz: 9.4,
			},
			{
				property: "scale",
				waveform: "cosine",
				amplitude: 0.03,
				frequencyHz: 2.4,
			},
		],
		resourceId: "-2003",
		durationSeconds: 1.6,
		gain: 0.9,
		tags: ["sound", "impact", "shake", "cinematic"],
		releasedAt: "2026-07-18T01:06:00.000Z",
		popularityScore: 91,
	}),
	createSoundEffectEntry({
		id: "sound-shutter-flicker",
		name: "Shutter Flicker",
		localizedName: "快门闪动",
		description: "A crisp exposure flicker paired with a camera shutter.",
		localizedDescription: "清脆曝光闪动，并同步相机快门声。",
		icon: "SF",
		channels: [
			{
				property: "opacity",
				waveform: "cosine",
				amplitude: 0.38,
				frequencyHz: 4.5,
			},
			{ property: "scale", waveform: "linear", amplitude: 0.035 },
		],
		resourceId: "-2005",
		durationSeconds: 0.5,
		gain: 0.85,
		tags: ["sound", "camera", "shutter", "flicker"],
		releasedAt: "2026-07-18T01:07:00.000Z",
		popularityScore: 86,
	}),
	createSoundEffectEntry({
		id: "sound-whoosh-push",
		name: "Whoosh Push",
		localizedName: "掠过推进",
		description: "A forward frame push paired with an airy whoosh.",
		localizedDescription: "向前推进画面，并同步空气掠过声。",
		icon: "WH",
		channels: [
			{ property: "x", waveform: "linear", amplitude: 0.06 },
			{ property: "scale", waveform: "linear", amplitude: 0.12 },
		],
		resourceId: "-2004",
		durationSeconds: 1.4,
		gain: 0.8,
		tags: ["sound", "whoosh", "push", "transition"],
		releasedAt: "2026-07-18T01:08:00.000Z",
		popularityScore: 88,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
