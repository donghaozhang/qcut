import { beforeEach, describe, expect, it } from "vitest";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type { SoundEffect } from "@/types/sounds";
import { useSoundsStore } from "../sounds-store";

function sound(): SoundEffect {
	return {
		id: 91,
		name: "Theme",
		description: "",
		url: "",
		previewUrl: "https://cdn.example.test/theme.mp3",
		duration: 60,
		filesize: 100,
		type: "mp3",
		channels: 2,
		bitrate: 320,
		bitdepth: 16,
		samplerate: 44_100,
		username: "artist",
		tags: ["music"],
		license: "https://creativecommons.org/licenses/by/4.0/",
		created: "2026-01-01",
		downloads: 2,
		rating: 4,
		ratingCount: 1,
	};
}

describe("sounds store asset identity", () => {
	beforeEach(() => {
		useAssetLibraryStore.getState().resetLibrary();
		useSoundsStore.setState({
			savedSounds: [],
			isSavedSoundsLoaded: true,
			savedSoundsError: null,
		});
	});

	it("keeps music and sound-effect favorites distinct", async () => {
		await useSoundsStore.getState().saveSoundEffect(sound(), "music");
		expect(useSoundsStore.getState().isSoundSaved(91, "music")).toBe(true);
		expect(useSoundsStore.getState().isSoundSaved(91, "sound-effect")).toBe(
			false
		);
		expect(useAssetLibraryStore.getState().favorites["music:91"]).toBe(true);

		await useSoundsStore.getState().saveSoundEffect(sound(), "sound-effect");
		expect(useSoundsStore.getState().savedSounds).toHaveLength(2);
		expect(useAssetLibraryStore.getState().favorites["sound-effect:91"]).toBe(
			true
		);

		await useSoundsStore.getState().removeSavedSound(91, "music");
		expect(useSoundsStore.getState().isSoundSaved(91, "music")).toBe(false);
		expect(useSoundsStore.getState().isSoundSaved(91, "sound-effect")).toBe(
			true
		);
	});
});
