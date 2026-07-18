import {
	assetManifestIdentity,
	assetManifestVersionKey,
	createInitialAssetRuntimeState,
	resolveAssetManifestEntry,
	type AssetCatalog,
	type AssetManifestEntry,
	type AssetRuntimeFileState,
	type AssetRuntimeState,
} from "@qcut/editor-core";
import {
	ensureAssetResources,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import {
	QCUT_ASSET_CATALOG,
	resolveEffectAssetEntry,
} from "@/lib/assets/qcut-asset-manifest";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type {
	EffectAssetDependency,
	EffectAssetMetadata,
	EffectCatalogEntry,
} from "./effect-catalog-types";

export type EffectResourceStatus =
	| "ready"
	| "download"
	| "downloading"
	| "update"
	| "offline"
	| "failed";

export interface EffectResourceState {
	available: boolean;
	dependencyCount: number;
	progress: number;
	status: EffectResourceStatus;
	updateAvailable: boolean;
}

interface ResolvedEffectDependency {
	asset: AssetManifestEntry;
	reference: EffectAssetDependency;
}

interface EffectResourceGraph {
	dependencies: ResolvedEffectDependency[];
	missing: EffectAssetDependency[];
}

interface RuntimeResourceTarget {
	asset: AssetManifestEntry;
	roles?: EffectAssetDependency["roles"];
}

function effectMetadata({
	asset,
}: {
	asset: AssetManifestEntry;
}): EffectAssetMetadata {
	const metadata = asset.metadata;
	if (
		asset.kind !== "effect" ||
		typeof metadata !== "object" ||
		metadata === null ||
		!("dependencies" in metadata) ||
		!Array.isArray(metadata.dependencies)
	) {
		throw new Error(`Invalid effect asset metadata: ${asset.id}`);
	}
	return metadata as EffectAssetMetadata;
}

export function resolveEffectResourceGraph({
	asset,
	catalog = QCUT_ASSET_CATALOG,
}: {
	asset: AssetManifestEntry;
	catalog?: AssetCatalog;
}): EffectResourceGraph {
	const dependencies: ResolvedEffectDependency[] = [];
	const missing: EffectAssetDependency[] = [];
	for (const reference of effectMetadata({ asset }).dependencies) {
		const dependency = resolveAssetManifestEntry({
			catalog,
			kind: reference.kind,
			id: reference.id,
		});
		if (dependency) {
			dependencies.push({ asset: dependency, reference });
		} else {
			missing.push(reference);
		}
	}
	return { dependencies, missing };
}

function runtimeForAsset({
	asset,
	runtimeByAssetKey,
}: {
	asset: AssetManifestEntry;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}): AssetRuntimeState {
	const key = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	return runtimeByAssetKey[key] ?? createInitialAssetRuntimeState({ asset });
}

function hasCachedPriorVersion({
	asset,
	runtimeByAssetKey,
}: {
	asset: AssetManifestEntry;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}): boolean {
	const currentKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	const prefix = `${assetManifestIdentity({ kind: asset.kind, id: asset.id })}@`;
	return Object.entries(runtimeByAssetKey).some(
		([key, runtime]) =>
			key !== currentKey &&
			key.startsWith(prefix) &&
			runtime.cacheStatus === "cached"
	);
}

function isPending({ runtime }: { runtime: AssetRuntimeState }): boolean {
	return (
		runtime.downloadStatus === "queued" ||
		runtime.downloadStatus === "downloading" ||
		runtime.cacheStatus === "caching"
	);
}

function isFailed({ runtime }: { runtime: AssetRuntimeState }): boolean {
	return (
		runtime.downloadStatus === "failed" || runtime.cacheStatus === "failed"
	);
}

function isCached({ runtime }: { runtime: AssetRuntimeState }): boolean {
	return (
		runtime.downloadStatus === "downloaded" && runtime.cacheStatus === "cached"
	);
}

export function getEffectResourceState({
	asset,
	catalog = QCUT_ASSET_CATALOG,
	online,
	runtimeByAssetKey,
}: {
	asset: AssetManifestEntry;
	catalog?: AssetCatalog;
	online: boolean;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}): EffectResourceState {
	const graph = resolveEffectResourceGraph({ asset, catalog });
	const effectRuntime = runtimeForAsset({ asset, runtimeByAssetKey });
	const dependencyAssets = graph.dependencies.map(
		(dependency) => dependency.asset
	);
	const dependencyRuntimes = dependencyAssets.map((dependency) =>
		runtimeForAsset({ asset: dependency, runtimeByAssetKey })
	);
	const remoteDependencies = graph.dependencies.filter(
		(dependency) => dependency.asset.delivery === "remote"
	);
	const remoteTargets = [
		...(asset.delivery === "remote" ? [asset] : []),
		...remoteDependencies.map((dependency) => dependency.asset),
	];
	const remoteRuntimes = remoteTargets.map((target) =>
		runtimeForAsset({ asset: target, runtimeByAssetKey })
	);
	const dependencyCount = graph.dependencies.length + asset.files.length;
	const updateAvailable =
		[asset, ...remoteTargets].some((target) =>
			hasCachedPriorVersion({ asset: target, runtimeByAssetKey })
		) || remoteRuntimes.some((runtime) => runtime.cacheStatus === "stale");

	if (
		graph.missing.length > 0 ||
		isFailed({ runtime: effectRuntime }) ||
		dependencyRuntimes.some((runtime) => isFailed({ runtime }))
	) {
		return {
			available: false,
			dependencyCount,
			progress: 0,
			status: "failed",
			updateAvailable,
		};
	}
	if (
		isPending({ runtime: effectRuntime }) ||
		dependencyRuntimes.some((runtime) => isPending({ runtime }))
	) {
		const progressValues = [effectRuntime, ...dependencyRuntimes].filter(
			(runtime) => isPending({ runtime })
		);
		const progress =
			progressValues.reduce((total, runtime) => total + runtime.progress, 0) /
			Math.max(1, progressValues.length);
		return {
			available: false,
			dependencyCount,
			progress,
			status: "downloading",
			updateAvailable,
		};
	}
	if (remoteRuntimes.some((runtime) => isFailed({ runtime }))) {
		return {
			available: false,
			dependencyCount,
			progress: 0,
			status: "failed",
			updateAvailable,
		};
	}
	if (remoteRuntimes.some((runtime) => runtime.cacheStatus === "stale")) {
		return {
			available: true,
			dependencyCount,
			progress: 1,
			status: "update",
			updateAvailable: true,
		};
	}
	const uncachedRemote = remoteRuntimes.some(
		(runtime) => !isCached({ runtime })
	);
	if (uncachedRemote) {
		return {
			available: false,
			dependencyCount,
			progress: 0,
			status: updateAvailable ? "update" : online ? "download" : "offline",
			updateAvailable,
		};
	}
	return {
		available: true,
		dependencyCount,
		progress: 1,
		status: "ready",
		updateAvailable,
	};
}

function runtimeFiles({
	resources,
}: {
	resources: readonly ResolvedAssetResource[];
}): AssetRuntimeFileState[] {
	return resources.map((resource) => ({
		byteSize: resource.byteSize,
		cacheKey: resource.cacheKey,
		checksumSha256: resource.checksumSha256,
		fromCache: resource.fromCache,
		mimeType: resource.mimeType,
		role: resource.role,
		url: resource.sourceUrl,
	}));
}

function resourceTargets({
	asset,
	graph,
}: {
	asset: AssetManifestEntry;
	graph: EffectResourceGraph;
}): RuntimeResourceTarget[] {
	const targets: RuntimeResourceTarget[] = [];
	if (asset.delivery === "remote" || asset.delivery === "bundled") {
		targets.push({ asset });
	}
	for (const dependency of graph.dependencies) {
		if (dependency.asset.delivery === "generated") continue;
		targets.push({
			asset: dependency.asset,
			roles: dependency.reference.roles,
		});
	}
	return targets;
}

export async function downloadEffectResources({
	asset,
	catalog = QCUT_ASSET_CATALOG,
	ensureResources = ensureAssetResources,
}: {
	asset: AssetManifestEntry;
	catalog?: AssetCatalog;
	ensureResources?: typeof ensureAssetResources;
}): Promise<void> {
	const graph = resolveEffectResourceGraph({ asset, catalog });
	if (graph.missing.length > 0) {
		throw new Error(
			`Missing effect resources: ${graph.missing
				.map((dependency) => `${dependency.kind}:${dependency.id}`)
				.join(", ")}`
		);
	}
	const targets = resourceTargets({ asset, graph });
	const store = useAssetLibraryStore.getState();
	for (const target of targets) {
		store.updateRuntimeState({
			asset: target.asset,
			patch: {
				downloadStatus: "queued",
				cacheStatus: "caching",
				progress: 0,
				error: "",
			},
		});
	}
	store.updateRuntimeState({
		asset,
		patch: {
			downloadStatus: targets.length > 0 ? "queued" : "not-required",
			cacheStatus: "caching",
			progress: 0,
			error: "",
		},
	});

	const progressByAsset = new Map<string, number>();
	try {
		const downloaded = await Promise.all(
			targets.map(async (target) => {
				const key = assetManifestVersionKey({
					kind: target.asset.kind,
					id: target.asset.id,
					version: target.asset.version,
				});
				store.updateRuntimeState({
					asset: target.asset,
					patch: { downloadStatus: "downloading" },
				});
				const resources = await ensureResources({
					asset: target.asset,
					cacheBundledResources: true,
					roles: target.roles,
					onProgress: ({ progress }) => {
						progressByAsset.set(key, progress);
						const aggregate =
							[...progressByAsset.values()].reduce(
								(total, value) => total + value,
								0
							) / Math.max(1, targets.length);
						store.updateRuntimeState({
							asset: target.asset,
							patch: { progress },
						});
						store.updateRuntimeState({ asset, patch: { progress: aggregate } });
					},
				});
				const files = runtimeFiles({ resources });
				store.updateRuntimeState({
					asset: target.asset,
					patch: {
						downloadStatus: "downloaded",
						cacheStatus: "cached",
						progress: 1,
						cacheKey: key,
						cachedBytes: files.reduce(
							(total, file) => total + (file.byteSize ?? 0),
							0
						),
						cachedFileCount: files.length,
						cacheHitCount: files.filter((file) => file.fromCache).length,
						cachedFiles: files,
						error: "",
					},
				});
				return files;
			})
		);
		const files = downloaded.flat();
		store.updateRuntimeState({
			asset,
			patch: {
				downloadStatus: targets.length > 0 ? "downloaded" : "not-required",
				cacheStatus: "cached",
				progress: 1,
				cacheKey: assetManifestVersionKey({
					kind: asset.kind,
					id: asset.id,
					version: asset.version,
				}),
				cachedBytes: files.reduce(
					(total, file) => total + (file.byteSize ?? 0),
					0
				),
				cachedFileCount: files.length,
				cacheHitCount: files.filter((file) => file.fromCache).length,
				cachedFiles: files,
				error: "",
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		for (const target of targets) {
			store.updateRuntimeState({
				asset: target.asset,
				patch: {
					downloadStatus: "failed",
					cacheStatus: "failed",
					progress: 0,
					error: message,
				},
			});
		}
		store.updateRuntimeState({
			asset,
			patch: {
				downloadStatus: "failed",
				cacheStatus: "failed",
				progress: 0,
				error: message,
			},
		});
		throw error;
	}
}

export function resolveCatalogEffectAsset({
	entry,
}: {
	entry: EffectCatalogEntry;
}): AssetManifestEntry<EffectAssetMetadata> {
	return resolveEffectAssetEntry({ entry });
}
