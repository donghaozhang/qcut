import { beforeEach, describe, expect, it, vi } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { useWordTimelineStore } from "../timeline/word-timeline-store";
import {
	WORD_FILTER_STATE,
	type RawWordTimelineJson,
} from "@/types/word-timeline";

function createMockJson({
	overrides,
}: {
	overrides?: Partial<RawWordTimelineJson>;
} = {}): RawWordTimelineJson {
	return {
		text: "Hello world test",
		language_code: "eng",
		language_probability: 0.99,
		words: [
			{ text: "Hello", start: 0, end: 0.5, type: "word" },
			{ text: " ", start: 0.5, end: 0.6, type: "spacing" },
			{ text: "world", start: 0.6, end: 1.0, type: "word" },
			{ text: " ", start: 1.0, end: 1.1, type: "spacing" },
			{ text: "test", start: 1.1, end: 1.5, type: "word" },
		],
		...(overrides || {}),
	};
}

function loadMockData({
	json,
	fileName = "test.json",
}: {
	json?: RawWordTimelineJson;
	fileName?: string;
} = {}): void {
	useWordTimelineStore
		.getState()
		.loadFromData(json || createMockJson(), fileName);
}

describe("WordTimelineStore", () => {
	beforeEach(() => {
		useWordTimelineStore.getState().clearData();
		Object.defineProperty(window, "electronAPI", {
			writable: true,
			value: {
				analyzeFillers: vi.fn().mockResolvedValue({
					filteredWordIds: [{ id: "word-0", reason: "filler word" }],
					provider: "pattern",
				}),
			},
		});
		initPlatform(createDesktopAdapter());
	});

	it("loads data and defaults all words to filterState=none", () => {
		loadMockData();
		const state = useWordTimelineStore.getState();

		expect(state.data).not.toBeNull();
		expect(state.data?.words[0].filterState).toBe(WORD_FILTER_STATE.NONE);
		expect(state.fileName).toBe("test.json");
		expect(state.error).toBeNull();
	});

	it("migrates legacy deleted=true to user-remove", () => {
		loadMockData({
			json: {
				...createMockJson(),
				words: [
					{
						text: "Hello",
						start: 0,
						end: 0.5,
						type: "word",
						deleted: true,
					},
				],
			},
		});

		expect(useWordTimelineStore.getState().data?.words[0].filterState).toBe(
			WORD_FILTER_STATE.USER_REMOVE
		);
	});

	it("keeps explicit filterState from JSON when present", () => {
		loadMockData({
			json: {
				...createMockJson(),
				words: [
					{
						text: "Hello",
						start: 0,
						end: 0.5,
						type: "word",
						deleted: false,
						filterState: WORD_FILTER_STATE.USER_KEEP,
					},
				],
			},
		});

		expect(useWordTimelineStore.getState().data?.words[0].filterState).toBe(
			WORD_FILTER_STATE.USER_KEEP
		);
	});

	it("sets and cycles word filter states", () => {
		loadMockData();
		const store = useWordTimelineStore.getState();

		store.setFilterState("word-0", WORD_FILTER_STATE.AI);
		expect(store.getWordById("word-0")?.filterState).toBe(WORD_FILTER_STATE.AI);

		store.cycleFilterState("word-0");
		expect(
			useWordTimelineStore.getState().getWordById("word-0")?.filterState
		).toBe(WORD_FILTER_STATE.USER_KEEP);

		useWordTimelineStore.getState().cycleFilterState("word-0");
		expect(
			useWordTimelineStore.getState().getWordById("word-0")?.filterState
		).toBe(WORD_FILTER_STATE.USER_REMOVE);
	});

	it("supports batch updates and acceptAllAiSuggestions", () => {
		loadMockData();
		const store = useWordTimelineStore.getState();

		store.setMultipleFilterStates(["word-0", "word-2"], WORD_FILTER_STATE.AI);
		store.acceptAllAiSuggestions();

		expect(
			useWordTimelineStore.getState().getWordById("word-0")?.filterState
		).toBe(WORD_FILTER_STATE.USER_REMOVE);
		expect(
			useWordTimelineStore.getState().getWordById("word-2")?.filterState
		).toBe(WORD_FILTER_STATE.USER_REMOVE);
	});

	it("undoes the latest filter change", () => {
		loadMockData();
		const store = useWordTimelineStore.getState();

		store.setFilterState("word-0", WORD_FILTER_STATE.USER_REMOVE);
		expect(store.getWordById("word-0")?.filterState).toBe(
			WORD_FILTER_STATE.USER_REMOVE
		);

		store.undoLastFilterChange();
		expect(
			useWordTimelineStore.getState().getWordById("word-0")?.filterState
		).toBe(WORD_FILTER_STATE.NONE);
	});

	it("returns only keepable words for export", () => {
		loadMockData();
		const store = useWordTimelineStore.getState();
		store.setFilterState("word-0", WORD_FILTER_STATE.AI);
		store.setFilterState("word-2", WORD_FILTER_STATE.USER_REMOVE);
		store.setFilterState("word-4", WORD_FILTER_STATE.USER_KEEP);

		const exportWords = store.getWordsForExport();
		expect(exportWords.map((word) => word.id)).toEqual(["word-4"]);
	});

	it("runs AI analysis and marks AI suggestions", async () => {
		loadMockData();

		await useWordTimelineStore.getState().analyzeFillers();
		const word = useWordTimelineStore.getState().getWordById("word-0");

		expect(word?.filterState).toBe(WORD_FILTER_STATE.AI);
		expect(word?.filterReason).toBe("filler word");
	});

	it("resets filters and re-runs AI analysis", async () => {
		loadMockData();
		const store = useWordTimelineStore.getState();
		store.setFilterState("word-2", WORD_FILTER_STATE.USER_REMOVE);

		await store.resetAllFilters();
		expect(
			useWordTimelineStore.getState().getWordById("word-0")?.filterState
		).toBe(WORD_FILTER_STATE.AI);
		expect(
			useWordTimelineStore.getState().getWordById("word-2")?.filterState
		).toBe(WORD_FILTER_STATE.NONE);
	});
});
