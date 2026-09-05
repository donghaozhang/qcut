import { createHash } from "node:crypto";
import { resolveComposeGeneratedMedia } from "./compose-generated-media.js";
import {
	resolveComposeText,
	type ComposeTextBinding,
} from "./compose-text-resolver.js";
import { promises as fs } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { resolveStickerLabRootOverride } from "../cli/sticker-lab-root.js";
import {
	importStickerLabReference,
	rollbackStickerLabMedia,
	type StickerLabRuntimeDescriptor,
} from "../editor/editor-sticker-runtime-import.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import {
	discoverLocalReferences,
	readLocalReference,
	type LocalStickerLabDiscovery,
} from "../stickers/local-reference-catalog/index.js";
import { parseStickerLabAssetId } from "./compose-asset-resolver.js";
import {
	materializeComposeSoundLabReference,
	resolveComposeTransitionReference,
	type ComposeTransitionResolution,
	type MaterializedComposeSound,
} from "./compose-lab-resource-resolver.js";
import {
	resolveComposeFilterStack,
	type ResolvedComposeFilterEffect,
} from "./compose-filter-stack-resolver.js";
import type {
	ComposePatch,
	ComposePatchOperation,
} from "./compose-protocol.js";

type StickerImportResult = Awaited<
	ReturnType<typeof importStickerLabReference>
>;

export interface ComposeStickerEditorBinding {
	mediaId: string;
	stickerAssetId: string;
	stickerRuntime?: StickerLabRuntimeDescriptor;
}

export interface ComposeTransitionEditorBinding {
	presetId: string;
	engine: "qcut" | "jianying-local";
	packageHash?: string;
	type: string;
	direction?: "left" | "right" | "up" | "down";
	easing: "linear" | "easeInOut" | "easeInOutQuint";
	tuning?: {
		intensity?: number;
		frequency?: number;
		tint?: string;
	};
	maskShape?: string;
}

export interface ComposeMediaClipEditorBinding {
	path: string;
	filename?: string;
}

export interface ComposeFilterStackEditorBinding {
	effects: ResolvedComposeFilterEffect[];
	warnings: string[];
}

export interface ComposeEditorAssetBinding {
	text?: ComposeTextBinding;
	sticker?: ComposeStickerEditorBinding;
	transition?: ComposeTransitionEditorBinding;
	mediaClip?: ComposeMediaClipEditorBinding;
	filterStack?: ComposeFilterStackEditorBinding;
}

export type ComposeEditorAssetBindings = Record<
	string,
	ComposeEditorAssetBinding
>;

export interface PreparedComposeEditorAssets {
	patch: ComposePatch;
	bindings: ComposeEditorAssetBindings;
	importedMediaIds: string[];
}

export interface ComposeEditorAssetPreparerDependencies {
	discoverStickers: typeof discoverLocalReferences;
	readSticker: typeof readLocalReference;
	importSticker: typeof importStickerLabReference;
	rollbackStickerMedia: typeof rollbackStickerLabMedia;
	materializeSound: typeof materializeComposeSoundLabReference;
	resolveTransition: typeof resolveComposeTransitionReference;
	resolveFilterStack: typeof resolveComposeFilterStack;
	resolveText: typeof resolveComposeText;
}

const DEFAULT_DEPENDENCIES: ComposeEditorAssetPreparerDependencies = {
	discoverStickers: discoverLocalReferences,
	readSticker: readLocalReference,
	importSticker: importStickerLabReference,
	rollbackStickerMedia: rollbackStickerLabMedia,
	materializeSound: materializeComposeSoundLabReference,
	resolveTransition: resolveComposeTransitionReference,
	resolveFilterStack: resolveComposeFilterStack,
	resolveText: resolveComposeText,
};

