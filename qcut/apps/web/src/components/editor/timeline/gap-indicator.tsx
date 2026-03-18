import { useEffect, useRef, useState } from "react";
import { DropdownMenu, DropdownMenuTrigger } from "../../ui/dropdown-menu";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type { TimelineGap } from "@/stores/timeline/gap-store";
import { useGapStore } from "@/stores/timeline/gap-store";
import {
	closeGapOnTimeline,
	isSameGap,
	pausePlaybackForGapInteraction,
} from "./gap-actions";
import { GapMenu } from "./gap-menu";

interface GapIndicatorProps {
	gap: TimelineGap;
	zoomLevel: number;
	trackHeight: number;
}

export function GapIndicator({
	gap,
	zoomLevel,
	trackHeight,
}: GapIndicatorProps) {
	const selectGap = useGapStore((s) => s.selectGap);
	const selectedGap = useGapStore((s) => s.selectedGap);
	const generatingGap = useGapStore((s) => s.generatingGap);
	const gapGenerateMode = useGapStore((s) => s.gapGenerateMode);
	const clearGapSelection = useGapStore((s) => s.clearGapSelection);
	const [menuOpen, setMenuOpen] = useState(false);
	const previousModeRef = useRef(gapGenerateMode);

	const gapDuration = gap.endTime - gap.startTime;
	const left = gap.startTime * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const width = gapDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

	const isSelected = isSameGap({ left: selectedGap, right: gap });

	// Check if this gap is currently being generated
	const isGenerating =
		generatingGap?.trackId === gap.trackId &&
		Math.abs(generatingGap.startTime - gap.startTime) < 0.01;

	const ensureGapSelected = () => {
		if (!isSameGap({ left: useGapStore.getState().selectedGap, right: gap })) {
			selectGap(gap);
		}
	};

	const openMenu = () => {
		pausePlaybackForGapInteraction();
		ensureGapSelected();
		setMenuOpen(true);
	};

	useEffect(() => {
		if (!isSelected || gapGenerateMode) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				clearGapSelection();
				return;
			}

			if (e.key !== "Delete" && e.key !== "Backspace") return;

			const target = e.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT")
			) {
				return;
			}

			closeGapOnTimeline({ gap });
			clearGapSelection();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [gap, gapGenerateMode, isSelected, clearGapSelection]);

	useEffect(() => {
		if (menuOpen && !isSelected) {
			setMenuOpen(false);
		}
	}, [isSelected, menuOpen]);

	useEffect(() => {
		const previousMode = previousModeRef.current;
		previousModeRef.current = gapGenerateMode;

		if (previousMode && !gapGenerateMode && isSelected) {
			setMenuOpen(true);
		}
	}, [gapGenerateMode, isSelected]);

	// Don't render gaps that are too narrow to interact with
	if (width < 4) return null;

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			openMenu();
			return;
		}

		setMenuOpen(false);

		requestAnimationFrame(() => {
			const state = useGapStore.getState();
			if (
				isSameGap({ left: state.selectedGap, right: gap }) &&
				!state.gapGenerateMode
			) {
				clearGapSelection();
			}
		});
	};

	return (
		<DropdownMenu open={menuOpen} onOpenChange={handleOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					aria-label={`Gap of ${gapDuration.toFixed(1)} seconds`}
					className={`absolute top-0 flex items-center justify-center rounded-sm border text-left transition-colors group/gap z-[15] ${
						isSelected
							? "border-blue-400 bg-blue-500/20"
							: isGenerating
								? "border-blue-500 bg-blue-500/10"
								: "border-blue-400/40 bg-blue-500/5 hover:border-blue-400/70 hover:bg-blue-500/10"
					} ${isGenerating ? "border-solid" : "border-dashed"}`}
					data-gap-indicator
					data-testid="gap-indicator"
					onClick={(e) => {
						e.stopPropagation();
						if (menuOpen) return;
						openMenu();
					}}
					onContextMenu={(e) => {
						e.preventDefault();
						e.stopPropagation();
						openMenu();
					}}
					onPointerDown={(e) => {
						e.stopPropagation();
					}}
					style={{
						left: `${left}px`,
						width: `${width}px`,
						height: `${trackHeight}px`,
					}}
					type="button"
				>
					{isGenerating ? (
						<GeneratingIndicator />
					) : (
						<GapLabel duration={gapDuration} width={width} />
					)}
				</button>
			</DropdownMenuTrigger>
			<GapMenu gap={gap} />
		</DropdownMenu>
	);
}

function GapLabel({ duration, width }: { duration: number; width: number }) {
	// Only show label if gap is wide enough
	if (width < 32) return null;

	return (
		<span className="text-[10px] text-blue-400/60 group-hover/gap:text-blue-400 transition-colors select-none pointer-events-none font-medium">
			{duration < 60
				? `${duration.toFixed(1)}s`
				: `${Math.floor(duration / 60)}m${Math.round(duration % 60)}s`}
		</span>
	);
}

function GeneratingIndicator() {
	const generatingGap = useGapStore((s) => s.generatingGap);
	if (!generatingGap) return null;

	const { segments, currentSegmentIndex, overallProgress } = generatingGap;
	const total = segments.length;
	const pct = Math.round(overallProgress * 100);

	return (
		<div className="flex flex-col items-center gap-0.5 pointer-events-none">
			<div className="flex items-center gap-1">
				<div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
				<span className="text-[9px] text-blue-400 font-medium">
					{total > 1 ? `${currentSegmentIndex + 1}/${total}` : `${pct}%`}
				</span>
			</div>
			{total > 1 && (
				<div className="flex gap-0.5">
					{segments.map((seg) => (
						<div
							key={seg.index}
							className={`h-1 w-2 rounded-full ${
								seg.status === "complete"
									? "bg-blue-400"
									: seg.status === "generating"
										? "bg-blue-400 animate-pulse"
										: seg.status === "failed"
											? "bg-red-400"
											: "bg-muted-foreground/30"
							}`}
						/>
					))}
				</div>
			)}
		</div>
	);
}
