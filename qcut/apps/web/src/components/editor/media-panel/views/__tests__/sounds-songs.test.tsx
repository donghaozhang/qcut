import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioLibrarySearch } from "@/hooks/media/use-audio-library-search";
import { useAudioPreview } from "@/hooks/media/use-audio-preview";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useSoundsStore } from "@/stores/media/sounds-store";
import type { SoundEffect } from "@/types/sounds";
import { SongsView } from "../sounds-songs";

vi.mock("@/hooks/media/use-audio-library-search", () => ({
	useAudioLibrarySearch: vi.fn(),
}));
vi.mock("@/hooks/media/use-audio-preview", () => ({
	useAudioPreview: vi.fn(),
}));

function music(): SoundEffect {
	return {
		id: 73,
		name: "Cinematic Morning",
		description: "",
		url: "https://freesound.org/s/73",
		previewUrl: "https://cdn.example.test/73.mp3",
		downloadUrl: "https://cdn.example.test/73.wav",
		duration: 95,
		filesize: 1024,
		type: "wav",
		channels: 2,
		bitrate: 0,
		bitdepth: 24,
		samplerate: 48_000,
		username: "composer",
		tags: ["music", "cinematic"],
		license: "https://creativecommons.org/publicdomain/zero/1.0/",
		created: "2026-01-01",
		downloads: 20,
		rating: 4.9,
		ratingCount: 8,
	};
}

describe("SongsView", () => {
	const togglePreview = vi.fn();
	const addSoundToTimeline = vi.fn(async () => true);

	beforeEach(() => {
		vi.clearAllMocks();
		useAssetLibraryStore.getState().resetLibrary();
		useSoundsStore.setState({
			savedSounds: [],
			isSavedSoundsLoaded: true,
			addSoundToTimeline,
		});
		vi.mocked(useAudioPreview).mockReturnValue({
			playingId: null,
			togglePreview,
			stop: vi.fn(),
		});
		vi.mocked(useAudioLibrarySearch).mockReturnValue({
			results: [music()],
			isLoading: false,
			isLoadingMore: false,
			error: undefined,
			hasNextPage: false,
			totalCount: 1,
			loadMore: vi.fn(),
		});
	});

	it("shows real music categories, licensing, preview, and timeline actions", async () => {
		render(<SongsView />);

		expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cinematic" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(screen.getByText("Cinematic Morning")).toBeInTheDocument();
		expect(screen.getByText("CC0-1.0")).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Preview Cinematic Morning" })
		);
		expect(togglePreview).toHaveBeenCalledWith({ sound: music() });

		fireEvent.click(
			screen.getByRole("button", { name: "Add Cinematic Morning to timeline" })
		);
		await waitFor(() =>
			expect(addSoundToTimeline).toHaveBeenCalledWith(music(), "music")
		);
	});

	it("stores music favorites independently and switches category queries", async () => {
		render(<SongsView />);
		fireEvent.click(
			screen.getByRole("button", { name: "Favorite Cinematic Morning" })
		);
		await waitFor(() =>
			expect(useAssetLibraryStore.getState().favorites["music:73"]).toBe(true)
		);
		expect(
			useAssetLibraryStore.getState().favorites["sound-effect:73"]
		).toBeUndefined();

		fireEvent.click(screen.getByRole("button", { name: "Ambient" }));
		expect(useAudioLibrarySearch).toHaveBeenLastCalledWith(
			expect.objectContaining({
				query: "ambient background music",
				type: "songs",
				commercialOnly: true,
			})
		);
	});
});