interface PreparedOperation {
	operation: ComposePatchOperation;
	binding?: ComposeEditorAssetBinding;
	importedMediaIds: string[];
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function transitionBinding({
	resolution,
}: {
	resolution: Extract<ComposeTransitionResolution, { status: "ready" }>;
}): ComposeTransitionEditorBinding {
	if (resolution.backend === "transition-lab") {
		return {
			presetId: resolution.presetId,
			engine: "qcut",
			type: resolution.recipe.clip.type,
			...(resolution.recipe.clip.direction
				? { direction: resolution.recipe.clip.direction }
				: {}),
			easing: resolution.recipe.clip.easing,
			...(resolution.recipe.clip.tuning
				? { tuning: resolution.recipe.clip.tuning }
				: {}),
		};
	}
	if (resolution.backend === "jianying-local") {
		return {
			presetId: resolution.presetId,
			engine: "jianying-local",
			packageHash: resolution.packageHash,
			type: resolution.definition.preview.clipType,
			...(resolution.definition.preview.direction
				? { direction: resolution.definition.preview.direction }
				: {}),
			easing: "easeInOut",
			...(resolution.definition.preview.tuning
				? { tuning: resolution.definition.preview.tuning }
				: {}),
			...(resolution.definition.preview.maskShape
				? { maskShape: resolution.definition.preview.maskShape }
				: {}),
		};
	}
	return {
		presetId: resolution.presetId,
		engine: "qcut",
		type:
			resolution.presetId === "crossfade" ? "dissolve" : resolution.presetId,
		easing: "easeInOut",
	};
}

function stickerImportPromise({
	operation,
	client,
	projectId,
	discovery,
	cache,
	dependencies,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sticker" }>;
	client: EditorApiClient;
	projectId: string;
	discovery: Promise<LocalStickerLabDiscovery>;
	cache: Map<string, Promise<StickerImportResult>>;
	dependencies: ComposeEditorAssetPreparerDependencies;
}): Promise<StickerImportResult> | null {
	const identity = parseStickerLabAssetId({ assetId: operation.asset.assetId });
	if (!identity) return null;
	const cached = cache.get(operation.asset.assetId);
	if (cached) return cached;
	const pending = discovery.then((resolvedDiscovery) =>
		dependencies.importSticker({
			batchId: identity.batchId,
			stickerId: identity.stickerId,
			client,
			projectId,
			discovery: resolvedDiscovery,
			dependencies: { readLocalReference: dependencies.readSticker },
		})
	);
	cache.set(operation.asset.assetId, pending);
	return pending;
}

function soundMaterializationPromise({
	operation,
	scratchDirectory,
	cache,
	dependencies,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sound-effect" }>;
	scratchDirectory: string;
	cache: Map<string, Promise<MaterializedComposeSound | null>>;
	dependencies: ComposeEditorAssetPreparerDependencies;
}): Promise<MaterializedComposeSound | null> {
	const key = `${operation.asset.provider}:${operation.asset.assetId}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const pending = dependencies.materializeSound({
		reference: operation.asset,
		scratchDirectory,
	});
	cache.set(key, pending);
	return pending;
}

function transitionResolutionPromise({
	operation,
	cache,
	dependencies,
}: {
	operation: Extract<ComposePatchOperation, { kind: "upsert-transition" }>;
	cache: Map<string, Promise<ComposeTransitionResolution>>;
	dependencies: ComposeEditorAssetPreparerDependencies;
}): Promise<ComposeTransitionResolution> {
	const assetId = operation.asset?.assetId ?? operation.presetId;
	const cached = cache.get(assetId);
	if (cached) return cached;
	const pending = dependencies.resolveTransition({ assetId });
	cache.set(assetId, pending);
	return pending;
}

async function resolveMediaClipBinding({
	operation,
}: {
	operation: Extract<ComposePatchOperation, { kind: "insert-media-clip" }>;
}): Promise<ComposeMediaClipEditorBinding> {
	const localPath = operation.asset.localPath;
	if (!localPath || !isAbsolute(localPath)) {
		throw new Error(
			`Media clip ${operation.id} needs an absolute localPath on its asset.`
		);
	}
	const stats = await fs.stat(localPath).catch(() => null);
	if (!stats?.isFile() || stats.size === 0) {
		throw new Error(
			`Media clip ${operation.id} source is missing or empty: ${localPath}`
		);
	}
	const expectedSha = operation.asset.provenance?.sha256;
	if (typeof expectedSha === "string" && expectedSha.length === 64) {
		const digest = createHash("sha256")
			.update(await fs.readFile(localPath))
			.digest("hex");
		if (digest !== expectedSha) {
			throw new Error(
				`Media clip ${operation.id} failed its checksum: expected ${expectedSha}, got ${digest}.`
			);
		}
	}
	return { path: localPath, filename: basename(localPath) };
}

async function prepareOperation({
	operation,
	client,
	projectId,
	scratchDirectory,
	discovery,
	stickerImports,
	sounds,
	transitions,
	dependencies,
}: {
	operation: ComposePatchOperation;
	client: EditorApiClient;
	projectId: string;
	scratchDirectory: string;
	discovery: Promise<LocalStickerLabDiscovery>;
	stickerImports: Map<string, Promise<StickerImportResult>>;
	sounds: Map<string, Promise<MaterializedComposeSound | null>>;
	transitions: Map<string, Promise<ComposeTransitionResolution>>;
	dependencies: ComposeEditorAssetPreparerDependencies;
}): Promise<PreparedOperation> {
	if (
		operation.kind === "add-caption" ||
		operation.kind === "add-text-overlay"
	) {
		return {
			operation,
			binding: { text: await dependencies.resolveText({ operation }) },
			importedMediaIds: [],
		};
	}
	if (operation.kind === "add-sticker") {
		const imported = stickerImportPromise({
			operation,
			client,
			projectId,
			discovery,
			cache: stickerImports,
			dependencies,
		});
		if (!imported) return { operation, importedMediaIds: [] };
		const result = await imported;
		return {
			operation,
			binding: {
				sticker: {
					mediaId: result.mediaId,
					stickerAssetId: operation.asset.assetId,
					...(result.stickerRuntime
						? { stickerRuntime: result.stickerRuntime }
						: {}),
				},
			},
			importedMediaIds: result.importedMediaIds,
		};
	}
	if (operation.kind === "add-sound-effect" && !operation.asset.localPath) {
		const materialized = await soundMaterializationPromise({
			operation,
			scratchDirectory,
			cache: sounds,
			dependencies,
		});
		if (!materialized) {
			throw new Error(
				`Sound effect ${operation.asset.assetId} could not be materialized.`
			);
		}
		return {
			operation: {
				...operation,
				asset: {
					...operation.asset,
					localPath: materialized.localPath,
					cacheKey: materialized.sha256,
				},
			},
			importedMediaIds: [],
		};
	}
	if (operation.kind === "insert-media-clip") {
		const resolvedOperation =
			operation.asset.assetType === "generated-media"
				? {
						...operation,
						asset: await resolveComposeGeneratedMedia({
							reference: operation.asset,
							client,
							projectId,
						}),
					}
				: operation;
		if (
			operation.asset.assetType === "generated-media" &&
			resolvedOperation.asset.provenance?.mediaKind !== operation.mediaKind
		)
			throw new Error(
				"Generated media kind does not match the saved project asset."
			);
		return {
			operation: resolvedOperation,
			binding: {
				mediaClip: await resolveMediaClipBinding({
					operation: resolvedOperation,
				}),
			},
			importedMediaIds: [],
		};
	}
	if (
		operation.kind === "set-media-filter-stack" ||
		operation.kind === "add-filter-layer"
	) {
		const resolved = await dependencies.resolveFilterStack({
			steps: operation.filters,
		});
		return {
			operation,
			binding: {
				filterStack: {
					effects: resolved.effects,
					warnings: resolved.warnings,
				},
			},
			importedMediaIds: [],
		};
	}
	if (operation.kind === "upsert-transition") {
		const resolution = await transitionResolutionPromise({
			operation,
			cache: transitions,
			dependencies,
		});
		if (resolution.status !== "ready") throw new Error(resolution.detail);
		return {
			operation,
			binding: { transition: transitionBinding({ resolution }) },
			importedMediaIds: [],
		};
	}
	return { operation, importedMediaIds: [] };
}

export async function prepareComposeEditorAssets({
	patch,
	client,
	projectId,
	scratchDirectory,
	dependencies,
}: {
	patch: ComposePatch;
	client: EditorApiClient;
	projectId: string;
	scratchDirectory: string;
	dependencies?: Partial<ComposeEditorAssetPreparerDependencies>;
}): Promise<PreparedComposeEditorAssets> {
	const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
	const needsStickerDiscovery = patch.operations.some(
		(operation) =>
			operation.kind === "add-sticker" &&
			parseStickerLabAssetId({ assetId: operation.asset.assetId }) !== null
	);
	const discovery = needsStickerDiscovery
		? resolvedDependencies.discoverStickers({
				rootPath: resolveStickerLabRootOverride({}),
			})
		: Promise.resolve<LocalStickerLabDiscovery>({
				rootPath: "",
				catalogs: [],
				warnings: [],
				summary: {
					batchCount: 0,
					categoryCount: 0,
					itemCount: 0,
					totalBytes: 0,
				},
			});
	const stickerImports = new Map<string, Promise<StickerImportResult>>();
	const sounds = new Map<string, Promise<MaterializedComposeSound | null>>();
	const transitions = new Map<string, Promise<ComposeTransitionResolution>>();
	const results = await Promise.allSettled(
		patch.operations.map((operation) =>
			prepareOperation({
				operation,
				client,
				projectId,
				scratchDirectory,
				discovery,
				stickerImports,
				sounds,
				transitions,
				dependencies: resolvedDependencies,
			})
		)
	);
	const prepared = results.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : []
	);
	const importedMediaIds = [
		...new Set(prepared.flatMap((result) => result.importedMediaIds)),
	];
	const failures = results.flatMap((result) =>
		result.status === "rejected" ? [errorMessage({ error: result.reason })] : []
	);
	if (failures.length > 0) {
		const cause = new Error(failures.join("; "));
		await resolvedDependencies.rollbackStickerMedia({
			cause,
			client,
			context: "Compose editor asset preparation failed",
			mediaIds: importedMediaIds,
			projectId,
		});
		throw cause;
	}
	const bindings: ComposeEditorAssetBindings = {};
	for (const result of prepared) {
		if (result.binding) bindings[result.operation.id] = result.binding;
	}
	return {
		patch: { ...patch, operations: prepared.map((result) => result.operation) },
		bindings,
		importedMediaIds,
	};
}
