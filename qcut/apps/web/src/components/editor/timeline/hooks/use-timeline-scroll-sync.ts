import { useEffect, useRef } from "react";
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
	const isUpdatingRef = useRef(false);
	const lastRulerSync = useRef(0);
	const lastTracksSync = useRef(0);
	const lastVerticalSync = useRef(0);

	// --- Scroll synchronization effect ---
	// Re-runs when mediaStoreLoading changes because the component renders a
	// loading spinner (early return) until the store is ready, so refs are null
	// on the first effect run. Without this dependency the listeners never attach.
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
			const now = Date.now();
			if (isUpdatingRef.current || now - lastRulerSync.current < 16) return;
			lastRulerSync.current = now;
			isUpdatingRef.current = true;
			tracksViewport.scrollLeft = rulerViewport.scrollLeft;
			isUpdatingRef.current = false;
		};
		const handleTracksScroll = () => {
			const now = Date.now();
			if (isUpdatingRef.current || now - lastTracksSync.current < 16) return;
			lastTracksSync.current = now;
			isUpdatingRef.current = true;
			rulerViewport.scrollLeft = tracksViewport.scrollLeft;
			isUpdatingRef.current = false;
		};

		rulerViewport.addEventListener("scroll", handleRulerScroll);
		tracksViewport.addEventListener("scroll", handleTracksScroll);

		// Vertical scroll synchronization between track labels and tracks content
		if (trackLabelsViewport) {
			const handleTrackLabelsScroll = () => {
				const now = Date.now();
				if (isUpdatingRef.current || now - lastVerticalSync.current < 16)
					return;
				lastVerticalSync.current = now;
				isUpdatingRef.current = true;
				tracksViewport.scrollTop = trackLabelsViewport.scrollTop;
				isUpdatingRef.current = false;
			};
			const handleTracksVerticalScroll = () => {
				const now = Date.now();
				if (isUpdatingRef.current || now - lastVerticalSync.current < 16)
					return;
				lastVerticalSync.current = now;
				isUpdatingRef.current = true;
				trackLabelsViewport.scrollTop = tracksViewport.scrollTop;
				isUpdatingRef.current = false;
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
