/**
 * Gap Popover
 *
 * Floating menu shown when a gap is clicked on the timeline.
 * Provides options: Fill with Video, Fill with Image, Close Gap.
 *
 * @module components/editor/timeline/gap-popover
 */

import { useEffect, useCallback } from "react";
import { useGapStore } from "@/stores/timeline/gap-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { closeGapInTracks } from "@/stores/timeline/gap-store";

export function GapPopover() {
	const selectedGap = useGapStore((s) => s.selectedGap);
	const anchor = useGapStore((s) => s.gapAnchorPosition);
	const mode = useGapStore((s) => s.gapGenerateMode);
	const clearGapSelection = useGapStore((s) => s.clearGapSelection);
	const setGapGenerateMode = useGapStore((s) => s.setGapGenerateMode);

	const handleCloseGap = useCallback(() => {
		if (!selectedGap) return;
		const store = useTimelineStore.getState();
		store.pushHistory();
		const newTracks = closeGapInTracks(store._tracks, selectedGap);
		// Use restoreTracks to apply the change and save
		store.restoreTracks(newTracks);
		clearGapSelection();
	}, [selectedGap, clearGapSelection]);

	// Escape to dismiss
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				clearGapSelection();
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				const target = e.target;
				if (
					target instanceof HTMLElement &&
					(target.isContentEditable ||
						target.tagName === "INPUT" ||
						target.tagName === "TEXTAREA" ||
						target.tagName === "SELECT")
				)
					return;
				handleCloseGap();
			}
		};
		if (selectedGap && !mode) {
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}
	}, [selectedGap, mode, clearGapSelection, handleCloseGap]);

	if (!selectedGap || mode || !anchor) return null;

	const gapDuration = selectedGap.endTime - selectedGap.startTime;

	// Popover positioning
	const POPOVER_W = 200;
	const POPOVER_H = 136;
	const GAP_PX = 4;
	const MARGIN = 8;
	const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
	const vh = typeof window !== "undefined" ? window.innerHeight : 800;

	const left = Math.max(
		MARGIN,
		Math.min(anchor.x - POPOVER_W / 2, vw - POPOVER_W - MARGIN)
	);
	const spaceBelow = vh - anchor.bottom - GAP_PX;
	const openAbove = spaceBelow < POPOVER_H + MARGIN;
	const rawTop = openAbove
		? anchor.top - GAP_PX - POPOVER_H
		: anchor.bottom + GAP_PX;
	const top = Math.max(MARGIN, Math.min(rawTop, vh - POPOVER_H - MARGIN));

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-[90]"
				onClick={() => clearGapSelection()}
			/>
			{/* Menu */}
			<div
				className="fixed z-[100] bg-popover border border-border rounded-lg shadow-2xl overflow-hidden py-1"
				style={{ left, top, width: POPOVER_W }}
			>
				<p className="text-[10px] text-muted-foreground font-medium px-3 pt-1.5 pb-1.5">
					{gapDuration.toFixed(1)}s gap selected
				</p>
				<div className="h-px bg-border mx-0 mb-1" />
				<button
					type="button"
					onClick={() => setGapGenerateMode("text-to-image")}
					className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
				>
					Fill with Image
				</button>
				<button
					type="button"
					onClick={() => setGapGenerateMode("text-to-video")}
					className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
				>
					Fill with Video
				</button>
				<div className="h-px bg-border mx-0 my-1" />
				<button
					type="button"
					onClick={handleCloseGap}
					className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center justify-between"
				>
					<span>Close gap</span>
					<kbd className="px-1 py-0.5 rounded bg-muted border border-border text-muted-foreground text-[9px] font-mono leading-none">
						Del
					</kbd>
				</button>
			</div>
		</>
	);
}
