import fs, { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	LocalStickerLabDiscovery,
	LocalStickerLabReadResult,
	LocalStickerLabReference,
	LocalStickerLabRuntimeResource,
} from "../stickers/local-reference-catalog/index.js";
import type { LocalReferenceManifestItem } from "../stickers/local-reference-catalog/schemas.js";
import type { EditorApiClient } from "./editor-api-client.js";

const STICKER_LAB_PROVIDER = "sticker-lab";
const STICKER_RUNTIME_PRIMARY_SOURCE = "$primary";
const STICKER_RUNTIME_RESOURCE_PREFIX = "$resource:";
const STICKER_RUNTIME_IMPORT_CONCURRENCY = 4;

type LocalRuntimePackage = NonNullable<
	LocalReferenceManifestItem["runtimePackage"]
>;
export type StickerLabRuntimeDescriptor = LocalRuntimePackage["descriptor"];

export interface StickerRuntimeImportDependencies {
	readLocalReference: typeof import("../stickers/local-reference-catalog/index.js").readLocalReference;
}

interface NormalizedRuntimeResource {
	normalizedName: string;
	resource: LocalStickerLabRuntimeResource;
}

export async function importStickerSource({
	client,
	metadata,
	projectId,
	source,
}: {
	client: EditorApiClient;
	metadata?: Record<string, unknown>;
	projectId: string;
	source: string;
}): Promise<string> {
	const importResult = await client.post<{ id?: string; mediaId?: string }>(
		`/api/claude/media/${encodeURIComponent(projectId)}/import`,
		metadata ? { source, metadata } : { source }
	);
	const mediaId = importResult.id ?? importResult.mediaId;
	if (!mediaId) {
		throw new Error("Media import succeeded but no mediaId returned");
	}
	return mediaId;
}

function stickerLabMediaMetadata({
	reference,
	stickerRuntime,
	stickerRuntimeResources,
}: {
	reference: LocalStickerLabReadResult;
	stickerRuntime?: StickerLabRuntimeDescriptor;
	stickerRuntimeResources?: Record<string, string>;
}): Record<string, unknown> {
	return {
		source: "sticker-lab",
		animatedSticker:
			stickerRuntime !== undefined || reference.mimeType === "image/gif",
		referenceOnly: true,
		usage: "internal-reference-only",
		redistribution: "prohibited",
		batchId: reference.batchId,
		itemId: reference.stickerId,
		checksumSha256: reference.checksumSha256,
		...(stickerRuntime ? { stickerRuntime } : {}),
		...(stickerRuntimeResources &&
		Object.keys(stickerRuntimeResources).length > 0
			? { stickerRuntimeResources }
			: {}),
	};
}

function stickerLabRuntimeResourceMetadata({
	reference,
	resourceName,
	sourceUrl,
}: {
	reference: LocalStickerLabReadResult;
	resourceName: string;
	sourceUrl: string;
}): Record<string, unknown> {
	return {
		source: "sticker-runtime-resource",
		referenceOnly: true,
		usage: "internal-reference-only",
		redistribution: "prohibited",
		batchId: reference.batchId,
		itemId: reference.stickerId,
		checksumSha256: reference.checksumSha256,
		stickerAssetId: `${STICKER_LAB_PROVIDER}:${reference.batchId}:${reference.stickerId}`,
		stickerAssetVersion: 1,
		stickerRuntimeResourceName: resourceName,
		stickerRuntimeSourceUrl: sourceUrl,
	};
}

