import { useEffect, useState } from "react";
import { loadBundledAudioLibrary } from "@/lib/audio/audio-bundled-library";
import { loadAudioCdnCatalog } from "@/lib/audio/audio-cdn-catalog";
import type { SoundEffect } from "@/types/sounds";

/**
 * Catalog tracks beyond the BUILT_IN_AUDIO seed: the bundled Creative Commons
 * music manifest plus the optional remote CDN catalog. Both resolve to [] when
 * unavailable, so the library degrades to the seed catalog and live search
 * rather than failing to render.
 */
export function useExtendedAudioCatalog(): SoundEffect[] {
	const [tracks, setTracks] = useState<SoundEffect[]>([]);

	useEffect(() => {
		let cancelled = false;
		void Promise.all([loadBundledAudioLibrary(), loadAudioCdnCatalog()]).then(
			([bundled, cdn]) => {
				if (cancelled) return;
				const seen = new Set(bundled.map((track) => track.id));
				const merged = [
					...bundled,
					...cdn.filter((track) => !seen.has(track.id)),
				];
				if (merged.length > 0) setTracks(merged);
			}
		);
		return () => {
			cancelled = true;
		};
	}, []);

	return tracks;
}
