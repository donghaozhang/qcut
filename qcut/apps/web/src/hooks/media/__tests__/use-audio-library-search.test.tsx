import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchSounds } from "@/lib/api-adapter";
import type { SoundEffect } from "@/types/sounds";
import { useAudioLibrarySearch } from "../use-audio-library-search";

vi.mock("@/lib/api-adapter", () => ({ searchSounds: vi.fn() }));

function sound({ id, name }: { id: number; name: string }): SoundEffect {
	return {
		id,
		name,
		description: "",
		url: `https://freesound.org/s/${id}`,
		previewUrl: `https://cdn.example.test/${id}.mp3`,
		duration: 30,
		filesize: 100,
		type: "mp3",
		channels: 2,
		bitrate: 320,
		bitdepth: 16,
		samplerate: 44_100,
		username: "artist",
		tags: ["music"],
		license: "https://creativecommons.org/publicdomain/zero/1.0/",
		created: "2026-01-01",
		downloads: 1,
		rating: 4,
		ratingCount: 1,
	};
}

describe("useAudioLibrarySearch", () => {
	beforeEach(() => {
		vi.mocked(searchSounds).mockReset();
	});

	it("searches the independent songs channel with commercial filtering", async () => {
		vi.mocked(searchSounds).mockResolvedValue({
			success: true,
			results: [sound({ id: 1, name: "Cinematic Rise" })],
			count: 1,
			next: null,
		});
		const { result } = renderHook(() =>
			useAudioLibrarySearch({
				query: "cinematic instrumental",
				type: "songs",
				commercialOnly: true,
				debounceMs: 0,
			})
		);

		await waitFor(() => expect(result.current.results).toHaveLength(1));
		expect(searchSounds).toHaveBeenCalledWith(
			"cinematic instrumental",
			expect.objectContaining({
				type: "songs",
				commercial_only: true,
				page: 1,
			})
		);
	});

	it("appends pages without duplicate sound IDs", async () => {
		vi.mocked(searchSounds)
			.mockResolvedValueOnce({
				success: true,
				results: [sound({ id: 1, name: "One" })],
				count: 2,
				next: "page-2",
			})
			.mockResolvedValueOnce({
				success: true,
				results: [sound({ id: 1, name: "One" }), sound({ id: 2, name: "Two" })],
				count: 2,
				next: null,
			});
		const { result } = renderHook(() =>
			useAudioLibrarySearch({
				query: "ambient",
				type: "songs",
				commercialOnly: false,
				debounceMs: 0,
			})
		);

		await waitFor(() => expect(result.current.hasNextPage).toBe(true));
		await act(async () => result.current.loadMore());
		expect(result.current.results.map((item) => item.id)).toEqual([1, 2]);
	});
});
