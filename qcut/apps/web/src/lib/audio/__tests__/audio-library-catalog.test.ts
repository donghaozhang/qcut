import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cdnTrackToSoundEffect } from "../audio-cdn-catalog";
import {
	AUDIO_LIBRARY_CATEGORIES,
	type AudioLibraryKind,
	BUILT_IN_AUDIO,
	findAudioLibraryCategory,
	getBuiltInAudio,
	getCatalogAudio,
	localizeAudioLibraryTag,
	MUSIC_CATEGORIES,
	translateAudioSearchQuery,
} from "../audio-library-catalog";

type AudioCdnSourceTrackForTest = {
	id: number;
	kind: AudioLibraryKind;
	name: string;
	duration: number;
	tags: string[];
	file: string;
	artworkFile?: string;
};

describe("audio library catalog", () => {
	it("ships browsable music and sound-effect categories", () => {
		expect(
			AUDIO_LIBRARY_CATEGORIES.filter((category) => category.kind === "music")
		).toHaveLength(16);
		expect(
			AUDIO_LIBRARY_CATEGORIES.filter(
				(category) => category.kind === "sound-effect"
			)
		).toHaveLength(10);
	});

	it("ships real bundled audio files with localized metadata", () => {
		expect(
			BUILT_IN_AUDIO.filter((sound) => sound.kind === "music")
		).toHaveLength(9);
		expect(
			BUILT_IN_AUDIO.filter((sound) => sound.kind === "sound-effect")
		).toHaveLength(14);

		for (const sound of BUILT_IN_AUDIO) {
			expect(sound.source).toBe("qcut");
			expect(sound.localizedName).toBeTruthy();
			expect(sound.license).toBe("qcut://license/built-in");
			const assetPath = path.join(
				import.meta.dirname,
				"../../../../public",
				(sound.previewUrl ?? "").replace(/^\//, "")
			);
			expect(existsSync(assetPath)).toBe(true);
			expect(statSync(assetPath).size).toBeGreaterThan(1_000);
		}
	});

	it("ships cover artwork for every bundled track", () => {
		for (const sound of BUILT_IN_AUDIO) {
			expect(sound.artworkUrl, `${sound.name} should have artwork`).toMatch(
				/^\/audio\/builtin\/artwork\/.+\.webp$/
			);
			const artworkPath = path.join(
				import.meta.dirname,
				"../../../../public",
				(sound.artworkUrl ?? "").replace(/^\//, "")
			);
			expect(
				existsSync(artworkPath),
				`${sound.name} artwork file should exist`
			).toBe(true);
			expect(statSync(artworkPath).size).toBeGreaterThan(500);
		}
	});

	it("keeps every category useful without an online provider", () => {
		for (const category of AUDIO_LIBRARY_CATEGORIES) {
			expect(
				getBuiltInAudio({ category, query: "" }).length,
				`${category.id} should have bundled content`
			).toBeGreaterThan(0);
		}
	});

	it("keeps every released music category stocked with at least three tracks", () => {
		const tracksPath = path.join(
			import.meta.dirname,
			"../../../../audio-cdn/tracks.json"
		);
		const sourceTracks = JSON.parse(
			readFileSync(tracksPath, "utf8")
		) as AudioCdnSourceTrackForTest[];
		const cdnTracks = sourceTracks.map((track) => ({
				...track,
				previewUrl: `https://assets.qcut.test/audio/${track.file}`,
				artworkUrl: track.artworkFile
					? `https://assets.qcut.test/audio/${track.artworkFile}`
					: undefined,
		}));

		const cdnSounds = cdnTracks.map((track) =>
			cdnTrackToSoundEffect({
				track,
				generatedAt: "2026-07-18T00:00:00.000Z",
			})
		);
		const releasedCatalog = [...BUILT_IN_AUDIO, ...cdnSounds];
		for (const category of MUSIC_CATEGORIES) {
			expect(
				getCatalogAudio({
					category,
					query: "",
					catalog: releasedCatalog,
				}).length,
				`${category.id} should have at least three released tracks`
			).toBeGreaterThanOrEqual(3);
		}
	});

	it("maps Chinese creator searches and scene categories", () => {
		expect(translateAudioSearchQuery({ query: "旅行 卡点" })).toBe(
			"travel vlog rhythmic beat"
		);
		expect(translateAudioSearchQuery({ query: "韩流 雨声" })).toBe(
			"kpop dance rain ambient"
		);
		expect(translateAudioSearchQuery({ query: "周杰伦 华语" })).toBe(
			"mandopop piano rnb chinese pop mandopop chinese pop"
		);
		const mandopop = findAudioLibraryCategory({
			categoryId: "music-mandopop",
		});
		expect(
			getBuiltInAudio({ category: mandopop, query: "" }).map(
				(item) => item.name
			)
		).toEqual(["Warm Window", "Moonlit Farewell", "Snow Lantern"]);
		const travel = findAudioLibraryCategory({ categoryId: "music-travel" });
		expect(
			getBuiltInAudio({ category: travel, query: "" }).map((item) => item.name)
		).toEqual(["Golden Hour Ride", "Open Road"]);
		expect(
			getBuiltInAudio({ category: travel, query: "治愈" }).map(
				(item) => item.name
			)
		).toContain("Quiet Current");
		expect(localizeAudioLibraryTag({ tag: "road-trip", locale: "zh" })).toBe(
			"公路旅行"
		);
		expect(localizeAudioLibraryTag({ tag: "road-trip", locale: "en" })).toBe(
			"Road Trip"
		);
	});

	it("matches tracks by artist/source name", () => {
		const travel = findAudioLibraryCategory({ categoryId: "music-travel" });
		const byArtist = getBuiltInAudio({
			category: travel,
			query: "qcut studio",
		});
		expect(byArtist.length).toBeGreaterThan(0);
		expect(byArtist.map((item) => item.name)).toContain("Golden Hour Ride");
		expect(
			getBuiltInAudio({ category: travel, query: "no-such-artist" })
		).toHaveLength(0);
	});
});
