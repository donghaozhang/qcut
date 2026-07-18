import { useEffect } from "react";
import type { RefObject } from "react";

interface UseTimelineScrollSyncOptions {
	rulerScrollRef: RefObject<HTMLDivElement | null>;
	tracksScrollRef: RefObject<HTMLDivElement | null>;
	trackLabelsScrollRef: RefObject<HTMLDivElement | null>;
	mediaStoreLoading: boolean;
	tracksLength: number;
}

export function useTimelineScrollSync({
	rulerScrollRef,
	tracksScrollRef,
	trackLabelsScrollRef,
	mediaStoreLoading,
	tracksLength,
}: UseTimelineScrollSyncOptions) {
	// --- Scroll synchronization effect ---
	// Re-runs when mediaStoreLoading changes because the component renders a
	// loading spinner (early return) until the store is ready, so refs are null
	// on the first effect run. Without this dependency the listeners never attach.
	//
	// Sync must run on EVERY scroll event: a time-based throttle drops the
	// final event of a gesture, leaving the mirrored pane permanently offset
	// by a few pixels. The 1px threshold breaks the assignment echo loop even
	// when subpixel scroll precision makes strict equality unreachable.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-attach when loading state or track count changes
	useEffect(() => {
		const rulerViewport = rulerScrollRef.current;
		const tracksViewport = tracksScrollRef.current;
		const trackLabelsViewport = trackLabelsScrollRef.current?.querySelector(
			"[data-radix-scroll-area-viewport]"
		) as HTMLElement;

		if (!rulerViewport || !tracksViewport) return;

		// Horizontal scroll synchronization between ruler and tracks
		const handleRulerScroll = () => {
			if (Math.abs(tracksViewport.scrollLeft - rulerViewport.scrollLeft) >= 1) {
				tracksViewport.scrollLeft = rulerViewport.scrollLeft;
			}
		};
		const handleTracksScroll = () => {
			if (Math.abs(rulerViewport.scrollLeft - tracksViewport.scrollLeft) >= 1) {
				rulerViewport.scrollLeft = tracksViewport.scrollLeft;
			}
		};

		rulerViewport.addEventListener("scroll", handleRulerScroll);
		tracksViewport.addEventListener("scroll", handleTracksScroll);

		// Vertical scroll synchronization between track labels and tracks content
		if (trackLabelsViewport) {
			const handleTrackLabelsScroll = () => {
				if (
					Math.abs(tracksViewport.scrollTop - trackLabelsViewport.scrollTop) >=
					1
				) {
					tracksViewport.scrollTop = trackLabelsViewport.scrollTop;
				}
			};
			const handleTracksVerticalScroll = () => {
				if (
					Math.abs(trackLabelsViewport.scrollTop - tracksViewport.scrollTop) >=
					1
				) {
					trackLabelsViewport.scrollTop = tracksViewport.scrollTop;
				}
			};

			trackLabelsViewport.addEventListener("scroll", handleTrackLabelsScroll);
			tracksViewport.addEventListener("scroll", handleTracksVerticalScroll);

			return () => {
				rulerViewport.removeEventListener("scroll", handleRulerScroll);
				tracksViewport.removeEventListener("scroll", handleTracksScroll);
				trackLabelsViewport.removeEventListener(
					"scroll",
					handleTrackLabelsScroll
				);
				tracksViewport.removeEventListener(
					"scroll",
					handleTracksVerticalScroll
				);
			};
		}

		return () => {
			rulerViewport.removeEventListener("scroll", handleRulerScroll);
			tracksViewport.removeEventListener("scroll", handleTracksScroll);
		};
	}, [mediaStoreLoading, tracksLength]);
}
