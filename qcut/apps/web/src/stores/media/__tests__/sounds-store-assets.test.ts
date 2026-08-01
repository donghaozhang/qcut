import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type { SoundEffect } from "@/types/sounds";
import { useSoundsStore } from "../sounds-store";

const mocks = vi.hoisted(() => ({
	addMediaAtTime: vi.fn(() => true),
	addMediaItem: vi.fn(),
	createObjectURL: vi.fn(() => "blob:qcut-audio"),
	ensureAssetResources: vi.fn(async () => [
		{
			blob: new Blob(["audio"], { type: "audio/ogg" }),
			cacheKey: "music:91@1:preview:0",
			fromCache: false,
			mimeType: "audio/ogg",
			role: "preview" as const,
			sourceUrl: "/audio/builtin/theme.ogg",
			url: "/audio/builtin/theme.ogg",
		},
	]),
	revokeObjectURL: vi.fn(),
	mediaItems: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/assets/asset-resource-cache", () => ({
	ensureAssetResources: mocks.ensureAssetResources,
}));

vi.mock("@/lib/media/blob-manager", () => ({
	createObjectURL: mocks.createObjectURL,
	revokeObjectURL: mocks.revokeObjectURL,
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({ activeProject: { id: "project-1" } }),
	},
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: () => ({
			addMediaItem: mocks.addMediaItem,
			mediaItems: mocks.mediaItems,
		}),
	},
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({ addMediaAtTime: mocks.addMediaAtTime }),
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => ({ currentTime: 3 }),
	},
}));

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
		vi.clearAllMocks();
		mocks.mediaItems.splice(0, mocks.mediaItems.length, {
			id: "media-1",
			name: "Theme",
			type: "audio",
			duration: 60,
			url: "blob:qcut-audio",
		});
		// Newly created media must use an ID distinct from the seeded item so
		// materialization assertions cannot accidentally match the seed.
		mocks.addMediaItem.mockImplementation(async (_projectId, item) => {
			mocks.mediaItems.push({ id: "media-2", ...item });
			return "media-2";
		});
		useAssetLibraryStore.getState().resetLibrary();
		useSoundsStore.setState({
			savedSounds: [],
			recentSounds: [],
			isSavedSoundsLoaded: true,
			savedSoundsError: null,
		});
	});

	it("keeps the newest distinct audio in recent history", () => {
		useSoundsStore.getState().markSoundRecent(sound(), "music");
		useSoundsStore
			.getState()
			.markSoundRecent({ ...sound(), name: "Updated Theme" }, "music");

		expect(useSoundsStore.getState().recentSounds).toEqual([
			expect.objectContaining({
				id: 91,
				kind: "music",
				name: "Updated Theme",
			}),
		]);
	});

	it("does not persist local reference sounds in recent history", () => {
		useSoundsStore
			.getState()
			.markSoundRecent(
				{ ...sound(), source: "sound-effects-lab" },
				"sound-effect"
			);

		expect(useSoundsStore.getState().recentSounds).toEqual([]);
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

	it("materializes bundled audio before adding it to the timeline", async () => {
		const builtInSound = {
			...sound(),
			source: "qcut" as const,
			previewUrl: "/audio/builtin/theme.ogg",
		};

		const added = await useSoundsStore.getState().addSoundToTimeline({
			sound: builtInSound,
			kind: "music",
		});

		expect(added).toBe(true);
		expect(mocks.ensureAssetResources).toHaveBeenCalledWith(
			expect.objectContaining({ cacheBundledResources: true })
		);
		expect(mocks.addMediaAtTime).toHaveBeenCalledWith(
			expect.objectContaining({ id: "media-2" }),
			3
		);
		expect(useSoundsStore.getState().recentSounds[0]).toMatchObject({
			id: 91,
			kind: "music",
		});
	});

	it("reuses project audio without downloading or duplicating media", async () => {
		const added = await useSoundsStore.getState().addSoundToTimeline({
			sound: {
				...sound(),
				source: "project",
				mediaId: "media-1",
			},
			kind: "music",
		});

		expect(added).toBe(true);
		expect(mocks.ensureAssetResources).not.toHaveBeenCalled();
		expect(mocks.addMediaItem).not.toHaveBeenCalled();
		expect(mocks.addMediaAtTime).toHaveBeenCalledWith(
			expect.objectContaining({ id: "media-1" }),
			3
		);
	});

	it("reuses an imported catalog asset across multiple cue insertions", async () => {
		const builtInSound = {
			...sound(),
			source: "qcut" as const,
			previewUrl: "/audio/builtin/theme.ogg",
		};

		const count = await useSoundsStore.getState().addSoundCuesToTimeline({
			cues: [
				{ sound: builtInSound, kind: "sound-effect", startTime: 1 },
				{ sound: builtInSound, kind: "sound-effect", startTime: 2 },
			],
		});

		expect(count).toBe(2);
		expect(mocks.ensureAssetResources).toHaveBeenCalledTimes(1);
		expect(mocks.addMediaItem).toHaveBeenCalledTimes(1);
		expect(mocks.addMediaAtTime).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ id: "media-2" }),
			1
		);
		expect(mocks.addMediaAtTime).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ id: "media-2" }),
			2
		);
	});
});
