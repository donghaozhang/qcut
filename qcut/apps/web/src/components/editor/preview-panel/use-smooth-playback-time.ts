import { useEffect, useState } from "react";

/**
 * Continuous playback time (seconds) sourced from per-frame
 * "playback-update" events.
 *
 * The subscription is gated: when `enabled` is false nothing on the canvas
 * needs per-frame React updates, so no listener is attached and the hook
 * returns `fallbackTime` — playback then runs without re-rendering the
 * preview tree every animation frame (video/audio elements keep syncing via
 * window events, see playback-store).
 *
 * `fallbackTime` should be the coarse playback time (boundary-crossing
 * `playbackTime` while playing, store `currentTime` otherwise) so consumers
 * stay consistent across enable/disable flips.
 */
export function useSmoothPlaybackTime({
	isPlaying,
	enabled,
	fallbackTime,
}: {
	isPlaying: boolean;
	enabled: boolean;
	fallbackTime: number;
}): number {
	const [smoothTime, setSmoothTime] = useState(fallbackTime);
	const active = isPlaying && enabled;

	useEffect(() => {
		if (!active) {
			setSmoothTime(fallbackTime);
			return;
		}
		// On enable flips mid-playback the stored time may predate the render
		// that enabled us; never move backwards past the fresh fallback.
		setSmoothTime((previous) =>
			fallbackTime > previous ? fallbackTime : previous
		);
		const handleUpdate = (event: Event) => {
			setSmoothTime((event as CustomEvent).detail.time as number);
		};
		window.addEventListener("playback-update", handleUpdate);
		return () => window.removeEventListener("playback-update", handleUpdate);
	}, [active, fallbackTime]);

	return active ? smoothTime : fallbackTime;
}
