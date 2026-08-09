import type { TimelineTrack } from "@/types/timeline";
import type { SelectedElement, SelectedTransition } from "./types";

// Lazy playback-store access: playback-store dynamically imports the
// timeline store, so a static import here would close a module cycle.
type PlaybackStoreHook =
	typeof import("@/stores/editor/playback-store")["usePlaybackStore"];

let _playbackStore: PlaybackStoreHook | null = null;
import("@/stores/editor/playback-store")
	.then((module) => {
		_playbackStore = module.usePlaybackStore;
	})
	.catch((error) => {
		console.error("Failed to pre-load playback store:", error);
	});

/**
 * Transactional history snapshot (QTL-004). A history entry restores the
 * complete editing context of a command — tracks, selection, selected
 * transition, and the playhead — not just the track array.
 */
export interface TimelineHistorySnapshot {
	tracks: TimelineTrack[];
	selectedElements: SelectedElement[];
	selectedTransition: SelectedTransition | null;
	playheadTime: number;
}

/** Deep-copied snapshot of the current editing context. */
export function captureTimelineHistorySnapshot({
	tracks,
	selectedElements,
	selectedTransition,
}: {
	tracks: TimelineTrack[];
	selectedElements: SelectedElement[];
	selectedTransition: SelectedTransition | null;
}): TimelineHistorySnapshot {
	return {
		...JSON.parse(
			JSON.stringify({ tracks, selectedElements, selectedTransition })
		),
		playheadTime: _playbackStore?.getState().currentTime ?? 0,
	};
}

/** Restore the playhead captured with a snapshot. */
export function restoreTimelinePlayhead({
	snapshot,
}: {
	snapshot: TimelineHistorySnapshot;
}): void {
	_playbackStore?.getState().seek(snapshot.playheadTime);
}
