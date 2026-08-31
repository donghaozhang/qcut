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
import {
	buildExportClipTransitionPlan,
	type ExportClipTransitionPlan,
} from "./export-clip-transitions";

export interface ExportRenderIndex {
	/** Sticker ids owned by timeline sticker elements (overlay excludes them). */
	timelineStickerIds: ReadonlySet<string>;
	/** Media item lookup by id (consumers require the mutable Map type). */
	mediaItemsById: Map<string, MediaItem>;
	/** Which clip transitions render on canvas, natively, or not at all. */
	clipTransitions: ExportClipTransitionPlan;
}

export function buildExportRenderIndex({
	tracks,
	mediaItems,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	tracks: readonly TimelineTrack[];
	mediaItems: readonly MediaItem[];
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
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
	const clipTransitions = buildExportClipTransitionPlan({
		tracks,
		mediaItems,
		fps,
		canvasWidth,
		canvasHeight,
	});
	return { timelineStickerIds, mediaItemsById, clipTransitions };
}
