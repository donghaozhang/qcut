/**
 * Per-export static render index.
 *
 * Tracks and media items are immutable for the duration of one export, but
 * the frame renderer used to rebuild derived structures (sticker id sets,
 * media lookup maps) on every frame — 2,400 times for an 80s export. Build
 * them once here and thread them through the RenderContext instead.
 */

import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";

export interface ExportRenderIndex {
	/** Sticker ids owned by timeline sticker elements (overlay excludes them). */
	timelineStickerIds: ReadonlySet<string>;
	/** Media item lookup by id (consumers require the mutable Map type). */
	mediaItemsById: Map<string, MediaItem>;
}

export function buildExportRenderIndex({
	tracks,
	mediaItems,
}: {
	tracks: readonly TimelineTrack[];
	mediaItems: readonly MediaItem[];
}): ExportRenderIndex {
	const timelineStickerIds = new Set<string>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type === "sticker") {
				timelineStickerIds.add(element.stickerId);
			}
		}
	}
	const mediaItemsById = new Map<string, MediaItem>();
	for (const item of mediaItems) {
		mediaItemsById.set(item.id, item);
	}
	return { timelineStickerIds, mediaItemsById };
}
