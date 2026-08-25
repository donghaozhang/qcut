import type { MediaItem } from "@/stores/media/media-store-types";

export const STICKER_RUNTIME_PRIMARY_SOURCE = "$primary" as const;
export const STICKER_RUNTIME_RESOURCE_PREFIX = "$resource:" as const;

const RESOURCE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export class StickerRuntimeAssetReferenceError extends Error {
	readonly code = "QCUT_STICKER_RUNTIME_ASSET_REFERENCE" as const;

	constructor({ message }: { message: string }) {
		super(`[QCUT_STICKER_RUNTIME_ASSET_REFERENCE] ${message}`);
		this.name = "StickerRuntimeAssetReferenceError";
	}
}

function requiredResourceName({ source }: { source: string }): string {
	if (!source.startsWith(STICKER_RUNTIME_RESOURCE_PREFIX)) {
		throw new StickerRuntimeAssetReferenceError({
			message:
				"Secondary runtime sources must use a persisted $resource:<name> reference",
		});
	}
	const resourceName = source.slice(STICKER_RUNTIME_RESOURCE_PREFIX.length);
	if (!RESOURCE_NAME_PATTERN.test(resourceName)) {
		throw new StickerRuntimeAssetReferenceError({
			message: `Invalid runtime resource reference: ${source}`,
		});
	}
	return resourceName;
}

function requiredResourceMediaId({
	mediaItem,
	resourceName,
}: {
	mediaItem: MediaItem;
	resourceName: string;
}): string {
	const resources = mediaItem.metadata?.stickerRuntimeResources;
	const mediaId = resources?.[resourceName];
	if (typeof mediaId !== "string" || mediaId.length === 0) {
		throw new StickerRuntimeAssetReferenceError({
			message: `Runtime resource is not registered: ${resourceName}`,
		});
	}
	return mediaId;
}

export function resolveStickerRuntimeSourceMediaItem({
	mediaItem,
	mediaItemsById,
	source,
}: {
	mediaItem: MediaItem;
	mediaItemsById: ReadonlyMap<string, MediaItem>;
	source?: string;
}): MediaItem {
	if (!source || source === STICKER_RUNTIME_PRIMARY_SOURCE) return mediaItem;
	const resourceName = requiredResourceName({ source });
	const mediaId = requiredResourceMediaId({ mediaItem, resourceName });
	const resource = mediaItemsById.get(mediaId);
	if (!resource) {
		throw new StickerRuntimeAssetReferenceError({
			message: `Runtime resource media is unavailable: ${resourceName}`,
		});
	}
	return resource;
}
