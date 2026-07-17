import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_AUDIO } from "@/lib/audio/audio-library-catalog";
import {
	loadAudioLibraryFavorites,
	loadAudioLibraryFolders,
} from "@/lib/audio/audio-library-personal";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useSoundsStore } from "../sounds-store";

const music = BUILT_IN_AUDIO.find((sound) => sound.kind === "music");

describe("sounds store folders", () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		vi.mocked(localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
		vi.mocked(localStorage.removeItem).mockImplementation((key) => {
			storage.delete(key);
		});
		vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
		useAssetLibraryStore.setState({ favorites: {}, runtimeByAssetKey: {} });
		useSoundsStore.setState({
			savedSounds: [],
			recentSounds: [],
			audioFolders: [],
			isSavedSoundsLoaded: true,
			savedSoundsError: null,
		});
	});

	it("creates, renames, and rejects duplicate folders", () => {
		const folderId = useSoundsStore
			.getState()
			.createAudioFolder({ name: " Travel " });

		expect(folderId).toBeTruthy();
		expect(
			useSoundsStore.getState().createAudioFolder({ name: "travel" })
		).toBeNull();
		expect(
			useSoundsStore
				.getState()
				.renameAudioFolder({ folderId: folderId ?? "", name: "VLOG" })
		).toBe(true);
		expect(loadAudioLibraryFolders()[0]?.name).toBe("VLOG");
	});

	it("favorites audio when adding it to a folder and persists membership", async () => {
		expect(music).toBeDefined();
		if (!music) return;
		const folderId = useSoundsStore
			.getState()
			.createAudioFolder({ name: "Calm" });
		expect(folderId).toBeTruthy();

		await useSoundsStore.getState().toggleSoundInFolder({
			folderId: folderId ?? "",
			sound: music,
			kind: "music",
		});

		expect(loadAudioLibraryFavorites()).toHaveLength(1);
		expect(loadAudioLibraryFolders()[0]?.assetKeys).toEqual([
			`music:${music.id}`,
		]);
		expect(
			useSoundsStore.getState().isSoundInFolder({
				folderId: folderId ?? "",
				soundId: music.id,
				kind: "music",
			})
		).toBe(true);
	});

	it("removes stale folder membership when a favorite is deleted", async () => {
		expect(music).toBeDefined();
		if (!music) return;
		const folderId =
			useSoundsStore.getState().createAudioFolder({ name: "Calm" }) ?? "";
		await useSoundsStore
			.getState()
			.toggleSoundInFolder({ folderId, sound: music, kind: "music" });

		await useSoundsStore.getState().removeSavedSound(music.id, "music");

		expect(loadAudioLibraryFavorites()).toEqual([]);
		expect(loadAudioLibraryFolders()[0]?.assetKeys).toEqual([]);
	});
});
