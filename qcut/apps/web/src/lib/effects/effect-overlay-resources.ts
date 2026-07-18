import type { AssetManifestEntry } from "@qcut/editor-core";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import {
	EFFECT_OVERLAY_RESOURCE_IDS,
	EFFECT_OVERLAY_RESOURCE_REFERENCES,
} from "./effect-overlay-resource-definitions";

export { EFFECT_OVERLAY_RESOURCE_IDS } from "./effect-overlay-resource-definitions";

export function resolveEffectOverlayAsset({
	resourceId,
}: {
	resourceId: string;
}): AssetManifestEntry {
	const reference = EFFECT_OVERLAY_RESOURCE_REFERENCES[resourceId];
	if (!reference)
		throw new Error(`Unknown effect overlay resource: ${resourceId}`);
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
	if (!source)
		throw new Error(`Effect overlay source is missing: ${resourceId}`);
	return source.url;
}
