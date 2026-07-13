import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";

export type MediaLibrarySort = "name" | "recent" | "duration" | "type";

export function sortMediaLibraryItems({
	items,
	sortBy,
}: {
	items: MediaItem[];
	sortBy: MediaLibrarySort;
}) {
	return [...items].sort((left, right) => {
		if (sortBy === "recent") {
			return (right.file.lastModified ?? 0) - (left.file.lastModified ?? 0);
		}
		if (sortBy === "duration") {
			return (right.duration ?? 0) - (left.duration ?? 0);
		}
		if (sortBy === "type") {
			const typeComparison = left.type.localeCompare(right.type);
			return typeComparison || left.name.localeCompare(right.name);
		}
		return left.name.localeCompare(right.name);
	});
}

export function getMediaUsageCounts({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Map<string, number> {
	const counts = new Map<string, number>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type !== "media" && element.type !== "sticker") continue;
			counts.set(element.mediaId, (counts.get(element.mediaId) ?? 0) + 1);
		}
	}
	return counts;
}
