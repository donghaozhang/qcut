/**
 * Gap Indicator
 *
 * Renders a clickable dashed-border indicator between timeline clips
 * where empty space (gap) exists. Clicking opens a popover menu
 * to fill with AI video/image or close the gap.
 *
 * @module components/editor/timeline/gap-indicator
 */

import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type { TimelineGap } from "@/stores/timeline/gap-store";
import { useGapStore } from "@/stores/timeline/gap-store";

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

	const gapDuration = gap.endTime - gap.startTime;
	const left = gap.startTime * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const width = gapDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

	// Don't render gaps that are too narrow to interact with
	if (width < 4) return null;

	const isSelected =
		selectedGap?.trackId === gap.trackId &&
		Math.abs(selectedGap.startTime - gap.startTime) < 0.01;

	// Check if this gap is currently being generated
	const isGenerating =
		generatingGap?.trackId === gap.trackId &&
		Math.abs(generatingGap.startTime - gap.startTime) < 0.01;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		const rect = e.currentTarget.getBoundingClientRect();
		selectGap(gap, {
			x: rect.left + rect.width / 2,
			top: rect.top,
			bottom: rect.bottom,
		});
	};

	return (
		<div
			className={`absolute top-0 flex items-center justify-center cursor-pointer transition-colors group/gap ${
				isSelected
					? "border-blue-400 bg-blue-500/15"
					: isGenerating
						? "border-blue-500 bg-blue-500/10"
						: "border-muted-foreground/30 hover:border-blue-400/60 hover:bg-blue-500/5"
			} ${isGenerating ? "border-solid" : "border-dashed"} border rounded-sm`}
			style={{
				left: `${left}px`,
				width: `${width}px`,
				height: `${trackHeight}px`,
			}}
			onClick={handleClick}
			data-testid="gap-indicator"
		>
			{isGenerating ? (
				<GeneratingIndicator />
			) : (
				<GapLabel duration={gapDuration} width={width} />
			)}
		</div>
	);
}

function GapLabel({ duration, width }: { duration: number; width: number }) {
	// Only show label if gap is wide enough
	if (width < 32) return null;

	return (
		<span className="text-[9px] text-muted-foreground/50 group-hover/gap:text-muted-foreground/80 transition-colors select-none pointer-events-none">
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
