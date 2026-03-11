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

// Import after mocks
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
		text: "Hello world",
		words: [
			{ text: "Hello", start: 0.5, end: 0.8, type: "word" },
			{ text: "world", start: 0.9, end: 1.2, type: "word" },
		],
		segments: [{ text: "Hello world", start: 0.5, end: 1.5 }],
		...overrides,
	};
}

describe("search-store", () => {
	beforeEach(() => {
		// Reset store
		act(() => {
			useSearchStore.getState().clearSearch();
			useSearchStore.setState({
				transcriptions: [],
				transcriptionStatus: {},
				caseSensitive: false,
				wholeWord: false,
			});
		});
		mockSetCurrentTime.mockClear();
	});

	it("initializes with empty state", () => {
		const state = useSearchStore.getState();
		expect(state.query).toBe("");
		expect(state.results).toEqual([]);
		expect(state.isSearching).toBe(false);
		expect(state.selectedResultIndex).toBeNull();
	});

	it("setQuery updates query and triggers search", () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("Hello");
		});
		const state = useSearchStore.getState();
		expect(state.query).toBe("Hello");
		expect(state.results).toHaveLength(1);
		expect(state.selectedResultIndex).toBe(0);
	});

	it("search with no transcriptions returns empty", () => {
		act(() => {
			useSearchStore.getState().setQuery("test");
		});
		expect(useSearchStore.getState().results).toEqual([]);
	});

	it("search populates results correctly", () => {
		const t1 = makeTranscription({ mediaId: "m1" });
		const t2 = makeTranscription({
			mediaId: "m2",
			mediaName: "other.mp4",
			segments: [{ text: "Hello there", start: 2, end: 3 }],
		});

		act(() => {
			useSearchStore.getState().setTranscriptions([t1, t2]);
			useSearchStore.getState().setQuery("Hello");
		});

		const state = useSearchStore.getState();
		expect(state.results).toHaveLength(2);
		expect(state.results[0].mediaId).toBe("m1");
		expect(state.results[1].mediaId).toBe("m2");
	});

	it("clearSearch resets state", () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("Hello");
		});
		expect(useSearchStore.getState().results).toHaveLength(1);

		act(() => {
			useSearchStore.getState().clearSearch();
		});
		const state = useSearchStore.getState();
		expect(state.query).toBe("");
		expect(state.results).toEqual([]);
		expect(state.selectedResultIndex).toBeNull();
	});

	it("setTranscriptions updates status to ready", () => {
		const t = makeTranscription({ mediaId: "m1" });
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
		});
		expect(useSearchStore.getState().transcriptionStatus["m1"]).toBe("ready");
	});

	it("setTranscriptionStatus updates individual media status", () => {
		act(() => {
			useSearchStore.getState().setTranscriptionStatus("m1", "loading");
		});
		expect(useSearchStore.getState().transcriptionStatus["m1"]).toBe("loading");

		act(() => {
			useSearchStore.getState().setTranscriptionStatus("m1", "error");
		});
		expect(useSearchStore.getState().transcriptionStatus.m1).toBe("error");
	});

	it("navigateToResult calls setCurrentTime", async () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("world");
		});

		await act(async () => {
			useSearchStore.getState().navigateToResult(0);
			// Wait for dynamic import to resolve
			await new Promise((r) => setTimeout(r, 10));
		});

		expect(mockSetCurrentTime).toHaveBeenCalledWith(0.9); // word timestamp
		expect(useSearchStore.getState().selectedResultIndex).toBe(0);
	});

	it("nextResult and prevResult cycle through results", () => {
		const t = makeTranscription({
			segments: [
				{ text: "go one", start: 0, end: 1 },
				{ text: "go two", start: 2, end: 3 },
				{ text: "go three", start: 4, end: 5 },
			],
			words: [],
		});
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("go");
		});
		expect(useSearchStore.getState().results).toHaveLength(3);
		expect(useSearchStore.getState().selectedResultIndex).toBe(0);

		act(() => useSearchStore.getState().nextResult());
		expect(useSearchStore.getState().selectedResultIndex).toBe(1);

		act(() => useSearchStore.getState().nextResult());
		expect(useSearchStore.getState().selectedResultIndex).toBe(2);

		// Wraps around
		act(() => useSearchStore.getState().nextResult());
		expect(useSearchStore.getState().selectedResultIndex).toBe(0);

		act(() => useSearchStore.getState().prevResult());
		expect(useSearchStore.getState().selectedResultIndex).toBe(2);
	});

	it("caseSensitive toggle re-runs search", () => {
		const t = makeTranscription();
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("hello");
		});
		// Case-insensitive: matches "Hello"
		expect(useSearchStore.getState().results).toHaveLength(1);

		act(() => {
			useSearchStore.getState().setCaseSensitive(true);
		});
		// Case-sensitive: "hello" doesn't match "Hello"
		expect(useSearchStore.getState().results).toHaveLength(0);
	});

	it("wholeWord toggle re-runs search", () => {
		const t = makeTranscription({
			segments: [{ text: "Hello worldwide", start: 0, end: 2 }],
			words: [],
		});
		act(() => {
			useSearchStore.getState().setTranscriptions([t]);
			useSearchStore.getState().setQuery("world");
		});
		// Substring: matches "world" in "worldwide"
		expect(useSearchStore.getState().results).toHaveLength(1);

		act(() => {
			useSearchStore.getState().setWholeWord(true);
		});
		// Whole word: "world" not a whole word in "worldwide"
		expect(useSearchStore.getState().results).toHaveLength(0);
	});
});
