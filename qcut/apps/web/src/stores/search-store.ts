/**
 * Search Store — manages search state for transcription-based content search.
 *
 * Handles search queries, result management, and navigation to timestamps.
 * Integrates with playback-store for seeking and project-store for context.
 *
 * @module stores/search-store
 */

import { create } from "zustand";
import {
	searchTranscriptions,
	type SearchResult,
	type SearchOptions,
	type PersistedTranscription,
	type TranscriptionAvailability,
} from "@qcut/editor-core";

// ── Types ────────────────────────────────────────────────────────────

export interface SearchState {
	/** Current search query string. */
	query: string;
	/** Search results from the latest query. */
	results: SearchResult[];
	/** Whether a search is currently in progress. */
	isSearching: boolean;
	/** Index of the currently selected/highlighted result. */
	selectedResultIndex: number | null;
	/** Transcription availability status per media ID. */
	transcriptionStatus: Record<string, TranscriptionAvailability>;
	/** Cached transcriptions loaded for the current project. */
	transcriptions: PersistedTranscription[];
	/** Whether search options panel is expanded. */
	caseSensitive: boolean;
	wholeWord: boolean;
}

export interface SearchActions {
	setQuery: (query: string) => void;
	setCaseSensitive: (value: boolean) => void;
	setWholeWord: (value: boolean) => void;
	/** Load transcriptions from storage and execute search. */
	search: (transcriptions?: PersistedTranscription[]) => void;
	/** Set loaded transcriptions (called externally when project loads). */
	setTranscriptions: (transcriptions: PersistedTranscription[]) => void;
	/** Update transcription status for a media item. */
	setTranscriptionStatus: (
		mediaId: string,
		status: TranscriptionAvailability
	) => void;
	/** Select a result by index. */
	selectResult: (index: number) => void;
	/** Navigate to a result — seeks playback to its timestamp. */
	navigateToResult: (index: number) => void;
	/** Navigate to next result. */
	nextResult: () => void;
	/** Navigate to previous result. */
	prevResult: () => void;
	/** Clear search state. */
	clearSearch: () => void;
}

export type SearchStore = SearchState & SearchActions;

// ── Store ────────────────────────────────────────────────────────────

export const useSearchStore = create<SearchStore>((set, get) => ({
	// State
	query: "",
	results: [],
	isSearching: false,
	selectedResultIndex: null,
	transcriptionStatus: {},
	transcriptions: [],
	caseSensitive: false,
	wholeWord: false,

	// Actions
	setQuery: (query: string) => {
		set({ query });
		// Auto-search when query changes
		get().search();
	},

	setCaseSensitive: (caseSensitive: boolean) => {
		set({ caseSensitive });
		get().search();
	},

	setWholeWord: (wholeWord: boolean) => {
		set({ wholeWord });
		get().search();
	},

	search: (externalTranscriptions?: PersistedTranscription[]) => {
		const state = get();
		const query = state.query.trim();

		if (!query) {
			set({ results: [], isSearching: false, selectedResultIndex: null });
			return;
		}

		const transcriptions = externalTranscriptions ?? state.transcriptions;

		set({ isSearching: true });

		const options: SearchOptions = {
			query,
			caseSensitive: state.caseSensitive,
			wholeWord: state.wholeWord,
			maxResults: 500,
		};

		const results = searchTranscriptions(transcriptions, options);

		set({
			results,
			isSearching: false,
			selectedResultIndex: results.length > 0 ? 0 : null,
			// Update transcriptions cache if provided externally
			...(externalTranscriptions ? { transcriptions: externalTranscriptions } : {}),
		});
	},

	setTranscriptions: (transcriptions: PersistedTranscription[]) => {
		set({ transcriptions });
		// Update status for all loaded transcriptions
		const status = { ...get().transcriptionStatus };
		for (const t of transcriptions) {
			status[t.mediaId] = "ready";
		}
		set({ transcriptionStatus: status });
		// Re-run search with new data if there's an active query
		if (get().query.trim()) {
			get().search(transcriptions);
		}
	},

	setTranscriptionStatus: (
		mediaId: string,
		status: TranscriptionAvailability
	) => {
		set((state) => ({
			transcriptionStatus: {
				...state.transcriptionStatus,
				[mediaId]: status,
			},
		}));
	},

	selectResult: (index: number) => {
		const { results } = get();
		if (index >= 0 && index < results.length) {
			set({ selectedResultIndex: index });
		}
	},

	navigateToResult: (index: number) => {
		const { results } = get();
		if (index < 0 || index >= results.length) return;

		set({ selectedResultIndex: index });

		const result = results[index];
		const seekTime = result.wordTimestamp ?? result.timestamp;

		// Lazy-import playback store to avoid circular deps
		import("@/stores/editor/playback-store").then(({ usePlaybackStore }) => {
			usePlaybackStore.getState().setCurrentTime(seekTime);
		});
	},

	nextResult: () => {
		const { results, selectedResultIndex } = get();
		if (!results.length) return;
		const nextIndex =
			selectedResultIndex === null
				? 0
				: (selectedResultIndex + 1) % results.length;
		get().navigateToResult(nextIndex);
	},

	prevResult: () => {
		const { results, selectedResultIndex } = get();
		if (!results.length) return;
		const prevIndex =
			selectedResultIndex === null
				? results.length - 1
				: (selectedResultIndex - 1 + results.length) % results.length;
		get().navigateToResult(prevIndex);
	},

	clearSearch: () => {
		set({
			query: "",
			results: [],
			isSearching: false,
			selectedResultIndex: null,
		});
	},
}));
