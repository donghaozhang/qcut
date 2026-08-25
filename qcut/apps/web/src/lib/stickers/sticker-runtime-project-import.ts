import type { AssetManifestEntry } from "@qcut/editor-core";
import type { MediaItem, MediaStore } from "@/stores/media/media-store-types";
import { createStickerMediaUrl } from "./sticker-resource";
import type { PreparedStickerRuntimePackage } from "./sticker-runtime-package";

export interface RegisteredStickerRuntimePackage {
	createdMediaIds: string[];
	resourceMediaIds: Record<string, string>;
}

function resourceMediaId({
	asset,
	resourceName,
}: {
	asset: Pick<AssetManifestEntry, "id" | "version">;
	resourceName: string;
}): string {
	return `sticker-runtime:${asset.id}@${asset.version}:${resourceName}`;
}

function assertReusableResource({
	existing,
	mediaType,
	resourceName,
}: {
	existing: MediaItem;
	mediaType: MediaItem["type"];
	resourceName: string;
}): void {
	if (
		existing.type !== mediaType ||
		existing.metadata?.stickerRuntimeResourceName !== resourceName
	) {
		throw new Error(`Sticker runtime resource ID collision: ${existing.id}`);
	}
}

async function removeCreatedResources({
	mediaIds,
	projectId,
	removeMediaItem,
}: {
	mediaIds: readonly string[];
	projectId: string;
	removeMediaItem: MediaStore["removeMediaItem"];
}): Promise<void> {
	await Promise.allSettled(
		mediaIds.map((mediaId) => removeMediaItem(projectId, mediaId))
	);
}

export async function registerStickerRuntimePackageResources({
	addMediaItem,
	asset,
	existingMediaItems,
	projectId,
	removeMediaItem,
	runtimePackage,
}: {
	addMediaItem: MediaStore["addMediaItem"];
	asset: Pick<AssetManifestEntry, "id" | "version">;
	existingMediaItems: readonly MediaItem[];
	projectId: string;
	removeMediaItem: MediaStore["removeMediaItem"];
	runtimePackage: PreparedStickerRuntimePackage;
}): Promise<RegisteredStickerRuntimePackage> {
	const existingById = new Map(
		existingMediaItems.map((mediaItem) => [mediaItem.id, mediaItem])
	);
	const newResources = runtimePackage.resources.flatMap((resource) => {
		const id = resourceMediaId({
			asset,
			resourceName: resource.resourceName,
		});
		const existing = existingById.get(id);
		if (existing) {
			assertReusableResource({
				existing,
				mediaType: resource.mediaType,
				resourceName: resource.resourceName,
			});
			return [];
		}
		return [{ id, resource }];
	});
	const attemptedMediaIds = newResources.map(({ id }) => id);
	const createdObjectUrls: string[] = [];
	const creationResults = await Promise.allSettled(
		newResources.map(async ({ id, resource }) => {
			const mediaUrl = await createStickerMediaUrl({ blob: resource.file });
			if (mediaUrl.revoke) createdObjectUrls.push(mediaUrl.url);
			const createdId = await addMediaItem(projectId, {
				id,
				file: resource.file,
				name: resource.file.name,
				type: resource.mediaType,
				url: mediaUrl.url,
				metadata: {
					source: "sticker-runtime-resource",
					stickerAssetId: asset.id,
					stickerAssetVersion: asset.version,
					stickerRuntimeResourceName: resource.resourceName,
					stickerRuntimeSourceUrl: resource.sourceUrl,
				},
			});
			return {
				createdId,
				resourceName: resource.resourceName,
			};
		})
	);
	const failedCreation = creationResults.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	if (failedCreation) {
		await removeCreatedResources({
			mediaIds: attemptedMediaIds,
			projectId,
			removeMediaItem,
		});
		for (const url of createdObjectUrls) URL.revokeObjectURL(url);
		throw failedCreation.reason;
	}
	const created = creationResults.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : []
	);
	const createdMediaIds = created.map((result) => result.createdId);
	const resourceMediaIds: Record<string, string> = {};
	for (const resource of runtimePackage.resources) {
		const id = resourceMediaId({
			asset,
			resourceName: resource.resourceName,
		});
		const existing = existingById.get(id);
		const createdResource = created.find(
			(candidate) => candidate.resourceName === resource.resourceName
		);
		resourceMediaIds[resource.resourceName] =
			existing?.id ?? createdResource?.createdId ?? id;
	}
	return { createdMediaIds, resourceMediaIds };
}

export async function rollbackStickerRuntimePackageResources({
	mediaIds,
	projectId,
	removeMediaItem,
}: {
	mediaIds: readonly string[];
	projectId: string;
	removeMediaItem: MediaStore["removeMediaItem"];
}): Promise<void> {
	await removeCreatedResources({ mediaIds, projectId, removeMediaItem });
}
