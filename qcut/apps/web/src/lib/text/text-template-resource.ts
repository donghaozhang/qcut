import { assetManifestVersionKey } from "@qcut/editor-core";
import type { AssetResourceCacheStorage } from "@/lib/assets/asset-resource-cache";
import { ensureAssetResources } from "@/lib/assets/asset-resource-cache";
import { resolveTextTemplateAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import type { TextTemplateDefinition } from "./text-template-registry";

export interface DownloadedTextTemplateResource {
	cacheKey: string;
	packageUrl?: string;
	sourceUrl?: string;
	thumbnailUrl?: string;
}

export async function downloadTextTemplateResource({
	definition,
	fetchImpl = fetch,
	onProgress,
	storage,
}: {
	definition: TextTemplateDefinition;
	fetchImpl?: typeof fetch;
	onProgress?: ({ progress }: { progress: number }) => void;
	storage?: AssetResourceCacheStorage;
}): Promise<DownloadedTextTemplateResource> {
	const asset = resolveTextTemplateAssetEntry({ definition });
	const cacheKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	if (asset.kind !== "text-template") {
		throw new Error(`Expected text-template asset, received ${asset.kind}`);
	}
	if (asset.delivery !== "remote") {
		return { cacheKey };
	}
	if (asset.files.length === 0) {
		throw new Error(`Text template ${asset.id} has no downloadable files`);
	}

	const resources = await ensureAssetResources({
		asset,
		fetchImpl,
		onProgress,
		storage,
	});
	return {
		cacheKey,
		packageUrl: resources.find((resource) => resource.role === "package")?.url,
		sourceUrl: resources.find((resource) => resource.role === "source")?.url,
		thumbnailUrl: resources.find((resource) => resource.role === "thumbnail")
			?.url,
	};
}
