/**
 * SemanticSearchPanel — search video content by meaning using embeddings.
 *
 * Users type a natural language description and get back timestamped
 * video segments with thumbnails, ranked by similarity.
 *
 * @module components/editor/media-panel/views/search/SemanticSearchPanel
 */

import { useCallback, useEffect, useRef } from "react";
import { SearchIcon, XIcon, Loader2Icon, DatabaseIcon } from "lucide-react";
import { useVideoSearchStore } from "@/stores/video-search-store";
import { useProjectStore } from "@/stores/project-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { SemanticSearchResultItem } from "./SemanticSearchResultItem";

const DEBOUNCE_MS = 500;

export function SemanticSearchPanel() {
	const {
		query,
		results,
		isSearching,
		searchError,
		isIndexing,
		indexingProgress,
		indexedMediaIds,
		providerAvailable,
		setQuery,
		search,
		clearResults,
		loadIndexedStatus,
		checkProvider,
		setupListeners,
		cleanupListeners,
	} = useVideoSearchStore();

	const activeProject = useProjectStore((s) => s.activeProject);
	const projectId = activeProject?.id;

	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Setup on mount
	useEffect(() => {
		checkProvider();
		setupListeners();
		if (projectId) loadIndexedStatus(projectId);

		return () => {
			cleanupListeners();
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [projectId, checkProvider, setupListeners, cleanupListeners, loadIndexedStatus]);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setQuery(value);

			if (debounceRef.current) clearTimeout(debounceRef.current);
			if (!value.trim()) {
				clearResults();
				return;
			}

			debounceRef.current = setTimeout(() => {
				if (projectId) search(projectId);
			}, DEBOUNCE_MS);
		},
		[setQuery, search, clearResults, projectId],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				if (debounceRef.current) clearTimeout(debounceRef.current);
				clearResults();
				if (inputRef.current) inputRef.current.value = "";
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (debounceRef.current) clearTimeout(debounceRef.current);
				if (projectId) search(projectId);
			}
		},
		[clearResults, search, projectId],
	);

	const handleResultClick = useCallback((startTime: number) => {
		usePlaybackStore.setState({ currentTime: startTime });
	}, []);

	// Provider not available
	if (providerAvailable === false) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-4 text-center">
				<DatabaseIcon className="size-8 mb-2 opacity-30 text-muted-foreground" />
				<p className="text-sm text-muted-foreground">Gemini API key required</p>
				<p className="text-[0.65rem] mt-1 text-muted-foreground/70">
					Set your Gemini API key in Settings to enable visual search
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full" data-testid="semantic-search-panel">
			{/* Search input */}
			<div className="px-3 pt-3 pb-2 border-b border-border/30">
				<div className="flex items-center gap-1.5 bg-foreground/5 rounded-md px-2.5 py-1.5">
					<SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Search by meaning..."
						defaultValue={query}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
						data-testid="semantic-search-input"
					/>
					{isSearching && (
						<Loader2Icon className="size-3.5 text-muted-foreground animate-spin shrink-0" />
					)}
					{query && !isSearching && (
						<button
							type="button"
							onClick={() => {
								if (debounceRef.current) clearTimeout(debounceRef.current);
								clearResults();
								if (inputRef.current) inputRef.current.value = "";
							}}
							className="text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Clear search"
						>
							<XIcon className="size-3.5" />
						</button>
					)}
				</div>

				{/* Status row */}
				<div className="flex items-center gap-2 mt-2">
					<span className="text-[0.6rem] text-muted-foreground">
						{indexedMediaIds.length} media indexed
					</span>
					{isIndexing && indexingProgress && (
						<span className="text-[0.6rem] text-primary ml-auto">
							{indexingProgress.phase === "embedding"
								? `Embedding ${indexingProgress.current}/${indexingProgress.total}`
								: indexingProgress.phase}
						</span>
					)}
				</div>
			</div>

			{/* Results area */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{searchError && (
					<div className="p-4 text-center text-sm text-destructive/80">
						{searchError}
					</div>
				)}

				{!isSearching && !query && !searchError && (
					<div className="p-4 text-center text-sm text-muted-foreground">
						<SearchIcon className="size-8 mx-auto mb-2 opacity-30" />
						<p>Search by visual content</p>
						<p className="text-[0.65rem] mt-1 opacity-70">
							Describe what you&apos;re looking for in natural language
						</p>
					</div>
				)}

				{!isSearching && query && results.length === 0 && !searchError && (
					<div className="p-4 text-center text-sm text-muted-foreground" data-testid="semantic-no-results">
						<p>No matches found</p>
						<p className="text-[0.65rem] mt-1 opacity-70">
							Try a different description or index more media
						</p>
					</div>
				)}

				{results.length > 0 && (
					<>
						<div className="px-3 py-1.5 text-[0.6rem] text-muted-foreground border-b border-border/20">
							{results.length} result{results.length !== 1 ? "s" : ""}
						</div>
						<div data-testid="semantic-search-results">
							{results.map((result) => (
								<SemanticSearchResultItem
									key={`${result.mediaId}-${result.chunkIndex}`}
									result={result}
									onClick={handleResultClick}
								/>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
