import {
	assetManifestVersionKey,
	type AssetFileRole,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import { useEffect, useMemo, useState } from "react";
import { ensureAssetResources } from "@/lib/assets/asset-resource-cache";
import { useAssetLibraryStore } from "@/stores/asset-library-store";

function directResourceUrl({
	asset,
	role,
}: {
	asset?: AssetManifestEntry;
	role: AssetFileRole;
}): string | undefined {
	return asset?.files.find((file) => file.role === role)?.url;
}

export function useAssetResourceUrl({
	asset,
	role,
}: {
	asset?: AssetManifestEntry;
	role: AssetFileRole;
}): string | undefined {
	const assetKey = useMemo(
		() =>
			asset
				? assetManifestVersionKey({
						kind: asset.kind,
						id: asset.id,
						version: asset.version,
					})
				: undefined,
		[asset]
	);
	const runtime = useAssetLibraryStore((state) =>
		assetKey ? state.runtimeByAssetKey[assetKey] : undefined
	);
	const directUrl = directResourceUrl({ asset, role });
	const [cachedUrl, setCachedUrl] = useState<string>();

	useEffect(() => {
		setCachedUrl(undefined);
		if (!asset || !directUrl || asset.delivery !== "remote") return;
		if (runtime?.cacheStatus !== "cached" && runtime?.cacheStatus !== "stale") {
			return;
		}
		let cancelled = false;
		let objectUrl: string | undefined;
		void ensureAssetResources({ asset, roles: [role] })
			.then((resources) => {
				const resource = resources.find((candidate) => candidate.role === role);
				if (!resource?.blob || cancelled) return;
				objectUrl = URL.createObjectURL(resource.blob);
				setCachedUrl(objectUrl);
			})
			.catch(() => {
				if (!cancelled) setCachedUrl(undefined);
			});
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [asset, directUrl, role, runtime?.cacheStatus]);

	if (!asset || !directUrl) return;
	if (asset.delivery !== "remote") return directUrl;
	return cachedUrl;
}
