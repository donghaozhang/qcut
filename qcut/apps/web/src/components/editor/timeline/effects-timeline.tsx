import { useMemo, useState } from "react";
import { getTimelineElementDuration } from "@/lib/timeline";
import { useEffectsStore } from "@/stores/ai/effects-store";
import type { TimelineTrack } from "@/types/timeline";
import {
	getVisibleTimelineElements,
	type TimelineVisibleRange,
} from "./timeline-viewport";

interface EffectsTimelineProps {
	tracks: TimelineTrack[];
	pixelsPerSecond: number;
	visibleTimeRange?: TimelineVisibleRange;
}

const TRACK_HEIGHT = 64;
const EFFECT_COLORS: Record<string, string> = {
	brightness: "#fbbf24",
	contrast: "#f97316",
	saturation: "#ec4899",
	hue: "#22d3ee",
	blur: "#3b82f6",
	sepia: "#a78bfa",
	grayscale: "#6b7280",
	invert: "#e11d48",
};

export function EffectsTimeline({
	tracks,
	pixelsPerSecond,
	visibleTimeRange,
}: EffectsTimelineProps) {
	const activeEffects = useEffectsStore((state) => state.activeEffects);
	const [hoveredEffectName, setHoveredEffectName] = useState<string>();
	const visibleElements = useMemo(
		() =>
			tracks.flatMap((track) =>
				getVisibleTimelineElements({
					elements: track.elements,
					visibleRange: visibleTimeRange,
				})
			),
		[tracks, visibleTimeRange]
	);

	return (
		<div
			className="relative hover:bg-accent/5"
			style={{ height: `${TRACK_HEIGHT}px` }}
		>
			{visibleElements.flatMap((element) =>
				(activeEffects.get(element.id) ?? []).flatMap((effect, index) => {
					if (!effect.enabled) return [];
					const barHeight = 4;
					return [
						<div
							key={effect.id}
							className="absolute transition-opacity hover:opacity-100"
							style={{
								left: `${element.startTime * pixelsPerSecond}px`,
								width: `${getTimelineElementDuration({ element }) * pixelsPerSecond}px`,
								bottom: `${index * (barHeight + 1)}px`,
								height: `${barHeight}px`,
								backgroundColor: EFFECT_COLORS[effect.effectType] ?? "#9333ea",
								opacity: hoveredEffectName === effect.name ? 1 : 0.72,
							}}
							onMouseEnter={() => setHoveredEffectName(effect.name)}
							onMouseLeave={() => setHoveredEffectName(undefined)}
							title={`${effect.name} effect`}
							data-testid="timeline-effect-bar"
						/>,
					];
				})
			)}

			{hoveredEffectName ? (
				<div className="absolute right-2 top-0 text-xs text-muted-foreground">
					{hoveredEffectName}
				</div>
			) : null}
		</div>
	);
}
