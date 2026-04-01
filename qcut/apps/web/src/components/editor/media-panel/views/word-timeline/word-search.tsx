/**
 * WordSearch — inline search bar for Smart Speech word timeline.
 *
 * Searches through loaded word data, highlights matches,
 * and navigates between them with Enter/Shift+Enter.
 *
 * @module components/editor/media-panel/views/word-timeline/word-search
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon, XIcon, ChevronUp, ChevronDown } from "lucide-react";
import type { WordItem } from "@/types/word-timeline";

interface WordSearchProps {
	words: WordItem[];
	onSeekToWord: (word: WordItem) => void;
	onHighlightedWordsChange: (wordIds: Set<string>) => void;
	onActiveMatchChange: (wordId: string | null) => void;
	onClose: () => void;
}

export function WordSearch({
	words,
	onSeekToWord,
	onHighlightedWordsChange,
	onActiveMatchChange,
	onClose,
}: WordSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);

	// Find matching words
	const matchedWords = useMemo(() => {
		if (!query.trim()) return [];
		const q = query.trim().toLowerCase();
		return words.filter(
			(w) => w.type === "word" && w.text.toLowerCase().includes(q)
		);
	}, [words, query]);

	// Notify parent of highlighted word IDs
	useEffect(() => {
		const ids = new Set(matchedWords.map((w) => w.id));
		onHighlightedWordsChange(ids);
		return () => onHighlightedWordsChange(new Set());
	}, [matchedWords, onHighlightedWordsChange]);

	// Update active match (clear on unmount to avoid stale highlight)
	useEffect(() => {
		if (matchedWords.length > 0 && activeIndex < matchedWords.length) {
			onActiveMatchChange(matchedWords[activeIndex].id);
		} else {
			onActiveMatchChange(null);
		}
		return () => onActiveMatchChange(null);
	}, [matchedWords, activeIndex, onActiveMatchChange]);

	// Reset active index and auto-seek tracking when query changes
	const hasNavigatedRef = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset state when query changes
	useEffect(() => {
		setActiveIndex(0);
		hasNavigatedRef.current = false;
	}, [query]);

	// Auto-seek to first match when results appear or query changes
	useEffect(() => {
		if (matchedWords.length > 0 && !hasNavigatedRef.current) {
			hasNavigatedRef.current = true;
			onSeekToWord(matchedWords[0]);
		}
	}, [matchedWords, onSeekToWord]);

	// Auto-focus on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const navigateToMatch = useCallback(
		(index: number) => {
			if (matchedWords.length === 0) return;
			const clampedIndex =
				((index % matchedWords.length) + matchedWords.length) %
				matchedWords.length;
			setActiveIndex(clampedIndex);
			onSeekToWord(matchedWords[clampedIndex]);
		},
		[matchedWords, onSeekToWord]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				if (e.shiftKey) {
					navigateToMatch(activeIndex - 1);
				} else {
					navigateToMatch(activeIndex + 1);
				}
			} else if (e.key === "Escape") {
				onClose();
			}
		},
		[navigateToMatch, activeIndex, onClose]
	);

	return (
		<div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/50">
			<SearchIcon className="size-3 text-muted-foreground shrink-0" />
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Find word..."
				className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 min-w-0"
				data-testid="word-search-input"
			/>
			{query && (
				<span className="text-[10px] text-muted-foreground shrink-0">
					{matchedWords.length > 0
						? `${activeIndex + 1}/${matchedWords.length}`
						: "0/0"}
				</span>
			)}
			{query && matchedWords.length > 0 && (
				<>
					<button
						type="button"
						onClick={() => navigateToMatch(activeIndex - 1)}
						className="text-muted-foreground hover:text-foreground p-0.5"
						aria-label="Previous match"
					>
						<ChevronUp className="size-3">
							<title>Previous match</title>
						</ChevronUp>
					</button>
					<button
						type="button"
						onClick={() => navigateToMatch(activeIndex + 1)}
						className="text-muted-foreground hover:text-foreground p-0.5"
						aria-label="Next match"
					>
						<ChevronDown className="size-3">
							<title>Next match</title>
						</ChevronDown>
					</button>
				</>
			)}
			<button
				type="button"
				onClick={onClose}
				className="text-muted-foreground hover:text-foreground p-0.5"
				aria-label="Close search"
			>
				<XIcon className="size-3">
					<title>Close search</title>
				</XIcon>
			</button>
		</div>
	);
}
