import {
	assetManifestVersionKey,
	type AssetManifestEntry,
	type AssetRuntimeState,
} from "@qcut/editor-core";

export const TRANSITION_CACHE_NAME = "qcut-transition-assets-v1";

export type TransitionResourceStatus =
	| "ready"
	| "download"
	| "downloading"
	| "update"
	| "offline"
	| "failed"
	| "checking-local"
	| "local-unavailable";

export interface TransitionResourceState {
	available: boolean;
	progress: number;
	status: TransitionResourceStatus;
}

export function getTransitionResourceState({
	asset,
	runtime,
	online,
}: {
	asset: AssetManifestEntry;
	runtime: AssetRuntimeState;
	online: boolean;
}): TransitionResourceState {
	if (asset.delivery !== "remote") {
		return { available: true, progress: 1, status: "ready" };
	}
	if (runtime.cacheStatus === "stale") {
		return { available: true, progress: 1, status: "update" };
	}
	if (
		runtime.downloadStatus === "downloading" ||
		runtime.downloadStatus === "queued" ||
		runtime.cacheStatus === "caching"
	) {
		return {
			available: false,
			progress: runtime.progress,
			status: "downloading",
		};
	}
	if (runtime.downloadStatus === "failed" || runtime.cacheStatus === "failed") {
		return { available: false, progress: 0, status: "failed" };
	}
	if (
		runtime.downloadStatus === "downloaded" &&
		runtime.cacheStatus === "cached"
	) {
		return { available: true, progress: 1, status: "ready" };
	}
	if (!online) {
		return { available: false, progress: 0, status: "offline" };
	}
	return { available: false, progress: 0, status: "download" };
}

export async function downloadTransitionResource({
	asset,
	fetchResource = fetch,
	cacheStorage = typeof caches === "undefined" ? undefined : caches,
	onProgress,
}: {
	asset: AssetManifestEntry;
	fetchResource?: typeof fetch;
	cacheStorage?: CacheStorage;
	onProgress?: ({ progress }: { progress: number }) => void;
}): Promise<{ cacheKey: string }> {
	if (asset.kind !== "transition") {
		throw new Error(`Expected transition asset, received ${asset.kind}`);
	}
	if (asset.delivery !== "remote") {
		return {
			cacheKey: assetManifestVersionKey({
				kind: asset.kind,
				id: asset.id,
				version: asset.version,
			}),
		};
	}
	if (asset.files.length === 0) {
		throw new Error(`Transition ${asset.id} has no downloadable files`);
	}

	const cache = cacheStorage
		? await cacheStorage.open(TRANSITION_CACHE_NAME)
		: undefined;
	let completed = 0;
	await Promise.all(
		asset.files.map(async (file) => {
			const response = await fetchResource(file.url, { cache: "reload" });
			if (!response.ok) {
				throw new Error(
					`Failed to download ${file.url}: HTTP ${response.status}`
				);
			}
			if (cache) await cache.put(file.url, response.clone());
			completed += 1;
			onProgress?.({ progress: completed / asset.files.length });
		})
	);

	return {
		cacheKey: assetManifestVersionKey({
			kind: asset.kind,
			id: asset.id,
			version: asset.version,
		}),
	};
}
