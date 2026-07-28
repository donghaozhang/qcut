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
		let loaded = false;
		await act(async () => {
			loaded = await result.current.loadMore();
		});
		expect(loaded).toBe(true);
		expect(result.current.results.map((item) => item.id)).toEqual([1, 2]);
	});

	it("reports a failed page load without advancing consumers", async () => {
		vi.mocked(searchSounds)
			.mockResolvedValueOnce({
				success: true,
				results: [sound({ id: 1, name: "One" })],
				count: 2,
				next: "page-2",
			})
			.mockResolvedValueOnce({
				success: false,
				error: "Remote page failed",
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
		let loaded = true;
		await act(async () => {
			loaded = await result.current.loadMore();
		});

		expect(loaded).toBe(false);
		expect(result.current.results.map((item) => item.id)).toEqual([1]);
		expect(result.current.error).toBe("Remote page failed");
	});

	it("unblocks pagination when the query changes during a page load", async () => {
		let resolveStalePage: (value: {
			success: boolean;
			results: SoundEffect[];
			count: number;
			next: string | null;
		}) => void;
		const stalePage = new Promise<{
			success: boolean;
			results: SoundEffect[];
			count: number;
			next: string | null;
		}>((resolve) => {
			resolveStalePage = resolve;
		});
		vi.mocked(searchSounds)
			.mockResolvedValueOnce({
				success: true,
				results: [sound({ id: 1, name: "Ambient One" })],
				count: 2,
				next: "ambient-page-2",
			})
			.mockReturnValueOnce(stalePage)
			.mockResolvedValueOnce({
				success: true,
				results: [sound({ id: 10, name: "Cinematic One" })],
				count: 2,
				next: "cinematic-page-2",
			})
			.mockResolvedValueOnce({
				success: true,
				results: [sound({ id: 11, name: "Cinematic Two" })],
				count: 2,
				next: null,
			});
		const { result, rerender } = renderHook(
			({ query }: { query: string }) =>
				useAudioLibrarySearch({
					query,
					type: "songs",
					commercialOnly: false,
					debounceMs: 0,
				}),
			{ initialProps: { query: "ambient" } }
		);

		await waitFor(() => expect(result.current.hasNextPage).toBe(true));
		let staleLoadPromise: Promise<boolean>;
		act(() => {
			staleLoadPromise = result.current.loadMore();
		});
		await waitFor(() => expect(result.current.isLoadingMore).toBe(true));

		rerender({ query: "cinematic" });
		await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
		await waitFor(() =>
			expect(result.current.results.map((item) => item.id)).toEqual([10])
		);
		expect(result.current.hasNextPage).toBe(true);

		let loaded = false;
		await act(async () => {
			loaded = await result.current.loadMore();
		});
		expect(loaded).toBe(true);
		expect(result.current.results.map((item) => item.id)).toEqual([10, 11]);

		await act(async () => {
			resolveStalePage({
				success: true,
				results: [sound({ id: 2, name: "Ambient Two" })],
				count: 2,
				next: null,
			});
			expect(await staleLoadPromise).toBe(false);
		});
		expect(result.current.results.map((item) => item.id)).toEqual([10, 11]);
	});
});
