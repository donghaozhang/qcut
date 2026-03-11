/**
 * Tests for search → timeline navigation integration.
 * Verifies that navigating to a search result seeks the playback correctly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import type { PersistedTranscription } from "@qcut/editor-core";

// Mock playback store
const mockSetCurrentTime = vi.fn();
vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => ({
			setCurrentTime: mockSetCurrentTime,
		}),
	},
}));

import { useSearchStore } from "@/stores/search-store";

function makeTranscription(
	overrides: Partial<PersistedTranscription> = {}
): PersistedTranscription {
	return {
		version: 1,
		mediaId: "m1",
		mediaName: "interview.mp4",
		language: "en",
		duration: 120,
		provider: "elevenlabs",
		createdAt: Date.now(),
		text: "The quick brown fox jumps over the lazy dog",
		words: [
			{ text: "The", start: 1.0, end: 1.2, type: "word" },
			{ text: "quick", start: 1.3, end: 1.6, type: "word" },
			{ text: "brown", start: 1.7, end: 2.0, type: "word" },
			{ text: "fox", start: 2.1, end: 2.3, type: "word" },
			{ text: "jumps", start: 2.5, end: 2.8, type: "word" },
			{ text: "over", start: 3.0, end: 3.2, type: "word" },
			{ text: "the", start: 3.3, end: 3.5, type: "word" },
			{ text: "lazy", start: 3.6, end: 3.9, type: "word" },
			{ text: "dog", start: 4.0, end: 4.2, type: "word" },
		],
		segments: [
			{
				text: "The quick brown fox jumps over the lazy dog",
				start: 1.0,
				end: 4.5,
			},
		],
		...overrides,
	};
}

describe("search navigation", () => {
	beforeEach(() => {
		act(() => {
			useSearchStore.getState().clearSearch();
			useSearchStore.setState({
				transcriptions: [],
				transcriptionStatus: {},
			});
		});
		mockSetCurrentTime.mockClear();
	});

	it("seeks to word-level timestamp when available", async () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("fox");
		});

		const { results } = useSearchStore.getState();
		expect(results).toHaveLength(1);
		expect(results[0].wordTimestamp).toBe(2.1);

		await act(async () => {
			useSearchStore.getState().navigateToResult(0);
			await new Promise((r) => setTimeout(r, 10));
		});

		expect(mockSetCurrentTime).toHaveBeenCalledWith(2.1);
	});

	it("falls back to segment timestamp when no word match", async () => {
		const t = makeTranscription({ words: [] });
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("fox");
		});

		const { results } = useSearchStore.getState();
		expect(results).toHaveLength(1);
		expect(results[0].wordTimestamp).toBeUndefined();

		await act(async () => {
			useSearchStore.getState().navigateToResult(0);
			await new Promise((r) => setTimeout(r, 10));
		});

		// Falls back to segment start
		expect(mockSetCurrentTime).toHaveBeenCalledWith(1.0);
	});

	it("navigates through multiple results sequentially", async () => {
		const t = makeTranscription({
			segments: [
				{ text: "the first one", start: 1.0, end: 2.0 },
				{ text: "the second one", start: 5.0, end: 6.0 },
				{ text: "the third one", start: 10.0, end: 11.0 },
			],
			words: [],
		});

		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("the");
		});

		expect(useSearchStore.getState().results).toHaveLength(3);

		// Navigate through all results
		for (let i = 0; i < 3; i++) {
			await act(async () => {
				useSearchStore.getState().navigateToResult(i);
				await new Promise((r) => setTimeout(r, 10));
			});
			expect(useSearchStore.getState().selectedResultIndex).toBe(i);
		}

		// Verify the last seek was to the third segment
		const lastCall = mockSetCurrentTime.mock.calls.at(-1);
		expect(lastCall![0]).toBe(10.0);
	});

	it("does nothing for out-of-bounds index", async () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("fox");
		});

		await act(async () => {
			useSearchStore.getState().navigateToResult(99);
			await new Promise((r) => setTimeout(r, 10));
		});

		expect(mockSetCurrentTime).not.toHaveBeenCalled();
	});

	it("nextResult wraps around", async () => {
		const t = makeTranscription({
			segments: [
				{ text: "a test", start: 1.0, end: 2.0 },
				{ text: "a test", start: 3.0, end: 4.0 },
			],
			words: [],
		});

		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("a");
		});

		expect(useSearchStore.getState().results).toHaveLength(2);

		// Start at 0 (auto-selected), go next twice to wrap
		await act(async () => {
			useSearchStore.getState().nextResult();
			await new Promise((r) => setTimeout(r, 10));
		});
		expect(useSearchStore.getState().selectedResultIndex).toBe(1);

		await act(async () => {
			useSearchStore.getState().nextResult();
			await new Promise((r) => setTimeout(r, 10));
		});
		expect(useSearchStore.getState().selectedResultIndex).toBe(0);
	});
});
