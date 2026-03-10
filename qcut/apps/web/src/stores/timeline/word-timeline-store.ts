/**
 * Word Timeline Store
 *
 * Zustand store for managing word-level transcription data and tri-state
 * filtering decisions from AI + user actions.
 *
 * @module stores/word-timeline-store
 */

import { platform } from "@qcut/platform-core";
import { create } from "zustand";
import type {
	WordTimelineData,
	WordItem,
	RawWordTimelineJson,
	RawWordItem,
	WordFilterState,
} from "@/types/word-timeline";
import { WORD_FILTER_STATE } from "@/types/word-timeline";

interface AnalyzeFillersResponse {
	filteredWordIds: Array<{
		id: string;
		reason: string;
		scope?: "word" | "sentence";
	}>;
	provider?: "gemini" | "anthropic" | "pattern";
}

interface FilterHistoryChange {
	id: string;
	nextState: WordFilterState;
	previousState: WordFilterState;
}

interface WordTimelineState {
	data: WordTimelineData | null;
	fileName: string | null;
	selectedWordId: string | null;
	isLoading: boolean;
	error: string | null;
	isAnalyzing: boolean;
	analysisError: string | null;
	filterHistory: FilterHistoryChange[][];
}

interface WordTimelineActions {
	loadFromJson: (file: File) => Promise<void>;
	loadFromData: (data: RawWordTimelineJson, fileName?: string) => void;
	loadFromTranscription: (
		data: {
			text: string;
			language_code: string;
			language_probability: number;
			words: Array<{
				text: string;
				start: number;
				end: number;
				type: string;
				speaker_id: string | null;
			}>;
		},
		fileName: string
	) => Promise<void>;
	analyzeFillers: () => Promise<void>;
	selectWord: (wordId: string | null) => void;
	setFilterState: (wordId: string, filterState: WordFilterState) => void;
	cycleFilterState: (wordId: string) => void;
	setMultipleFilterStates: (
		wordIds: string[],
		filterState: WordFilterState
	) => void;
	acceptAllAiSuggestions: () => void;
	resetAllFilters: () => Promise<void>;
	undoLastFilterChange: () => void;
	clearData: () => void;
	getVisibleWords: () => WordItem[];
	getWordById: (wordId: string) => WordItem | undefined;
	getWordsForExport: () => WordItem[];
	getNonDeletedWords: () => WordItem[];
}

type WordTimelineStore = WordTimelineState & WordTimelineActions;

const MAX_HISTORY_ENTRIES = 100;
const AI_REMOVAL_STATES = new Set<WordFilterState>([
	WORD_FILTER_STATE.AI,
	WORD_FILTER_STATE.USER_REMOVE,
]);

const initialState: WordTimelineState = {
	data: null,
	fileName: null,
	selectedWordId: null,
	isLoading: false,
	error: null,
	isAnalyzing: false,
	analysisError: null,
	filterHistory: [],
};

function isValidFilterState(value: unknown): value is WordFilterState {
	try {
		return (
			value === WORD_FILTER_STATE.NONE ||
			value === WORD_FILTER_STATE.AI ||
			value === WORD_FILTER_STATE.USER_REMOVE ||
			value === WORD_FILTER_STATE.USER_KEEP
		);
	} catch {
		return false;
	}
}

function normalizeFilterState({
	rawWord,
}: {
	rawWord: RawWordItem;
}): WordFilterState {
	try {
		if (isValidFilterState(rawWord.filterState)) {
			return rawWord.filterState;
		}
		if (rawWord.deleted) {
			return WORD_FILTER_STATE.USER_REMOVE;
		}
		return WORD_FILTER_STATE.NONE;
	} catch {
		return WORD_FILTER_STATE.NONE;
	}
}

function toWordItem({
	index,
	rawWord,
}: {
	index: number;
	rawWord: RawWordItem;
}): WordItem {
	try {
		return {
			id: rawWord.id || `word-${index}`,
			text: rawWord.text,
			start: rawWord.start,
			end: rawWord.end,
			type: rawWord.type,
			speaker_id: rawWord.speaker_id,
			filterState: normalizeFilterState({ rawWord }),
			filterReason: rawWord.filterReason,
		};
	} catch {
		return {
			id: `word-${index}`,
			text: "",
			start: 0,
			end: 0,
			type: "spacing",
			filterState: WORD_FILTER_STATE.NONE,
		};
	}
}

function transformWords({ rawWords }: { rawWords: RawWordItem[] }): WordItem[] {
	try {
		return rawWords.map((rawWord, index) => toWordItem({ rawWord, index }));
	} catch {
		return [];
	}
}

function validateJson(json: unknown): json is RawWordTimelineJson {
	try {
		if (typeof json !== "object" || json === null) {
			return false;
		}

		const obj = json as Record<string, unknown>;
		if (typeof obj.text !== "string") {
			return false;
		}
		if (!Array.isArray(obj.words)) {
			return false;
		}

		const words = obj.words as Array<unknown>;
		for (const word of words) {
			if (typeof word !== "object" || word === null) {
				return false;
			}

			const entry = word as Record<string, unknown>;
			if (typeof entry.text !== "string") {
				return false;
			}
			if (typeof entry.start !== "number" || !Number.isFinite(entry.start)) {
				return false;
			}
			if (typeof entry.end !== "number" || !Number.isFinite(entry.end)) {
				return false;
			}
			if (entry.type !== "word" && entry.type !== "spacing") {
				return false;
			}
		}

		return true;
	} catch {
		return false;
	}
}

