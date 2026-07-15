import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { cn } from "@/lib/utils";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import {
	WORD_FILTER_STATE,
	type WordFilterState,
	type WordItem,
} from "@/types/word-timeline";
import {
	getTimelineWordGeometry,
	getVisibleTimelineWords,
} from "./timeline-word-lane-layout";

const WORD_STATE_CLASS: Record<WordFilterState, string> = {
	[WORD_FILTER_STATE.NONE]:
		"border-sky-400/45 bg-sky-500/25 text-sky-50 hover:bg-sky-500/40",
	[WORD_FILTER_STATE.AI]:
		"border-amber-400/70 bg-amber-500/35 text-amber-50 hover:bg-amber-500/50",
	[WORD_FILTER_STATE.USER_REMOVE]:
		"border-red-400/70 bg-red-500/35 text-red-100 line-through opacity-75 hover:opacity-100",
	[WORD_FILTER_STATE.USER_KEEP]:
		"border-emerald-400/65 bg-emerald-500/30 text-emerald-50 hover:bg-emerald-500/45",
};

interface WordLaneViewport {
	scrollLeft: number;
	width: number;
}

export function TimelineWordLane({
	scrollContainerRef,
	words,
	zoomLevel,
}: {
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	words: WordItem[];
	zoomLevel: number;
}) {
	const selectedWordId = useWordTimelineStore((state) => state.selectedWordId);
	const selectWord = useWordTimelineStore((state) => state.selectWord);
	const setFilterState = useWordTimelineStore((state) => state.setFilterState);
	const [viewport, setViewport] = useState<WordLaneViewport>({
		scrollLeft: 0,
		width: 0,
	});
	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const updateViewport = () => {
			setViewport({
				scrollLeft: container.scrollLeft,
				width: container.clientWidth,
			});
		};
		updateViewport();
		container.addEventListener("scroll", updateViewport, { passive: true });
		const resizeObserver = new ResizeObserver(updateViewport);
		resizeObserver.observe(container);
		return () => {
			container.removeEventListener("scroll", updateViewport);
			resizeObserver.disconnect();
		};
	}, [scrollContainerRef]);

	const visibleWords = useMemo(
		() =>
			getVisibleTimelineWords({
				pixelsPerSecond,
				scrollLeft: viewport.scrollLeft,
				viewportWidth: viewport.width,
				words,
			}),
		[pixelsPerSecond, viewport.scrollLeft, viewport.width, words]
	);

	return (
		<div
			className="absolute inset-x-0 bottom-0 z-10 h-6 border-t border-border/70 bg-background/90"
			data-testid="timeline-word-lane"
		>
			{visibleWords.map((word) => {
				const geometry = getTimelineWordGeometry({ pixelsPerSecond, word });
				const selected = selectedWordId === word.id;
				const selectAndSeek = () => {
					selectWord(word.id);
					usePlaybackStore.getState().seek(word.start);
				};
				return (
					<button
						type="button"
						key={word.id}
						className={cn(
							"absolute inset-y-0.5 overflow-hidden border px-0.5 text-left text-[10px] leading-5 transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
							WORD_STATE_CLASS[word.filterState],
							selected && "z-20 border-white ring-2 ring-white/80"
						)}
						style={{ left: geometry.left, width: geometry.width }}
						aria-label={`${word.text}, ${word.start.toFixed(2)} to ${word.end.toFixed(2)} seconds`}
						aria-pressed={selected}
						title={`${word.text} (${word.start.toFixed(2)}s-${word.end.toFixed(2)}s)`}
						data-testid={`timeline-word-${word.id}`}
						data-word-id={word.id}
						data-filter-state={word.filterState}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation();
							selectAndSeek();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								event.stopPropagation();
								selectAndSeek();
								return;
							}
							if (event.key !== "Delete" && event.key !== "Backspace") {
								return;
							}
							event.preventDefault();
							event.stopPropagation();
							setFilterState(
								word.id,
								word.filterState === WORD_FILTER_STATE.USER_REMOVE
									? WORD_FILTER_STATE.USER_KEEP
									: WORD_FILTER_STATE.USER_REMOVE
							);
						}}
					>
						{geometry.width >= 12 ? (
							<span className="block truncate">{word.text}</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
