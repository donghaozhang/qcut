/**
 * Speed region row — renders speed adjustment regions below the main timeline.
 * Each region is an orange-tinted block with drag handles for resize.
 */

import { useCallback, useRef, useState } from "react";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import type { SpeedRegion } from "@/lib/screen-recording/speed-regions";
import { Trash2 } from "lucide-react";

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 3, 4] as const;

interface SpeedRegionRowProps {
	/** Total timeline duration in ms */
	totalDurationMs: number;
	/** Width of the timeline track in px */
	trackWidthPx: number;
	/** Currently selected region ID */
	selectedId: string | null;
	onSelect: (id: string | null) => void;
}

export function SpeedRegionRow({
	totalDurationMs,
	trackWidthPx,
	selectedId,
	onSelect,
}: SpeedRegionRowProps) {
	const speedRegions = useScreenRecordingEnhancementStore(
		(s) => s.speedRegions
	);
	const updateSpeedRegion = useScreenRecordingEnhancementStore(
		(s) => s.updateSpeedRegion
	);
	const removeSpeedRegion = useScreenRecordingEnhancementStore(
		(s) => s.removeSpeedRegion
	);

	if (speedRegions.length === 0 || totalDurationMs <= 0) return null;

	const msToX = (ms: number) => (ms / totalDurationMs) * trackWidthPx;

	return (
		<div
			className="relative h-6 w-full border-t border-border/30"
			data-testid="speed-region-row"
		>
			{speedRegions.map((region) => (
				<SpeedRegionBlock
					key={region.id}
					region={region}
					left={msToX(region.startMs)}
					width={msToX(region.endMs - region.startMs)}
					selected={selectedId === region.id}
					onSelect={() => onSelect(region.id)}
					onUpdate={(updates) => updateSpeedRegion(region.id, updates)}
					onDelete={() => {
						removeSpeedRegion(region.id);
						if (selectedId === region.id) onSelect(null);
					}}
					pxPerMs={trackWidthPx / totalDurationMs}
					totalDurationMs={totalDurationMs}
				/>
			))}
		</div>
	);
}

interface SpeedRegionBlockProps {
	region: SpeedRegion;
	left: number;
	width: number;
	selected: boolean;
	onSelect: () => void;
	onUpdate: (updates: Partial<SpeedRegion>) => void;
	onDelete: () => void;
	pxPerMs: number;
	totalDurationMs: number;
}

function SpeedRegionBlock({
	region,
	left,
	width,
	selected,
	onSelect,
	onUpdate,
	onDelete,
	pxPerMs,
	totalDurationMs,
}: SpeedRegionBlockProps) {
	const [dragging, setDragging] = useState<"left" | "right" | null>(null);
	const dragRef = useRef<{ startX: number; startMs: number; endMs: number }>({
		startX: 0,
		startMs: region.startMs,
		endMs: region.endMs,
	});

	const handleDragStart = useCallback(
		(edge: "left" | "right", e: React.PointerEvent) => {
			e.stopPropagation();
			e.preventDefault();
			setDragging(edge);
			dragRef.current = {
				startX: e.clientX,
				startMs: region.startMs,
				endMs: region.endMs,
			};

			const onMove = (me: PointerEvent) => {
				const dx = me.clientX - dragRef.current.startX;
				const dMs = dx / pxPerMs;
				if (edge === "left") {
					const newStart = Math.max(
						0,
						Math.min(
							Math.round(dragRef.current.startMs + dMs),
							dragRef.current.endMs - 1
						)
					);
					onUpdate({ startMs: newStart });
				} else {
					const newEnd = Math.min(
						totalDurationMs,
						Math.max(
							Math.round(dragRef.current.endMs + dMs),
							dragRef.current.startMs + 1
						)
					);
					onUpdate({ endMs: newEnd });
				}
			};
			const onUp = () => {
				setDragging(null);
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[pxPerMs, region.startMs, region.endMs, onUpdate, totalDurationMs]
	);

	const speedLabel = region.speed === 1 ? "1x" : `${region.speed}x`;

	return (
		<div
			className={`absolute top-0 h-full flex items-center justify-center cursor-pointer select-none ${
				selected
					? "bg-orange-500/25 border border-orange-400"
					: "bg-orange-500/15 border border-orange-500/30"
			}`}
			style={{ left: `${left}px`, width: `${Math.max(width, 4)}px` }}
			onClick={(e) => {
				e.stopPropagation();
				onSelect();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			role="button"
			tabIndex={0}
			aria-label={`Speed region ${region.speed}x`}
			data-testid={`speed-region-${region.id}`}
		>
			{/* Left drag handle */}
			<div
				className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-orange-400/50"
				onPointerDown={(e) => handleDragStart("left", e)}
			/>

			{/* Speed label */}
			<span className="text-[10px] font-medium text-orange-300 pointer-events-none truncate px-2">
				{speedLabel}
			</span>

			{/* Right drag handle */}
			<div
				className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-orange-400/50"
				onPointerDown={(e) => handleDragStart("right", e)}
			/>

			{/* Delete button on selection */}
			{selected && (
				<button
					type="button"
					className="absolute -top-5 right-0 p-0.5 bg-destructive text-destructive-foreground rounded text-[10px]"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					aria-label="Delete speed region"
				>
					<Trash2 className="h-3 w-3" />
				</button>
			)}
		</div>
	);
}

/** Speed selector for properties panel */
export function SpeedRegionProperties({
	regionId,
}: {
	regionId: string | null;
}) {
	const speedRegions = useScreenRecordingEnhancementStore(
		(s) => s.speedRegions
	);
	const updateSpeedRegion = useScreenRecordingEnhancementStore(
		(s) => s.updateSpeedRegion
	);
	const removeSpeedRegion = useScreenRecordingEnhancementStore(
		(s) => s.removeSpeedRegion
	);

	const region = regionId ? speedRegions.find((r) => r.id === regionId) : null;
	if (!region) return null;

	return (
		<div className="space-y-2 p-2" data-testid="speed-region-properties">
			<span className="text-xs font-medium">Speed Region</span>

			{/* Speed selector */}
			<div className="flex flex-wrap gap-1">
				{SPEED_OPTIONS.map((s) => (
					<button
						key={s}
						type="button"
						className={`px-2 py-0.5 text-xs rounded border transition-colors ${
							region.speed === s
								? "border-primary bg-primary/10 font-medium"
								: "border-border/50 hover:bg-muted/40"
						}`}
						onClick={() => updateSpeedRegion(region.id, { speed: s })}
					>
						{s}x
					</button>
				))}
			</div>

			{/* Duration display */}
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>Duration</span>
				<span>{((region.endMs - region.startMs) / 1000).toFixed(1)}s</span>
			</div>

			{/* Delete */}
			<button
				type="button"
				className="w-full text-xs text-destructive hover:bg-destructive/10 rounded py-1 transition-colors"
				onClick={() => removeSpeedRegion(region.id)}
			>
				Delete region
			</button>
		</div>
	);
}
