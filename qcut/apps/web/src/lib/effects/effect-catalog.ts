import { EFFECT_PRESETS, type EffectPresetId } from "./effect-presets";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";
import { MOTION_EFFECT_CATALOG } from "./effect-motion-catalog";
import { FILTER_EFFECT_CATALOG } from "./effect-filter-catalog";
import { OVERLAY_EFFECT_CATALOG } from "./effect-overlay-catalog";
import { COMPOSITE_EFFECT_CATALOG } from "./effect-composite-catalog";
import { SOUND_EFFECT_CATALOG } from "./effect-sound-catalog";
import { AUDIO_REACTIVE_EFFECT_CATALOG } from "./effect-audio-reactive-catalog";
import { CREATIVE_AI_EFFECT_CATALOG } from "./effect-creative-ai-catalog";

interface LegacyEffectMetadata {
	category: VisualEffectCategoryId;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}

const LEGACY_EFFECT_METADATA = {
	"brightness-increase": {
		category: "basic",
		tags: ["brightness", "exposure"],
		releasedAt: "2025-01-01T00:00:00.000Z",
		popularityScore: 62,
	},
	"brightness-decrease": {
		category: "basic",
		tags: ["brightness", "exposure"],
		releasedAt: "2025-01-01T00:00:00.000Z",
		popularityScore: 48,
	},
	"contrast-high": {
		category: "basic",
		tags: ["contrast", "clarity"],
		releasedAt: "2025-01-01T00:00:00.000Z",
		popularityScore: 57,
	},
	"contrast-soft": {
		category: "basic",
		tags: ["contrast", "soft"],
		releasedAt: "2025-01-01T00:00:00.000Z",
		popularityScore: 43,
	},
	"saturation-boost": {
		category: "trendy",
		tags: ["color", "vibrant"],
		releasedAt: "2025-01-02T00:00:00.000Z",
		popularityScore: 66,
	},
	desaturate: {
		category: "atmosphere",
		tags: ["color", "muted"],
		releasedAt: "2025-01-02T00:00:00.000Z",
		popularityScore: 45,
	},
	"warm-filter": {
		category: "light",
		tags: ["warm", "color"],
		releasedAt: "2025-01-03T00:00:00.000Z",
		popularityScore: 64,
	},
	"cool-filter": {
		category: "light",
		tags: ["cool", "color"],
		releasedAt: "2025-01-03T00:00:00.000Z",
		popularityScore: 58,
	},
	"hue-shift": {
		category: "trendy",
		tags: ["hue", "color"],
		releasedAt: "2025-01-04T00:00:00.000Z",
		popularityScore: 55,
	},
	sepia: {
		category: "atmosphere",
		tags: ["sepia", "vintage"],
		releasedAt: "2025-01-05T00:00:00.000Z",
		popularityScore: 51,
	},
	"faded-film": {
		category: "atmosphere",
		tags: ["film", "faded"],
		releasedAt: "2025-01-06T00:00:00.000Z",
		popularityScore: 70,
	},
	grayscale: {
		category: "trendy",
		tags: ["monochrome", "grayscale"],
		releasedAt: "2025-01-07T00:00:00.000Z",
		popularityScore: 60,
	},
	"blur-soft": {
		category: "basic",
		tags: ["blur", "soft"],
		releasedAt: "2025-01-08T00:00:00.000Z",
		popularityScore: 54,
	},
	dreamy: {
		category: "light",
		tags: ["dreamy", "soft"],
		releasedAt: "2025-01-09T00:00:00.000Z",
		popularityScore: 72,
	},
	dramatic: {
		category: "atmosphere",
		tags: ["dramatic", "contrast"],
		releasedAt: "2025-01-10T00:00:00.000Z",
		popularityScore: 68,
	},
	invert: {
		category: "trendy",
		tags: ["negative", "invert"],
		releasedAt: "2025-01-11T00:00:00.000Z",
		popularityScore: 47,
	},
} as const satisfies Record<EffectPresetId, LegacyEffectMetadata>;

export const LEGACY_EFFECT_CATALOG = EFFECT_PRESETS.map((preset) => {
	const metadata = LEGACY_EFFECT_METADATA[preset.id];
	return {
		preset,
		family: "visual",
		category: metadata.category,
		tags: metadata.tags,
		releasedAt: metadata.releasedAt,
		popularityScore: metadata.popularityScore,
		publication: "legacy",
		render: {
			kind: "filter",
			previewBackend: "css-filter",
			exportBackend: "ffmpeg-filter",
			parity: "verified",
		},
	};
}) satisfies readonly VisualEffectCatalogEntry[];

export const EFFECT_CATALOG: readonly VisualEffectCatalogEntry[] = [
	...LEGACY_EFFECT_CATALOG,
	...FILTER_EFFECT_CATALOG,
	...MOTION_EFFECT_CATALOG,
	...OVERLAY_EFFECT_CATALOG,
	...COMPOSITE_EFFECT_CATALOG,
	...SOUND_EFFECT_CATALOG,
	...AUDIO_REACTIVE_EFFECT_CATALOG,
	...CREATIVE_AI_EFFECT_CATALOG,
];
