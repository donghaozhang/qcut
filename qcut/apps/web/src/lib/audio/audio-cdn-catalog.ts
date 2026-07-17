import type { SoundEffect } from "@/types/sounds";

/**
 * CDN audio catalog.
 *
 * The bundled catalog (BUILT_IN_AUDIO) covers a small seed library; the CDN
 * manifest scales the library past the installer without shipping audio in
 * the app. Tracks download on demand through the shared asset resource cache.
 *
 * Manifests are produced by apps/web/scripts/release-audio-cdn.ts and
 * validated by apps/web/scripts/verify-audio-cdn-manifest.ts.
 */

export const AUDIO_CDN_MANIFEST_VERSION = 1;

/**
 * CDN track IDs live at or below this bound so they can never collide with
 * bundled tracks (-1000s) or Freesound results (positive IDs).
 */
export const AUDIO_CDN_TRACK_ID_MAX = -100_000;

const CACHE_STORAGE_KEY = "qcut-audio-cdn-manifest-v1";
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface AudioCdnTrack {
	id: number;
	kind: "music" | "sound-effect";
	name: string;
	localizedName?: string;
	description?: string;
	localizedDescription?: string;
	tags: string[];
	duration: number;
	previewUrl: string;
	downloadUrl?: string;
	artworkUrl?: string;
	artworkColors?: readonly [string, string];
	bpm?: number;
	musicalKey?: string;
	moods?: string[];
	scenes?: string[];
	loopable?: boolean;
	downloads?: number;
	license?: string;
	username?: string;
	created?: string;
}

export interface AudioCdnManifest {
	version: typeof AUDIO_CDN_MANIFEST_VERSION;
	generatedAt: string;
	tracks: AudioCdnTrack[];
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function optionalString({ value }: { value: unknown }): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber({ value }: { value: unknown }): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function stringArray({ value }: { value: unknown }): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

// Plain parameter: TS1230 forbids type predicates on destructured bindings.
function isAbsoluteHttpUrl(value: unknown): value is string {
	return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function parseAudioCdnTrack({
	value,
}: {
	value: unknown;
}): AudioCdnTrack | null {
	const record = asRecord({ value });
	if (
		!record ||
		typeof record.id !== "number" ||
		!Number.isInteger(record.id) ||
		record.id > AUDIO_CDN_TRACK_ID_MAX ||
		(record.kind !== "music" && record.kind !== "sound-effect") ||
		typeof record.name !== "string" ||
		!record.name.trim() ||
		typeof record.duration !== "number" ||
		!Number.isFinite(record.duration) ||
		record.duration <= 0 ||
		!isAbsoluteHttpUrl(record.previewUrl)
	) {
		return null;
	}
	const artworkColors = Array.isArray(record.artworkColors)
		? record.artworkColors
		: undefined;
	return {
		id: record.id,
		kind: record.kind,
		name: record.name,
		localizedName: optionalString({ value: record.localizedName }),
		description: optionalString({ value: record.description }),
		localizedDescription: optionalString({
			value: record.localizedDescription,
		}),
		tags: stringArray({ value: record.tags }),
		duration: record.duration,
		previewUrl: record.previewUrl,
		downloadUrl: isAbsoluteHttpUrl(record.downloadUrl)
			? record.downloadUrl
			: undefined,
		artworkUrl: isAbsoluteHttpUrl(record.artworkUrl)
			? record.artworkUrl
			: undefined,
		artworkColors:
			artworkColors &&
			artworkColors.length === 2 &&
			typeof artworkColors[0] === "string" &&
			typeof artworkColors[1] === "string"
				? [artworkColors[0], artworkColors[1]]
				: undefined,
		bpm: optionalNumber({ value: record.bpm }),
		musicalKey: optionalString({ value: record.musicalKey }),
		moods: stringArray({ value: record.moods }),
		scenes: stringArray({ value: record.scenes }),
		loopable:
			typeof record.loopable === "boolean" ? record.loopable : undefined,
		downloads: optionalNumber({ value: record.downloads }),
		license: optionalString({ value: record.license }),
		username: optionalString({ value: record.username }),
		created: optionalString({ value: record.created }),
	};
}

export function parseAudioCdnManifest({
	value,
}: {
	value: unknown;
}): AudioCdnManifest | null {
	const record = asRecord({ value });
	if (
		!record ||
		record.version !== AUDIO_CDN_MANIFEST_VERSION ||
		typeof record.generatedAt !== "string" ||
		!Array.isArray(record.tracks)
	) {
		return null;
	}
	const tracks = record.tracks
		.map((track) => parseAudioCdnTrack({ value: track }))
		.filter((track): track is AudioCdnTrack => track !== null);
	return {
		version: AUDIO_CDN_MANIFEST_VERSION,
		generatedAt: record.generatedAt,
		tracks,
	};
}

export function cdnTrackToSoundEffect({
	track,
	generatedAt,
}: {
	track: AudioCdnTrack;
	generatedAt: string;
}): SoundEffect {
	return {
		id: track.id,
		name: track.name,
		localizedName: track.localizedName,
		description: track.description ?? "",
		localizedDescription: track.localizedDescription,
		url: track.previewUrl,
		previewUrl: track.previewUrl,
		downloadUrl: track.downloadUrl ?? track.previewUrl,
		duration: track.duration,
		filesize: 0,
		type: track.previewUrl.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
		channels: 2,
		bitrate: 0,
		bitdepth: 16,
		samplerate: 44_100,
		username: track.username ?? "QCut Studio",
		tags: [...track.tags, track.kind],
		license: track.license ?? "qcut://license/built-in",
		created: track.created ?? generatedAt,
		downloads: track.downloads ?? 0,
		rating: 5,
		ratingCount: 1,
		source: "qcut",
		kind: track.kind,
		artworkColors: track.artworkColors,
		artworkUrl: track.artworkUrl,
		bpm: track.bpm,
		musicalKey: track.musicalKey,
		moods: track.moods,
		scenes: track.scenes,
		loopable: track.loopable,
	};
}

export function resolveAudioCdnManifestUrl(): string | undefined {
	const env =
		typeof import.meta !== "undefined"
			? (import.meta.env as Record<string, unknown> | undefined)
			: undefined;
	const url = env?.VITE_AUDIO_CDN_MANIFEST_URL;
	return isAbsoluteHttpUrl(url) ? url : undefined;
}

interface CachedManifest {
	storedAt: number;
	manifest: AudioCdnManifest;
}

function readCachedManifest(): CachedManifest | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(CACHE_STORAGE_KEY);
		if (!raw) return null;
		const record = asRecord({ value: JSON.parse(raw) });
		if (!record || typeof record.storedAt !== "number") return null;
		const manifest = parseAudioCdnManifest({ value: record.manifest });
		if (!manifest) return null;
		return { storedAt: record.storedAt, manifest };
	} catch {
		return null;
	}
}

