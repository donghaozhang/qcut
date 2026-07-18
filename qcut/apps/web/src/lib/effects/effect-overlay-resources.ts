import type { AssetManifestEntry } from "@qcut/editor-core";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";

export const EFFECT_OVERLAY_RESOURCE_IDS = {
	borderToday: "qcut-themed:frames-frame-10",
	borderHighlight: "qcut-themed:frames-frame-17",
	borderSnapshot: "qcut-themed:frames-frame-24",
	lightSparkle: "qcut-motion-emphasis:sparkle-pop",
	lightCreatorSparkle: "qcut-motion-creator:creator-sparkle-pop",
	lightBurst: "qcut-themed:summer-burst-02",
	heartBeat: "qcut-motion-emphasis:heart-beat",
	heartCreatorBeat: "qcut-motion-creator:creator-heart-beat",
	heartRomance: "qcut-themed:romance-frame-24",
} as const;

interface EffectOverlayResourceReference {
	collection: string;
	icon: string;
}

const EFFECT_OVERLAY_RESOURCE_REFERENCES: Record<
	string,
	EffectOverlayResourceReference
> = {
	[EFFECT_OVERLAY_RESOURCE_IDS.borderToday]: {
		collection: "qcut-themed",
		icon: "frames-frame-10",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.borderHighlight]: {
		collection: "qcut-themed",
		icon: "frames-frame-17",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.borderSnapshot]: {
		collection: "qcut-themed",
		icon: "frames-frame-24",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.lightSparkle]: {
		collection: "qcut-motion-emphasis",
		icon: "sparkle-pop",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.lightCreatorSparkle]: {
		collection: "qcut-motion-creator",
		icon: "creator-sparkle-pop",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.lightBurst]: {
		collection: "qcut-themed",
		icon: "summer-burst-02",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.heartBeat]: {
		collection: "qcut-motion-emphasis",
		icon: "heart-beat",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.heartCreatorBeat]: {
		collection: "qcut-motion-creator",
		icon: "creator-heart-beat",
	},
	[EFFECT_OVERLAY_RESOURCE_IDS.heartRomance]: {
		collection: "qcut-themed",
		icon: "romance-frame-24",
	},
};

export function resolveEffectOverlayAsset({
	resourceId,
}: {
	resourceId: string;
}): AssetManifestEntry {
	const reference = EFFECT_OVERLAY_RESOURCE_REFERENCES[resourceId];
	if (!reference) throw new Error(`Unknown effect overlay resource: ${resourceId}`);
	const asset = resolveStickerAssetEntry({
		collectionPrefix: reference.collection,
		icon: reference.icon,
	});
	if (asset.id !== resourceId) {
		throw new Error(`Effect overlay resource identity mismatch: ${resourceId}`);
	}
	return asset;
}

export function resolveEffectOverlayPreviewUrl({
	resourceId,
}: {
	resourceId: string;
}): string {
	const asset = resolveEffectOverlayAsset({ resourceId });
	const source = asset.files.find((file) => file.role === "source");
	if (!source) throw new Error(`Effect overlay source is missing: ${resourceId}`);
	return source.url;
}
