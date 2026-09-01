import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

/** Default on-screen life of an overlay added from the media panel. */
const DEFAULT_OVERLAY_SECONDS = 5;

export interface AddMediaOverlayResult {
	success: boolean;
	/** Set on success. */
	stickerId?: string;
	/** User-facing reason on failure. */
	error?: string;
}

/**
 * Adds a media item as an overlay sticker, backed by a timeline element.
 *
 * The timeline `StickerElement` is the owner of record for sticker timing and
 * visuals; an overlay-store entry without one is an orphan that
 * `getVisibleStickersAtTime` treats as always visible, so it gets burned into
 * every exported frame with no start/end. Every other add path already pairs
 * the two — this helper brings the media panel's "Add as Overlay" action in
 * line, and rolls the overlay entry back if the timeline insert fails so the
 * orphan can never be created.
 */
export async function addMediaItemAsOverlay({
	mediaItemId,
}: {
	mediaItemId: string;
}): Promise<AddMediaOverlayResult> {
	const { addOverlaySticker, removeOverlaySticker } =
		useStickersOverlayStore.getState();
	const { currentTime } = usePlaybackStore.getState();
	const { getTotalDuration } = useTimelineStore.getState();

	const totalDuration = getTotalDuration();
	if (totalDuration <= 0) {
		return { error: "Add media to timeline first", success: false };
	}

	const start = Math.max(0, Math.min(currentTime, totalDuration - 0.1));
	const end = Math.min(start + DEFAULT_OVERLAY_SECONDS, totalDuration);

	let stickerId: string | undefined;
	try {
		stickerId = addOverlaySticker(mediaItemId, {});
		const sticker = useStickersOverlayStore
			.getState()
			.overlayStickers.get(stickerId);
		if (!sticker) {
			return { error: "Could not create the overlay", success: false };
		}
		const { timelineStickerIntegration } = await import(
			"./timeline-sticker-integration"
		);
		const result = await timelineStickerIntegration.addStickerToTimeline(
			sticker,
			start,
			end - start
		);
		if (!result.success) {
			removeOverlaySticker(stickerId);
			return {
				error: result.error ?? "Failed to add the overlay to the timeline",
				success: false,
			};
		}
		return { stickerId, success: true };
	} catch (error) {
		// The overlay entry must not outlive a failed timeline insert; when the
		// creation itself threw there is nothing to clean up.
		if (stickerId !== undefined) removeOverlaySticker(stickerId);
		return {
			error: error instanceof Error ? error.message : String(error),
			success: false,
		};
	}
}
