import { describe, expect, it } from "vitest";
import { parseAudioCdnManifest } from "../audio-cdn-catalog";
import {
	BUNDLED_LIBRARY_ID_CEILING,
	BUNDLED_LIBRARY_ID_FLOOR,
	buildBundledAudioManifest,
	bundledTrackId,
	classifyOpenverseTrack,
	openverseRecordToTrack,
	type OpenverseAudioRecord,
} from "../openverse-library-build";

function record(
	overrides: Partial<OpenverseAudioRecord> = {}
): OpenverseAudioRecord {
	return {
		id: "33d74b38-3baf-41b4-bfa8-27a292d26b0b",
		title: "Piano Hiphop",
		url: "https://prod-1.storage.jamendo.com/?trackid=211720&format=mp32",
		creator: "BrunoXe",
		license: "by",
		license_version: "3.0",
		license_url: "https://creativecommons.org/licenses/by/3.0/",
		provider: "jamendo",
		category: "music",
		genres: ["electronic"],
		tags: [{ name: "instrumental" }, { name: "lounge" }],
		duration: 70_000,
		indexed_on: "2022-04-01T07:25:28.481246Z",
		audio_set: {
			foreign_landing_url: "https://www.jamendo.com/album/31249/nuevos-aires",
		},
		...overrides,
	};
}

describe("openverseRecordToTrack", () => {
	it("maps a Jamendo record into a catalog track", () => {
		const track = openverseRecordToTrack({ record: record() });

		expect(track).not.toBeNull();
		expect(track?.name).toBe("Piano Hiphop");
		expect(track?.username).toBe("BrunoXe");
		expect(track?.kind).toBe("music");
		// Duration arrives in milliseconds and is stored in seconds.
		expect(track?.duration).toBe(70);
		expect(track?.previewUrl).toContain("storage.jamendo.com");
		expect(track?.license).toBe("https://creativecommons.org/licenses/by/3.0/");
	});

	it("takes album art from Jamendo rather than the rate-limited API proxy", () => {
		const track = openverseRecordToTrack({ record: record() });

		expect(track?.artworkUrl).toBe(
			"https://usercontent.jamendo.com/?type=album&id=31249&width=300"
		);
	});

	it("omits artwork when the record has no album", () => {
		const track = openverseRecordToTrack({
			record: record({ audio_set: undefined }),
		});

		expect(track?.artworkUrl).toBeUndefined();
	});

	it.each([
		"by-nc",
		"by-sa",
		"by-nd",
		"by-nc-sa",
	])("rejects %s, which cannot be safely remixed into a user's video", (license) => {
		expect(openverseRecordToTrack({ record: record({ license }) })).toBeNull();
	});

	it.each(["cc0", "pdm", "by"])("accepts %s", (license) => {
		expect(
			openverseRecordToTrack({ record: record({ license }) })
		).not.toBeNull();
	});

	it("rejects clips too short or too long to score a video", () => {
		expect(
			openverseRecordToTrack({ record: record({ duration: 5_000 }) })
		).toBeNull();
		expect(
			openverseRecordToTrack({ record: record({ duration: 40 * 60_000 }) })
		).toBeNull();
	});

	it("rejects records missing an id, title, creator or playable url", () => {
		expect(
			openverseRecordToTrack({ record: record({ id: undefined }) })
		).toBeNull();
		expect(
			openverseRecordToTrack({ record: record({ title: "  " }) })
		).toBeNull();
		expect(
			openverseRecordToTrack({ record: record({ creator: undefined }) })
		).toBeNull();
		expect(
			openverseRecordToTrack({ record: record({ url: "not-a-url" }) })
		).toBeNull();
	});

	// Wikimedia Commons indexes speech and wildlife beside its public-domain
	// music, and sets no category, so the title is the only filter.
	it.each([
		"Chinese pronunciation of 你好",
		"Interview with the composer",
		"Blackbird birdsong at dawn",
		"Presidential speech 1963",
	])("rejects %s, which is not music", (title) => {
		expect(openverseRecordToTrack({ record: record({ title }) })).toBeNull();
	});

	it("rejects a MIDI score, which Web Audio cannot decode", () => {
		expect(
			openverseRecordToTrack({
				record: record({
					url: "https://upload.wikimedia.org/wikipedia/commons/a/b/Moonlight.mid",
				}),
			})
		).toBeNull();
	});

	it.each(["ogg", "oga", "opus", "wav", "flac", "mp3"])(
		"keeps playable .%s audio",
		(ext) => {
			expect(
				openverseRecordToTrack({
					record: record({
						url: `https://upload.wikimedia.org/wikipedia/commons/a/b/Track.${ext}`,
					}),
				})
			).not.toBeNull();
		}
	);

	it("keeps Jamendo's extensionless streaming url", () => {
		expect(
			openverseRecordToTrack({
				record: record({
					url: "https://prod-1.storage.jamendo.com/?trackid=211720&format=mp32",
				}),
			})
		).not.toBeNull();
	});

	it("keeps a public-domain classical recording with no genre metadata", () => {
		const track = openverseRecordToTrack({
			record: record({
				title: "Frederic Chopin Piano Sonata No.2 in B flat minor",
				creator: "Frédéric Chopin",
				license: "cc0",
				license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
				provider: "wikimedia_audio",
				category: null,
				genres: null,
				tags: [],
				duration: 471_000,
				audio_set: null,
			}),
		});

		expect(track).not.toBeNull();
		// Classified purely from the title, since Wikimedia supplies no tags.
		expect(track?.tags).toContain("instrumental");
		expect(track?.tags).toContain("emotional");
		expect(track?.artworkUrl).toBeUndefined();
	});

	it("derives a license url when the record only carries a license code", () => {
		const track = openverseRecordToTrack({
			record: record({ license: "cc0", license_url: undefined }),
		});

		expect(track?.license).toBe(
			"https://creativecommons.org/publicdomain/zero/1.0/"
		);
	});
});

