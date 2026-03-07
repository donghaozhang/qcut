"use client";

import { useCallback, useEffect, useRef } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WordItem } from "@/types/word-timeline";
import { formatTime, getChipColor, getChipHelpText } from "./helpers";

export interface WordChipProps {
	word: WordItem;
	isSelected: boolean;
	onPrimaryAction: (word: WordItem) => void;
	onQuickRemove: (word: WordItem) => void;
}

/** Individual word chip with click/right-click actions and keyboard support. */
export function WordChip({
	word,
	isSelected,
	onPrimaryAction,
	onQuickRemove,
}: WordChipProps) {
	const buttonRef = useRef<HTMLButtonElement>(null);

	const handleClick = useCallback(() => {
		onPrimaryAction(word);
	}, [word, onPrimaryAction]);

	const handleRightClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			onQuickRemove(word);
		},
		[word, onQuickRemove]
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			try {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onPrimaryAction(word);
				}
			} catch {
				return;
			}
		},
		[onPrimaryAction, word]
	);

	// Auto-scroll into view when selected during playback
	useEffect(() => {
		if (isSelected && buttonRef.current) {
			buttonRef.current.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "nearest",
			});
		}
	}, [isSelected]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					ref={buttonRef}
					type="button"
					onClick={handleClick}
					onContextMenu={handleRightClick}
					onKeyDown={handleKeyDown}
					className={cn(
						"inline-flex items-center px-2 py-1 text-sm rounded transition-all",
						"hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring",
						getChipColor({ filterState: word.filterState }),
						isSelected && "ring-2 ring-primary ring-offset-1"
					)}
				>
					{word.text}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="text-xs">
				<p className="font-mono">
					{formatTime(word.start)} - {formatTime(word.end)}
				</p>
				{word.filterReason && (
					<p className="text-muted-foreground mt-1">{word.filterReason}</p>
				)}
				<p className="text-muted-foreground mt-1">
					{getChipHelpText({ word })}
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
