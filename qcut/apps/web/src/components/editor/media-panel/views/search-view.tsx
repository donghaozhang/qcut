/**
 * SearchView — tabbed container for Text search and Semantic (visual) search.
 *
 * @module components/editor/media-panel/views/search-view
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SearchPanel } from "./search/SearchPanel";
import { SemanticSearchPanel } from "./search/SemanticSearchPanel";

type SearchMode = "text" | "visual";

export function SearchView() {
	const [mode, setMode] = useState<SearchMode>("visual");

	return (
		<div className="flex flex-col h-full">
			{/* Mode toggle */}
			<div className="flex items-center gap-1 px-3 pt-2 pb-1">
				<button
					type="button"
					onClick={() => setMode("text")}
					className={cn(
						"px-2.5 py-1 text-[0.65rem] rounded-md transition-colors",
						mode === "text"
							? "bg-primary/15 text-primary font-medium"
							: "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
					)}
					aria-pressed={mode === "text"}
				>
					Text
				</button>
				<button
					type="button"
					onClick={() => setMode("visual")}
					className={cn(
						"px-2.5 py-1 text-[0.65rem] rounded-md transition-colors",
						mode === "visual"
							? "bg-primary/15 text-primary font-medium"
							: "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
					)}
					aria-pressed={mode === "visual"}
				>
					Visual
				</button>
			</div>

			{/* Active panel */}
			<div className="flex-1 min-h-0">
				{mode === "text" ? <SearchPanel /> : <SemanticSearchPanel />}
			</div>
		</div>
	);
}
