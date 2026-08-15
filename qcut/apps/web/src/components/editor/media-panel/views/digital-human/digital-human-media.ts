import type { MediaItem } from "@/stores/media/media-store";

export interface DigitalHumanImage {
	id: string;
	name: string;
	/** Null when the item has no renderable preview yet (still processing). */
	previewUrl: string | null;
}

/**
 * Project images usable as a figure or a background. Videos and audio are
 * excluded: both slots feed an image input on every avatar model we have.
 */
export function selectDigitalHumanImages({
	mediaItems,
}: {
	mediaItems: readonly MediaItem[];
}): DigitalHumanImage[] {
	return mediaItems
		.filter((item) => item.type === "image")
		.map((item) => ({
			id: item.id,
			name: item.name,
			previewUrl: item.thumbnailUrl || item.url || item.originalUrl || null,
		}));
}
