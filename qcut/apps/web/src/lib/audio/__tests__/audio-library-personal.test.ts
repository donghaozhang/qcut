import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedSound } from "@/types/sounds";
import {
	AUDIO_LIBRARY_FAVORITES_STORAGE_KEY,
	AUDIO_LIBRARY_FOLDERS_STORAGE_KEY,
	AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT,
	audioLibraryAssetKey,
	loadAudioLibraryCloudItems,
	loadAudioLibraryFavorites,
	loadAudioLibraryFolders,
	parseAudioLibraryFolder,
	parseSavedAudio,
	persistAudioLibraryCloudItems,
	persistAudioLibraryFavorites,
	persistAudioLibraryFolders,
	type AudioLibraryFolder,
} from "../audio-library-personal";

const favorite: SavedSound = {
	id: -1001,
	kind: "music",
	name: "Quiet Current",
	username: "QCut Studio",
	previewUrl: "/audio/builtin/quiet-current.ogg",
	duration: 12,
	tags: ["music", "healing"],
	license: "qcut://license/built-in",
	savedAt: "2026-07-17T00:00:00.000Z",
	bpm: 60,
	loopable: true,
};

const folder: AudioLibraryFolder = {
	id: "folder-1",
	name: "Calm edits",
	assetKeys: ["music:-1001"],
	createdAt: 10,
	updatedAt: 20,
};

describe("audio library personal data", () => {
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
	});

	it("round-trips validated favorites and folders", () => {
		persistAudioLibraryFavorites({ sounds: [favorite] });
		persistAudioLibraryFolders({ folders: [folder] });

		expect(loadAudioLibraryFavorites()).toHaveLength(1);
		expect(loadAudioLibraryFavorites()[0]).toMatchObject(favorite);
		expect(loadAudioLibraryFolders()).toEqual([folder]);
		expect(audioLibraryAssetKey({ kind: "music", id: favorite.id })).toBe(
			"music:-1001"
		);
	});

	it("rejects malformed cloud and local values", () => {
		expect(parseSavedAudio({ value: { id: "bad" } })).toBeNull();
		expect(
			parseAudioLibraryFolder({
				value: {
					...folder,
					name: "x".repeat(41),
				},
			})
		).toBeNull();
		localStorage.setItem(
			AUDIO_LIBRARY_FAVORITES_STORAGE_KEY,
			JSON.stringify([favorite, { id: "bad" }])
		);
		localStorage.setItem(
			AUDIO_LIBRARY_FOLDERS_STORAGE_KEY,
			JSON.stringify([folder, { id: null }])
		);

		expect(loadAudioLibraryFavorites()).toHaveLength(1);
		expect(loadAudioLibraryFavorites()[0]).toMatchObject(favorite);
		expect(loadAudioLibraryFolders()).toEqual([folder]);
	});

	it("serializes favorites and folders as mergeable cloud items", () => {
		persistAudioLibraryFavorites({ sounds: [favorite] });
		persistAudioLibraryFolders({ folders: [folder] });

		expect(loadAudioLibraryCloudItems()).toEqual([
			expect.objectContaining({
				id: "favorite:music:-1001",
				type: "favorite",
			}),
			expect.objectContaining({ id: "folder:folder-1", type: "folder" }),
		]);
	});

	it("applies merged cloud items and announces an immediate refresh", () => {
		const listener = vi.fn();
		window.addEventListener(AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT, listener);

		persistAudioLibraryCloudItems({
			items: [
				{
					id: "favorite:music:-1001",
					type: "favorite",
					sound: favorite,
				},
				{ id: "folder:folder-1", type: "folder", folder },
			],
		});

		expect(loadAudioLibraryFavorites()).toHaveLength(1);
		expect(loadAudioLibraryFavorites()[0]).toMatchObject(favorite);
		expect(loadAudioLibraryFolders()).toEqual([folder]);
		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener(AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT, listener);
	});
});
