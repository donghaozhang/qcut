import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { PersistedTranscription } from "@qcut/editor-core";

// Mock playback store
vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => ({
			setCurrentTime: vi.fn(),
		}),
	},
}));

import { SearchPanel } from "../SearchPanel";
import { useSearchStore } from "@/stores/search-store";

function makeTranscription(
	overrides: Partial<PersistedTranscription> = {}
): PersistedTranscription {
	return {
		version: 1,
		mediaId: "m1",
		mediaName: "video.mp4",
		language: "en",
		duration: 60,
		provider: "elevenlabs",
		createdAt: Date.now(),
		text: "Hello world from the test video",
		words: [
			{ text: "Hello", start: 0.5, end: 0.8, type: "word" },
			{ text: "world", start: 0.9, end: 1.2, type: "word" },
		],
		segments: [
			{ text: "Hello world from the test video", start: 0.5, end: 3.0 },
		],
		...overrides,
	};
}

describe("SearchPanel", () => {
	beforeEach(() => {
		act(() => {
			useSearchStore.getState().clearSearch();
			useSearchStore.setState({
				transcriptions: [],
				transcriptionStatus: {},
				caseSensitive: false,
				wholeWord: false,
			});
		});
	});

	it("renders search input", () => {
		render(<SearchPanel />);
		expect(screen.getByTestId("search-input")).toBeInTheDocument();
		expect(screen.getByTestId("search-panel")).toBeInTheDocument();
	});

	it("shows empty state when no query", () => {
		render(<SearchPanel />);
		expect(
			screen.getByText("Search transcription content")
		).toBeInTheDocument();
	});

	it("shows no results message when query has no matches", async () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
		});

		render(<SearchPanel />);
		const input = screen.getByTestId("search-input");

		// Type a query that won't match
		await act(async () => {
			fireEvent.change(input, { target: { value: "xyznonexistent" } });
			// Wait for debounce
			await new Promise((r) => setTimeout(r, 350));
		});

		expect(screen.getByTestId("search-no-results")).toBeInTheDocument();
	});

	it("displays results when query matches", async () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
		});

		render(<SearchPanel />);
		const input = screen.getByTestId("search-input");

		await act(async () => {
			fireEvent.change(input, { target: { value: "Hello" } });
			await new Promise((r) => setTimeout(r, 350));
		});

		expect(screen.getByTestId("search-results-list")).toBeInTheDocument();
		expect(screen.getByTestId("search-result-0")).toBeInTheDocument();
	});

	it("renders case sensitive and whole word toggles", () => {
		render(<SearchPanel />);
		expect(screen.getByTestId("search-case-sensitive")).toBeInTheDocument();
		expect(screen.getByTestId("search-whole-word")).toBeInTheDocument();
	});

	it("clicking result navigates to timestamp", async () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
		});

		render(<SearchPanel />);
		const input = screen.getByTestId("search-input");

		await act(async () => {
			fireEvent.change(input, { target: { value: "world" } });
			await new Promise((r) => setTimeout(r, 350));
		});

		const resultItem = screen.getByTestId("search-result-0");
		await act(async () => {
			fireEvent.click(resultItem);
			await new Promise((r) => setTimeout(r, 10));
		});

		expect(useSearchStore.getState().selectedResultIndex).toBe(0);
	});
});
