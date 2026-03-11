/**
 * SearchPanel — search transcription content by word or phrase.
 *
 * Provides a search input, options toggles, and a scrollable results list.
 * Clicking a result seeks the playback to the matching timestamp.
 *
 * @module components/editor/media-panel/views/search/SearchPanel
 */

import { useCallback, useEffect, useRef } from "react";
import {
	SearchIcon,
	XIcon,
	CaseSensitiveIcon,
	WholeWordIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchStore } from "@/stores/search-store";
import { SearchResultItem } from "./SearchResultItem";

/** Debounce delay for search input (ms). */
const DEBOUNCE_MS = 300;

/** Main search panel component for the media panel. */
export function SearchPanel() {
	const {
		query,
		results,
		isSearching,
		selectedResultIndex,
		caseSensitive,
		wholeWord,
		transcriptionStatus,
		setQuery,
		setCaseSensitive,
		setWholeWord,
		navigateToResult,
		nextResult,
		prevResult,
		clearSearch,
	} = useSearchStore();

	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				setQuery(value);
			}, DEBOUNCE_MS);
		},
		[setQuery]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				if (e.shiftKey) {
					prevResult();
				} else {
					nextResult();
				}
			} else if (e.key === "Escape") {
				if (debounceRef.current) clearTimeout(debounceRef.current);
				clearSearch();
				if (inputRef.current) inputRef.current.value = "";
			}
		},
		[nextResult, prevResult, clearSearch]
	);

	useEffect(() => {
		inputRef.current?.focus();
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	const statusValues = Object.values(transcriptionStatus);
	const transcribedCount = statusValues.filter((s) => s === "ready").length;
	const totalCount = statusValues.length;

	return (
		<div className="flex flex-col h-full" data-testid="search-panel">
			{/* Search input */}
			<div className="px-3 pt-3 pb-2 border-b border-border/30">
				<div className="flex items-center gap-1.5 bg-foreground/5 rounded-md px-2.5 py-1.5">
					<SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Search transcriptions..."
						defaultValue={query}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
						data-testid="search-input"
					/>
					{query && (
						<button
							type="button"
							onClick={() => {
								if (debounceRef.current) clearTimeout(debounceRef.current);
								clearSearch();
								if (inputRef.current) inputRef.current.value = "";
							}}
							className="text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Clear search"
						>
							<XIcon className="size-3.5" />
						</button>
					)}
				</div>

				{/* Options row */}
				<div className="flex items-center gap-2 mt-2">
					<button
						type="button"
						onClick={() => {
							// Flush pending debounce so search uses current input value
							if (debounceRef.current) {
								clearTimeout(debounceRef.current);
								if (inputRef.current) setQuery(inputRef.current.value);
							}
							setCaseSensitive(!caseSensitive);
						}}
						className={cn(
							"flex items-center gap-1 text-[0.6rem] px-1.5 py-0.5 rounded transition-colors",
							caseSensitive
								? "bg-primary/20 text-primary"
								: "text-muted-foreground hover:text-foreground"
						)}
						title="Case Sensitive"
						aria-pressed={caseSensitive}
						aria-label="Case sensitive search"
						data-testid="search-case-sensitive"
					>
						<CaseSensitiveIcon className="size-3" />
						<span>Aa</span>
					</button>
					<button
						type="button"
						onClick={() => {
							// Flush pending debounce so search uses current input value
							if (debounceRef.current) {
								clearTimeout(debounceRef.current);
								if (inputRef.current) setQuery(inputRef.current.value);
							}
							setWholeWord(!wholeWord);
						}}
						className={cn(
							"flex items-center gap-1 text-[0.6rem] px-1.5 py-0.5 rounded transition-colors",
							wholeWord
								? "bg-primary/20 text-primary"
								: "text-muted-foreground hover:text-foreground"
						)}
						title="Whole Word"
						aria-pressed={wholeWord}
						aria-label="Whole word search"
						data-testid="search-whole-word"
					>
						<WholeWordIcon className="size-3" />
						<span>W</span>
					</button>

					{totalCount > 0 && (
						<span className="text-[0.6rem] text-muted-foreground ml-auto">
							{transcribedCount}/{totalCount} transcribed
						</span>
					)}
				</div>
			</div>

			{/* Results area */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{isSearching && (
					<div className="p-4 text-center text-sm text-muted-foreground">
						Searching...
					</div>
				)}

				{!isSearching && !query && (
					<div className="p-4 text-center text-sm text-muted-foreground">
						<SearchIcon className="size-8 mx-auto mb-2 opacity-30" />
						<p>Search transcription content</p>
						<p className="text-[0.65rem] mt-1 opacity-70">
							Enter a word or phrase to find it across your media
						</p>
					</div>
				)}

				{!isSearching && query && results.length === 0 && (
					<div
						className="p-4 text-center text-sm text-muted-foreground"
						data-testid="search-no-results"
					>
						<p>No results found</p>
						<p className="text-[0.65rem] mt-1 opacity-70">
							Try a different search term or transcribe more media
						</p>
					</div>
				)}

				{!isSearching && results.length > 0 && (
					<>
						<div className="px-3 py-1.5 text-[0.6rem] text-muted-foreground border-b border-border/20">
							{results.length} result{results.length !== 1 ? "s" : ""}
							{" · Enter/Shift+Enter to navigate"}
						</div>
						<div data-testid="search-results-list">
							{results.map((result, index) => (
								<SearchResultItem
									key={`${result.mediaId}-${result.timestamp}-${result.matchStart}`}
									result={result}
									index={index}
									isSelected={selectedResultIndex === index}
									onClick={navigateToResult}
								/>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