function materializeLocalReference({
	fileName,
	reference,
}: {
	fileName?: string;
	reference: LocalStickerLabReadResult;
}): { path: string; cleanup: () => void } {
	const outputDirectory = mkdtempSync(
		join(tmpdir(), "qcut-editor-sticker-lab-")
	);
	try {
		const outputPath = join(outputDirectory, fileName ?? reference.fileName);
		fs.writeFileSync(outputPath, reference.bytes, {
			flag: "wx",
			mode: 0o600,
		});
		return {
			path: outputPath,
			cleanup: () => rmSync(outputDirectory, { recursive: true, force: true }),
		};
	} catch (error) {
		rmSync(outputDirectory, { recursive: true, force: true });
		throw error;
	}
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

export async function rollbackStickerLabMedia({
	cause,
	client,
	context,
	mediaIds,
	projectId,
}: {
	cause: unknown;
	client: EditorApiClient;
	context: string;
	mediaIds: readonly string[];
	projectId: string;
}): Promise<void> {
	const uniqueMediaIds = [...new Set(mediaIds)].reverse();
	const results = await Promise.allSettled(
		uniqueMediaIds.map(async (mediaId) => {
			const deleted = await client.delete<boolean>(
				`/api/claude/media/${encodeURIComponent(projectId)}/${encodeURIComponent(mediaId)}`
			);
			if (!deleted) {
				throw new Error(`Media rollback did not delete ${mediaId}`);
			}
		})
	);
	const rollbackErrors = results.flatMap((result) =>
		result.status === "rejected" ? [errorMessage({ error: result.reason })] : []
	);
	if (rollbackErrors.length === 0) return;
	throw new Error(
		`${context}: ${errorMessage({ error: cause })}. Imported media rollback also failed: ${rollbackErrors.join("; ")}`
	);
}

function findDiscoveredStickerReference({
	batchId,
	discovery,
	stickerId,
}: {
	batchId: string;
	discovery: LocalStickerLabDiscovery;
	stickerId: string;
}): LocalStickerLabReference | undefined {
	const catalog = discovery.catalogs.find(
		(candidate) => candidate.batchId === batchId
	);
	return catalog?.categories
		.flatMap((category) => category.items)
		.find((item) => item.id === stickerId);
}

function assertPrimaryReferenceMatches({
	discovered,
	reference,
}: {
	discovered: LocalStickerLabReference;
	reference: LocalStickerLabReadResult;
}): void {
	const mismatchedFields = [
		reference.batchId === discovered.asset.batchId ? null : "batchId",
		reference.stickerId === discovered.asset.stickerId ? null : "stickerId",
		reference.checksumSha256 === discovered.asset.checksumSha256
			? null
			: "checksumSha256",
		reference.fileName === discovered.fileName ? null : "fileName",
		reference.mimeType === discovered.mimeType ? null : "mimeType",
		reference.bytes.byteLength === discovered.asset.byteSize
			? null
			: "byteSize",
	].filter((field): field is string => field !== null);
	if (mismatchedFields.length > 0) {
		throw new Error(
			`Local sticker reference verification failed: ${discovered.id} (${mismatchedFields.join(", ")})`
		);
	}
}

function assertRuntimeResourceMatches({
	discovered,
	primary,
	reference,
}: {
	discovered: LocalStickerLabRuntimeResource;
	primary: LocalStickerLabReference;
	reference: LocalStickerLabReadResult;
}): void {
	const mismatchedFields = [
		reference.batchId === primary.asset.batchId ? null : "batchId",
		reference.stickerId === primary.asset.stickerId ? null : "stickerId",
		reference.resourceName === discovered.resourceName ? null : "resourceName",
		reference.checksumSha256 === discovered.asset.checksumSha256
			? null
			: "checksumSha256",
		reference.fileName === discovered.fileName ? null : "fileName",
		reference.mimeType === discovered.mimeType ? null : "mimeType",
		reference.bytes.byteLength === discovered.asset.byteSize
			? null
			: "byteSize",
	].filter((field): field is string => field !== null);
	if (mismatchedFields.length > 0) {
		throw new Error(
			`Local sticker runtime resource verification failed: ${primary.id}/${discovered.resourceName} (${mismatchedFields.join(", ")})`
		);
	}
}

function normalizeStickerRuntimePackage({
	reference,
}: {
	reference: LocalStickerLabReference;
}) {
	const runtimePackage = reference.runtimePackage;
	if (!runtimePackage) return;
	const descriptor = runtimePackage.descriptor as StickerLabRuntimeDescriptor;
	const resources = runtimePackage.resources.map((resource, index) => ({
		normalizedName: `asset_${String(index + 1).padStart(4, "0")}`,
		resource,
	}));
	const normalizedNameBySource = new Map(
		resources.map(({ normalizedName, resource }) => [
			resource.resourceName,
			normalizedName,
		])
	);
	const normalizeSource = ({ source }: { source: string }): string => {
		if (
			source === STICKER_RUNTIME_PRIMARY_SOURCE ||
			source === reference.fileName
		) {
			return STICKER_RUNTIME_PRIMARY_SOURCE;
		}
		const normalizedName = normalizedNameBySource.get(source);
		if (!normalizedName) {
			throw new Error(`Sticker runtime source is unavailable: ${source}`);
		}
		return `${STICKER_RUNTIME_RESOURCE_PREFIX}${normalizedName}`;
	};

	let normalizedDescriptor: StickerLabRuntimeDescriptor;
	switch (descriptor.kind) {
		case "atlas-animation":
			normalizedDescriptor = {
				...descriptor,
				atlasSource: normalizeSource({
					source: descriptor.atlasSource ?? STICKER_RUNTIME_PRIMARY_SOURCE,
				}),
			};
			break;
		case "png-sequence":
			normalizedDescriptor = {
				...descriptor,
				frames: descriptor.frames.map((frame) => ({
					...frame,
					source: normalizeSource({ source: frame.source }),
				})),
			};
			break;
		case "alpha-video":
			normalizedDescriptor = {
				...descriptor,
				source: normalizeSource({ source: descriptor.source }),
				layout:
					descriptor.layout.kind === "separate-mask"
						? {
								...descriptor.layout,
								maskSource: normalizeSource({
									source: descriptor.layout.maskSource,
								}),
							}
						: descriptor.layout,
			};
			break;
	}
	return { descriptor: normalizedDescriptor, resources };
}

async function importRuntimeResource({
	client,
	dependencies,
	discoveryRootPath,
	normalizedResource,
	primary,
	projectId,
}: {
	client: EditorApiClient;
	dependencies: StickerRuntimeImportDependencies;
	discoveryRootPath: string;
	normalizedResource: NormalizedRuntimeResource;
	primary: LocalStickerLabReference;
	projectId: string;
}): Promise<string> {
	const { normalizedName, resource } = normalizedResource;
	const reference = await dependencies.readLocalReference({
		rootPath: discoveryRootPath,
		batchId: primary.asset.batchId,
		stickerId: primary.asset.stickerId,
		resourceName: resource.resourceName,
	});
	assertRuntimeResourceMatches({ discovered: resource, primary, reference });
	const materialized = materializeLocalReference({
		fileName: `${normalizedName}-${reference.fileName}`,
		reference,
	});
	try {
		return await importStickerSource({
			client,
			metadata: stickerLabRuntimeResourceMetadata({
				reference,
				resourceName: normalizedName,
				sourceUrl: resource.resourceName,
			}),
			projectId,
			source: materialized.path,
		});
	} finally {
		materialized.cleanup();
	}
}

async function importRuntimeResources({
	client,
	dependencies,
	discoveryRootPath,
	importedMediaIds,
	primary,
	projectId,
	resources,
}: {
	client: EditorApiClient;
	dependencies: StickerRuntimeImportDependencies;
	discoveryRootPath: string;
	importedMediaIds: string[];
	primary: LocalStickerLabReference;
	projectId: string;
	resources: readonly NormalizedRuntimeResource[];
}): Promise<Record<string, string>> {
	const mediaIdByResourceName: Record<string, string> = {};
	let nextIndex = 0;
	let firstError: unknown;
	let hasError = false;
	const worker = async (): Promise<void> => {
		if (hasError) return;
		const normalizedResource = resources[nextIndex];
		nextIndex += 1;
		if (!normalizedResource) return;
		try {
			const mediaId = await importRuntimeResource({
				client,
				dependencies,
				discoveryRootPath,
				normalizedResource,
				primary,
				projectId,
			});
			mediaIdByResourceName[normalizedResource.normalizedName] = mediaId;
			importedMediaIds.push(mediaId);
		} catch (error) {
			if (!hasError) firstError = error;
			hasError = true;
		}
		await worker();
	};
	const workerCount = Math.min(
		STICKER_RUNTIME_IMPORT_CONCURRENCY,
		resources.length
	);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	if (hasError) throw firstError;
	return mediaIdByResourceName;
}

export async function importStickerLabReference({
	batchId,
	client,
	dependencies,
	discovery,
	projectId,
	stickerId,
}: {
	batchId: string;
	client: EditorApiClient;
	dependencies: StickerRuntimeImportDependencies;
	discovery: LocalStickerLabDiscovery;
	projectId: string;
	stickerId: string;
}) {
	const reference = await dependencies.readLocalReference({
		rootPath: discovery.rootPath,
		batchId,
		stickerId,
	});
	const discoveredReference = findDiscoveredStickerReference({
		batchId,
		discovery,
		stickerId,
	});
	if (!discoveredReference) {
		throw new Error(
			`Sticker Lab reference is absent from discovery: ${batchId}/${stickerId}`
		);
	}
	assertPrimaryReferenceMatches({
		discovered: discoveredReference,
		reference,
	});
	const runtimePackage = normalizeStickerRuntimePackage({
		reference: discoveredReference,
	});
	const importedMediaIds: string[] = [];
	try {
		const stickerRuntimeResources = runtimePackage
			? await importRuntimeResources({
					client,
					dependencies,
					discoveryRootPath: discovery.rootPath,
					importedMediaIds,
					primary: discoveredReference,
					projectId,
					resources: runtimePackage.resources,
				})
			: undefined;
		const stickerRuntime = runtimePackage?.descriptor;
		const materialized = materializeLocalReference({ reference });
		let mediaId: string;
		try {
			mediaId = await importStickerSource({
				client,
				metadata: stickerLabMediaMetadata({
					reference,
					stickerRuntime,
					stickerRuntimeResources,
				}),
				projectId,
				source: materialized.path,
			});
			importedMediaIds.push(mediaId);
		} finally {
			materialized.cleanup();
		}
		return {
			importedMediaIds,
			mediaId,
			reference,
			...(stickerRuntime ? { stickerRuntime } : {}),
		};
	} catch (error) {
		await rollbackStickerLabMedia({
			cause: error,
			client,
			context: "Sticker Lab media import failed",
			mediaIds: importedMediaIds,
			projectId,
		});
		throw error;
	}
}
