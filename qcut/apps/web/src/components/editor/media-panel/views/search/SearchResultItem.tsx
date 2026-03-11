/**
 * SearchResultItem — renders a single search result with highlighted match text.
 *
 * @module components/editor/media-panel/views/search/SearchResultItem
 */

import { cn } from "@/lib/utils";
import type { SearchResult } from "@qcut/editor-core";

interface SearchResultItemProps {
	result: SearchResult;
	index: number;
	isSelected: boolean;
	onClick: (index: number) => void;
}

/** Format seconds to MM:SS or HH:MM:SS timestamp. */
function formatTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
	return `${m}:${String(s).padStart(2, "0")}`;
}

/** Render segment text with the matched portion highlighted. */
function HighlightedText({
	text,
	matchStart,
	matchEnd,
}: {
	text: string;
	matchStart: number;
	matchEnd: number;
}) {
	const before = text.slice(0, matchStart);
	const match = text.slice(matchStart, matchEnd);
	const after = text.slice(matchEnd);

	return (
		<span className="text-xs leading-relaxed">
			<span className="text-muted-foreground">{before}</span>
			<mark className="bg-yellow-400/30 text-foreground font-medium rounded-sm px-0.5">
				{match}
			</mark>
			<span className="text-muted-foreground">{after}</span>
		</span>
	);
}

/** Individual search result row with media name, timestamp, and highlighted text. */
export function SearchResultItem({
	result,
	index,
	isSelected,
	onClick,
}: SearchResultItemProps) {
	const timestamp = result.wordTimestamp ?? result.timestamp;

	return (
		<button
			type="button"
			className={cn(
				"w-full text-left px-3 py-2 border-b border-border/20 transition-colors cursor-pointer",
				"hover:bg-foreground/5",
				isSelected && "bg-primary/10 border-l-2 border-l-primary"
			)}
			onClick={() => onClick(index)}
			data-testid={`search-result-${index}`}
		>
			<div className="flex items-center gap-2 mb-0.5">
				<span className="text-[0.65rem] font-medium text-foreground/70 truncate max-w-[60%]">
					{result.mediaName}
				</span>
				<span className="text-[0.6rem] font-mono text-primary/80 ml-auto shrink-0">
					{formatTimestamp(timestamp)}
				</span>
			</div>
			<HighlightedText
				text={result.segmentText}
				matchStart={result.matchStart}
				matchEnd={result.matchEnd}
			/>
		</button>
	);
}