describe("bundledTrackId", () => {
	it("is stable across runs so saved sounds keep resolving", () => {
		expect(bundledTrackId({ openverseId: "abc" })).toBe(
			bundledTrackId({ openverseId: "abc" })
		);
	});

	it("stays inside the bundled band, clear of CDN and Freesound ids", () => {
		for (const seed of ["a", "b", "c", "long-uuid-like-value", "zzz"]) {
			const id = bundledTrackId({ openverseId: seed });
			expect(id).toBeLessThanOrEqual(BUNDLED_LIBRARY_ID_CEILING);
			expect(id).toBeGreaterThanOrEqual(BUNDLED_LIBRARY_ID_FLOOR);
		}
	});
});

describe("classifyOpenverseTrack", () => {
	it("always tags music so the generic feeds are populated", () => {
		const { tags } = classifyOpenverseTrack({ record: record() });

		expect(tags).toContain("music");
	});

	it("maps genres onto the category tags the library filters by", () => {
		const { tags, scenes } = classifyOpenverseTrack({
			record: record({ genres: ["ambient"], tags: [{ name: "peaceful" }] }),
		});

		expect(tags).toContain("healing");
		expect(scenes).toContain("focus");
	});

	it("does not call a vocal track instrumental", () => {
		const { tags } = classifyOpenverseTrack({
			record: record({ tags: [{ name: "instrumental" }, { name: "vocal" }] }),
		});

		expect(tags).not.toContain("instrumental");
	});

	it("gives an unmatched track the everyday bucket instead of orphaning it", () => {
		const { tags } = classifyOpenverseTrack({
			record: record({ title: "Zzzz", genres: [], tags: [] }),
		});

		expect(tags).toContain("vlog");
	});

	it("only claims a regional category on an explicit signal", () => {
		expect(
			classifyOpenverseTrack({ record: record({ genres: ["pop"] }) }).tags
		).not.toContain("kpop");
		expect(
			classifyOpenverseTrack({
				record: record({ genres: ["pop"], tags: [{ name: "korean" }] }),
			}).tags
		).toContain("kpop");
	});
});

describe("buildBundledAudioManifest", () => {
	it("produces a manifest the runtime parser accepts", () => {
		const manifest = buildBundledAudioManifest({
			records: [record()],
			generatedAt: "2026-07-27T00:00:00.000Z",
		});
		const parsed = parseAudioCdnManifest({ value: manifest });

		expect(parsed?.tracks).toHaveLength(1);
	});

	it("drops unusable records rather than emitting broken tracks", () => {
		const manifest = buildBundledAudioManifest({
			records: [record(), record({ id: "other", license: "by-nc" })],
			generatedAt: "2026-07-27T00:00:00.000Z",
		});

		expect(manifest.tracks).toHaveLength(1);
	});

	it("dedupes re-uploads of the same song by title and artist", () => {
		const manifest = buildBundledAudioManifest({
			records: [record(), record({ id: "a-different-openverse-id" })],
			generatedAt: "2026-07-27T00:00:00.000Z",
		});

		expect(manifest.tracks).toHaveLength(1);
	});

	it("gives every track a distinct id even when hashes collide", () => {
		const manifest = buildBundledAudioManifest({
			records: [
				record({ id: "one", title: "One" }),
				record({ id: "two", title: "Two" }),
				record({ id: "three", title: "Three" }),
			],
			generatedAt: "2026-07-27T00:00:00.000Z",
		});
		const ids = manifest.tracks.map((track) => track.id);

		expect(new Set(ids).size).toBe(ids.length);
	});
});