function writeCachedManifest({ cached }: { cached: CachedManifest }): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cached));
	} catch {
		// Cache persistence is best-effort.
	}
}

function manifestToSounds({
	manifest,
}: {
	manifest: AudioCdnManifest;
}): SoundEffect[] {
	return manifest.tracks.map((track) =>
		cdnTrackToSoundEffect({ track, generatedAt: manifest.generatedAt })
	);
}

/**
 * Load the CDN catalog as SoundEffect entries. Returns [] when no manifest
 * URL is configured or the manifest cannot be fetched/parsed; a stale cached
 * manifest is used as a fallback when the network fails.
 */
export async function loadAudioCdnCatalog({
	fetchImpl = fetch,
	now = () => Date.now(),
}: {
	fetchImpl?: typeof fetch;
	now?: () => number;
} = {}): Promise<SoundEffect[]> {
	const manifestUrl = resolveAudioCdnManifestUrl();
	if (!manifestUrl) return [];

	const cached = readCachedManifest();
	if (cached && now() - cached.storedAt < CACHE_TTL_MS) {
		return manifestToSounds({ manifest: cached.manifest });
	}

	// Bound the request so a stalled fetch falls through to the stale cache
	// instead of leaving the catalog empty for the session.
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15_000);
	try {
		const response = await fetchImpl(manifestUrl, {
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Manifest request failed: ${response.status}`);
		}
		const manifest = parseAudioCdnManifest({ value: await response.json() });
		if (!manifest) throw new Error("Manifest failed validation");
		writeCachedManifest({ cached: { storedAt: now(), manifest } });
		return manifestToSounds({ manifest });
	} catch {
		return cached ? manifestToSounds({ manifest: cached.manifest }) : [];
	} finally {
		clearTimeout(timeoutId);
	}
}
