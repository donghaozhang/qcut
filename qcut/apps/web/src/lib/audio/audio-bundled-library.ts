import type { SoundEffect } from "@/types/sounds";
import {
	cdnTrackToSoundEffect,
	parseAudioCdnManifest,
} from "./audio-cdn-catalog";

/**
 * Bundled music library.
 *
 * BUILT_IN_AUDIO ships a small seed of short QCut-authored loops; this
 * manifest carries the full browsable catalog of Creative Commons songs
 * harvested by apps/web/scripts/harvest-openverse-audio.ts. Only the metadata
 * ships with the app — audio and artwork stream from the source CDN and are
 * cached on first use through the shared asset resource cache, so the
 * installer stays small.
 *
 * The manifest is a static asset rather than a bundled import so it never
 * lands in the JS bundle; it is fetched once, lazily, when the audio panel
 * first mounts.
 */

export const BUNDLED_AUDIO_LIBRARY_URL = "/audio/library/manifest.json";

let inflight: Promise<SoundEffect[]> | null = null;

async function fetchBundledLibrary({
	fetchImpl,
	url,
}: {
	fetchImpl: typeof fetch;
	url: string;
}): Promise<SoundEffect[]> {
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(
			`Bundled audio manifest request failed: ${response.status}`
		);
	}
	const manifest = parseAudioCdnManifest({ value: await response.json() });
	if (!manifest) throw new Error("Bundled audio manifest failed validation");
	return manifest.tracks.map((track) =>
		cdnTrackToSoundEffect({ track, generatedAt: manifest.generatedAt })
	);
}

/**
 * Load the bundled catalog, memoized for the session. Resolves to [] when the
 * manifest is missing or malformed so the library degrades to the seed
 * catalog plus live search rather than failing to render.
 */
export function loadBundledAudioLibrary({
	fetchImpl = fetch,
	url = BUNDLED_AUDIO_LIBRARY_URL,
}: {
	fetchImpl?: typeof fetch;
	url?: string;
} = {}): Promise<SoundEffect[]> {
	inflight ??= fetchBundledLibrary({ fetchImpl, url }).catch(() => []);
	return inflight;
}

/** Test seam: drop the memoized result. */
export function resetBundledAudioLibraryCache(): void {
	inflight = null;
}
