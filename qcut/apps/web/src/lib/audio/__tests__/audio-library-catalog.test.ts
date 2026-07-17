import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	AUDIO_LIBRARY_CATEGORIES,
	BUILT_IN_AUDIO,
	findAudioLibraryCategory,
	getBuiltInAudio,
	localizeAudioLibraryTag,
	translateAudioSearchQuery,
} from "../audio-library-catalog";

describe("audio library catalog", () => {
	it("ships browsable music and sound-effect categories", () => {
		expect(
			AUDIO_LIBRARY_CATEGORIES.filter((category) => category.kind === "music")
		).toHaveLength(15);
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

	it("maps Chinese creator searches and scene categories", () => {
		expect(translateAudioSearchQuery({ query: "旅行 卡点" })).toBe(
			"travel vlog rhythmic beat"
		);
		expect(translateAudioSearchQuery({ query: "韩流 雨声" })).toBe(
			"kpop dance rain ambient"
		);
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
