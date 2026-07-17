import { useEffect, useState } from "react";
import { loadAudioCdnCatalog } from "@/lib/audio/audio-cdn-catalog";
import type { SoundEffect } from "@/types/sounds";

/**
 * Load the CDN audio catalog once per mount. Resolves to [] when no manifest
 * URL is configured, so the library silently falls back to the bundled
 * catalog offline.
 */
export function useAudioCdnCatalog(): SoundEffect[] {
	const [tracks, setTracks] = useState<SoundEffect[]>([]);

	useEffect(() => {
		let cancelled = false;
		void loadAudioCdnCatalog().then((catalog) => {
			if (!cancelled && catalog.length > 0) setTracks(catalog);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return tracks;
}
