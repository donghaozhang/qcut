import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUDIO_CDN_MANIFEST_VERSION,
	cdnTrackToSoundEffect,
	loadAudioCdnCatalog,
	parseAudioCdnManifest,
	parseAudioCdnTrack,
} from "../audio-cdn-catalog";

const VALID_TRACK = {
	id: -100001,
	kind: "music",
	name: "City Dawn",
	localizedName: "城市黎明",
	tags: ["synth", "city"],
	duration: 96,
	previewUrl: "https://assets.qcut.app/audio/tracks/city-dawn.ogg",
	artworkUrl: "https://assets.qcut.app/audio/artwork/city-dawn.webp",
	bpm: 92,
	loopable: true,
	downloads: 12,
} as const;

function manifestWith({ tracks }: { tracks: unknown[] }): unknown {
	return {
		version: AUDIO_CDN_MANIFEST_VERSION,
		generatedAt: "2026-07-17T00:00:00.000Z",
		tracks,
	};
}

describe("audio cdn catalog", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("parses valid tracks and rejects malformed ones", () => {
		expect(parseAudioCdnTrack({ value: VALID_TRACK })).toMatchObject({
			id: -100001,
			kind: "music",
			previewUrl: VALID_TRACK.previewUrl,
		});
		// IDs must stay in the reserved CDN range.
		expect(parseAudioCdnTrack({ value: { ...VALID_TRACK, id: 5 } })).toBeNull();
		expect(
			parseAudioCdnTrack({ value: { ...VALID_TRACK, id: -1001 } })
		).toBeNull();
		// Preview URLs must be absolute.
		expect(
			parseAudioCdnTrack({
				value: { ...VALID_TRACK, previewUrl: "/audio/builtin/foo.ogg" },
			})
		).toBeNull();
		expect(
			parseAudioCdnTrack({ value: { ...VALID_TRACK, duration: 0 } })
		).toBeNull();
	});

	it("parses manifests and drops invalid entries", () => {
		const manifest = parseAudioCdnManifest({
			value: manifestWith({ tracks: [VALID_TRACK, { id: "bad" }] }),
		});
		expect(manifest?.tracks).toHaveLength(1);
		expect(parseAudioCdnManifest({ value: { version: 999 } })).toBeNull();
	});

	it("converts tracks into library-compatible sound effects", () => {
		const track = parseAudioCdnTrack({ value: VALID_TRACK });
		expect(track).not.toBeNull();
		if (!track) throw new Error("Expected VALID_TRACK to pass validation");
		const sound = cdnTrackToSoundEffect({
			track,
			generatedAt: "2026-07-17T00:00:00.000Z",
		});
		expect(sound).toMatchObject({
			id: -100001,
			source: "qcut",
			kind: "music",
			previewUrl: VALID_TRACK.previewUrl,
			artworkUrl: VALID_TRACK.artworkUrl,
			username: "QCut Studio",
			downloads: 12,
		});
		expect(sound.tags).toContain("music");
	});

	it("accepts the checked-in example source entries after URL resolution", () => {
		const examplePath = path.join(
			import.meta.dirname,
			"../../../../audio-cdn/tracks.example.json"
		);
		const sourceTracks = JSON.parse(readFileSync(examplePath, "utf8")) as ({
			file: string;
			artworkFile?: string;
		} & Record<string, unknown>)[];
		const tracks = sourceTracks.map(({ file, artworkFile, ...track }) => ({
			...track,
			previewUrl: `https://assets.qcut.app/audio/${file}`,
			artworkUrl: artworkFile
				? `https://assets.qcut.app/audio/${artworkFile}`
				: undefined,
		}));
		const manifest = parseAudioCdnManifest({
			value: manifestWith({ tracks }),
		});
		expect(manifest?.tracks).toHaveLength(sourceTracks.length);
	});

	it("loads, caches, and falls back to the cached manifest", async () => {
		vi.stubEnv("VITE_AUDIO_CDN_MANIFEST_URL", "https://cdn.example/m.json");
		// The global test setup replaces localStorage with no-op mocks; the
		// cache behavior needs a real store for this test.
		const backing = new Map<string, string>();
		const originalLocalStorage = window.localStorage;
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: (key: string) => backing.get(key) ?? null,
				setItem: (key: string, value: string) => {
					backing.set(key, value);
				},
				removeItem: (key: string) => {
					backing.delete(key);
				},
				clear: () => backing.clear(),
				key: () => null,
				get length() {
					return backing.size;
				},
			} satisfies Storage,
			writable: true,
		});
		try {
			const fetchImpl = vi.fn(async () => ({
				ok: true,
				json: async () => manifestWith({ tracks: [VALID_TRACK] }),
			})) as unknown as typeof fetch;

			let clock = 1_000;
			const now = () => clock;
			const first = await loadAudioCdnCatalog({ fetchImpl, now });
			expect(first).toHaveLength(1);
			expect(fetchImpl).toHaveBeenCalledTimes(1);

			// Within the TTL the cached manifest is served without a fetch.
			clock += 1_000;
			const second = await loadAudioCdnCatalog({ fetchImpl, now });
			expect(second).toHaveLength(1);
			expect(fetchImpl).toHaveBeenCalledTimes(1);

			// After the TTL a failing fetch falls back to the stale cache.
			clock += 2 * 60 * 60 * 1000;
			const failingFetch = vi.fn(async () => {
				throw new Error("offline");
			}) as unknown as typeof fetch;
			const third = await loadAudioCdnCatalog({ fetchImpl: failingFetch, now });
			expect(third).toHaveLength(1);
		} finally {
			Object.defineProperty(window, "localStorage", {
				value: originalLocalStorage,
				writable: true,
			});
			vi.unstubAllEnvs();
		}
	});

	it("resolves to an empty catalog when no manifest URL is configured", async () => {
		// .env.local may configure a real manifest URL for dev builds; force
		// the unconfigured state for this test.
		vi.stubEnv("VITE_AUDIO_CDN_MANIFEST_URL", "");
		try {
			const fetchImpl = vi.fn() as unknown as typeof fetch;
			await expect(loadAudioCdnCatalog({ fetchImpl })).resolves.toEqual([]);
			expect(fetchImpl).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
