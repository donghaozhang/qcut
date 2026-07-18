import {
	resolveAssetManifestEntry,
	type AssetManifestEntry,
	type AssetManifestFile,
} from "@qcut/editor-core";
import { QCUT_ASSET_CATALOG } from "@/lib/assets/qcut-asset-manifest";

export interface EffectSoundAsset {
	asset: AssetManifestEntry;
	source: AssetManifestFile;
}

/** Resolves a catalog sound through the same manifest used by preview and export. */
export function resolveEffectSoundAsset({
	resourceId,
}: {
	resourceId: string;
}): EffectSoundAsset {
	const asset = resolveAssetManifestEntry({
		catalog: QCUT_ASSET_CATALOG,
		kind: "sound-effect",
		id: resourceId,
	});
	if (!asset) {
		throw new Error(`Unknown effect sound resource: ${resourceId}`);
	}

	const source = asset.files.find((file) => file.role === "source");
	if (!source) {
		throw new Error(`Effect sound resource has no source file: ${resourceId}`);
	}
	return { asset, source };
}