function pushHistory({
	changes,
	history,
}: {
	changes: FilterHistoryChange[];
	history: FilterHistoryChange[][];
}): FilterHistoryChange[][] {
	try {
		if (changes.length === 0) {
			return history;
		}
		const nextHistory = [...history, changes];
		if (nextHistory.length <= MAX_HISTORY_ENTRIES) {
			return nextHistory;
		}
		return nextHistory.slice(nextHistory.length - MAX_HISTORY_ENTRIES);
	} catch {
		return history;
	}
}

function updateWordFilterStates({
	words,
	resolver,
}: {
	words: WordItem[];
	resolver: (word: WordItem) => WordFilterState;
}): { words: WordItem[]; changes: FilterHistoryChange[] } {
	try {
		const changes: FilterHistoryChange[] = [];
		const nextWords = words.map((word) => {
			const nextState = resolver(word);
			if (nextState === word.filterState) {
				return word;
			}

			changes.push({
				id: word.id,
				previousState: word.filterState,
				nextState,
			});
			return {
				...word,
				filterState: nextState,
			};
		});
		return { words: nextWords, changes };
	} catch {
		return { words, changes: [] };
	}
}

function getWordsForExportFromData({
	data,
}: {
	data: WordTimelineData | null;
}): WordItem[] {
	try {
		if (!data) {
			return [];
		}
		return data.words.filter(
			(word) =>
				word.type === "word" &&
				(word.filterState === WORD_FILTER_STATE.NONE ||
					word.filterState === WORD_FILTER_STATE.USER_KEEP)
		);
	} catch {
		return [];
	}
}

export const useWordTimelineStore = create<WordTimelineStore>((set, get) => ({
	...initialState,

	loadFromJson: async (file: File) => {
		set({ isLoading: true, error: null });
		try {
			const text = await file.text();
			const json = JSON.parse(text);

			if (!validateJson(json)) {
				throw new Error(
					"Invalid JSON format. Expected word timeline structure with 'text' and 'words' array."
				);
			}

			const words = transformWords({ rawWords: json.words });
			set({
				data: {
					text: json.text,
					language_code: json.language_code || "unknown",
					language_probability: json.language_probability || 0,
					words,
				},
				fileName: file.name,
				selectedWordId: null,
				isLoading: false,
				error: null,
				analysisError: null,
				filterHistory: [],
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load JSON file";
			set({
				isLoading: false,
				error: message,
			});
		}
	},

	loadFromData: (data: RawWordTimelineJson, fileName?: string) => {
		try {
			if (!validateJson(data)) {
				set({ error: "Invalid data format" });
				return;
			}

			const words = transformWords({ rawWords: data.words });
			set({
				data: {
					text: data.text,
					language_code: data.language_code || "unknown",
					language_probability: data.language_probability || 0,
					words,
				},
				fileName: fileName || "data.json",
				selectedWordId: null,
				isLoading: false,
				error: null,
				analysisError: null,
				filterHistory: [],
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Load failed";
			set({ error: message, isLoading: false });
		}
	},

	loadFromTranscription: async (data, fileName: string) => {
		try {
			const words: WordItem[] = data.words.map((word, index) => ({
				id: `word-${index}`,
				text: word.text,
				start: word.start,
				end: word.end,
				type: word.type === "word" ? "word" : "spacing",
				speaker_id: word.speaker_id ?? undefined,
				filterState: WORD_FILTER_STATE.NONE,
			}));

			set({
				data: {
					text: data.text,
					language_code: data.language_code || "unknown",
					language_probability: data.language_probability || 0,
					words,
				},
				fileName,
				selectedWordId: null,
				isLoading: false,
				error: null,
				analysisError: null,
				filterHistory: [],
			});

			await get().analyzeFillers();
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load transcription data";
			set({ error: message, isLoading: false });
		}
	},

	analyzeFillers: async () => {
		const { data } = get();
		if (!data) {
			return;
		}

		set({ isAnalyzing: true, analysisError: null });
		try {
			const analyzer = platform().analyzeFillers;
			if (!analyzer) {
				set({ isAnalyzing: false });
				return;
			}

			const result = (await analyzer({
				words: data.words,
				languageCode: data.language_code || "unknown",
			})) as AnalyzeFillersResponse;

			const reasonById = new Map<string, string>();
			for (const item of result.filteredWordIds || []) {
				if (!item.id) {
					continue;
				}
				reasonById.set(item.id, item.reason || "AI suggestion");
			}

			const words = data.words.map((word) => {
				const reason = reasonById.get(word.id);
				const isUserOverride =
					word.filterState === WORD_FILTER_STATE.USER_REMOVE ||
					word.filterState === WORD_FILTER_STATE.USER_KEEP;
				if (isUserOverride) {
					return word;
				}

				if (!reason) {
					if (word.filterState !== WORD_FILTER_STATE.AI) {
						return word;
					}
					return {
						...word,
						filterState: WORD_FILTER_STATE.NONE,
						filterReason: undefined,
					};
				}

				return {
					...word,
					filterState: WORD_FILTER_STATE.AI,
					filterReason: reason,
				};
			});

			set({
				data: { ...data, words },
				isAnalyzing: false,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "AI analysis failed";
			set({
				isAnalyzing: false,
				analysisError: message,
			});
		}
	},

	selectWord: (wordId: string | null) => {
		try {
			set({ selectedWordId: wordId });
		} catch {
			set({ selectedWordId: null });
		}
	},

	setFilterState: (wordId: string, filterState: WordFilterState) => {
		try {
			const { data, filterHistory } = get();
			if (!data) {
				return;
			}

			const { words, changes } = updateWordFilterStates({
				words: data.words,
				resolver: (word) => {
					if (word.id !== wordId) {
						return word.filterState;
					}
					return filterState;
				},
			});

			set({
				data: { ...data, words },
				filterHistory: pushHistory({ changes, history: filterHistory }),
			});
		} catch {
			return;
		}
	},

	cycleFilterState: (wordId: string) => {
		try {
			const word = get().getWordById(wordId);
			if (!word) {
				return;
			}

			if (word.filterState === WORD_FILTER_STATE.USER_KEEP) {
				get().setFilterState(wordId, WORD_FILTER_STATE.USER_REMOVE);
				return;
			}
			if (word.filterState === WORD_FILTER_STATE.AI) {
				get().setFilterState(wordId, WORD_FILTER_STATE.USER_KEEP);
				return;
			}
			if (word.filterState === WORD_FILTER_STATE.USER_REMOVE) {
				get().setFilterState(wordId, WORD_FILTER_STATE.USER_KEEP);
				return;
			}
			get().setFilterState(wordId, WORD_FILTER_STATE.USER_REMOVE);
		} catch {
			return;
		}
	},

	setMultipleFilterStates: (
		wordIds: string[],
		filterState: WordFilterState
	) => {
		try {
			const { data, filterHistory } = get();
			if (!data || wordIds.length === 0) {
				return;
			}

			const wordIdSet = new Set(wordIds);
			const { words, changes } = updateWordFilterStates({
				words: data.words,
				resolver: (word) => {
					if (!wordIdSet.has(word.id)) {
						return word.filterState;
					}
					return filterState;
				},
			});

			set({
				data: { ...data, words },
				filterHistory: pushHistory({ changes, history: filterHistory }),
			});
		} catch {
			return;
		}
	},

	acceptAllAiSuggestions: () => {
		try {
			const { data } = get();
			if (!data) {
				return;
			}

			const aiWordIds = data.words
				.filter((word) => word.filterState === WORD_FILTER_STATE.AI)
				.map((word) => word.id);
			get().setMultipleFilterStates(aiWordIds, WORD_FILTER_STATE.USER_REMOVE);
		} catch {
			return;
		}
	},

	resetAllFilters: async () => {
		try {
			const { data } = get();
			if (!data) {
				return;
			}

			const words = data.words.map((word) => ({
				...word,
				filterState: WORD_FILTER_STATE.NONE,
				filterReason: undefined,
			}));

			set({
				data: { ...data, words },
				filterHistory: [],
				analysisError: null,
			});
			await get().analyzeFillers();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to reset filters";
			set({ analysisError: message });
		}
	},

	undoLastFilterChange: () => {
		try {
			const { data, filterHistory } = get();
			if (!data || filterHistory.length === 0) {
				return;
			}

			const nextHistory = [...filterHistory];
			const lastChanges = nextHistory.pop();
			if (!lastChanges) {
				return;
			}

			const changeById = new Map(
				lastChanges.map((change) => [change.id, change.previousState])
			);
			const words = data.words.map((word) => {
				const previousState = changeById.get(word.id);
				if (!previousState) {
					return word;
				}
				return {
					...word,
					filterState: previousState,
				};
			});

			set({
				data: { ...data, words },
				filterHistory: nextHistory,
			});
		} catch {
			return;
		}
	},

	clearData: () => {
		try {
			set(initialState);
		} catch {
			set({ ...initialState });
		}
	},

	getVisibleWords: () => {
		try {
			const { data } = get();
			if (!data) {
				return [];
			}
			return data.words.filter((word) => word.type === "word");
		} catch {
			return [];
		}
	},

	getWordById: (wordId: string) => {
		try {
			const { data } = get();
			if (!data) {
				return;
			}
			return data.words.find((word) => word.id === wordId);
		} catch {
			return;
		}
	},

	getWordsForExport: () => {
		try {
			const { data } = get();
			return getWordsForExportFromData({ data });
		} catch {
			return [];
		}
	},

	getNonDeletedWords: () => {
		try {
			const { data } = get();
			if (!data) {
				return [];
			}
			return data.words.filter(
				(word) =>
					word.type === "word" && !AI_REMOVAL_STATES.has(word.filterState)
			);
		} catch {
			return [];
		}
	},
}));
