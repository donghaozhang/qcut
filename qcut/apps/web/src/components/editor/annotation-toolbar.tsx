/**
 * Annotation toolbar — Arrow, Circle, Rectangle tools for figure annotations.
 * Adds annotations at the preview center at the current playhead time.
 */

import { useState } from "react";
import {
	useFigureAnnotationsStore,
	type FigureAnnotation,
} from "@/stores/figure-annotations-store";
import {
	ARROW_DIRECTIONS,
	type ArrowDirection,
} from "@/lib/screen-recording/figure-paths";
import { ArrowUp, Circle, Square, Palette } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const STROKE_WIDTHS = [
	{ value: 2, label: "Thin" },
	{ value: 4, label: "Medium" },
	{ value: 6, label: "Thick" },
] as const;

const DEFAULT_STROKE_COLOR = "#ff4444";
const DEFAULT_STROKE_WIDTH = 3;
const DEFAULT_SIZE = 10; // percentage of canvas

interface AnnotationToolbarProps {
	/** Current playhead time in ms */
	currentTimeMs: number;
	/** Duration of the clip in ms (annotation endMs) */
	clipDurationMs: number;
}

export function AnnotationToolbar({
	currentTimeMs,
	clipDurationMs,
}: AnnotationToolbarProps) {
	const addAnnotation = useFigureAnnotationsStore((s) => s.addAnnotation);
	const [strokeColor, setStrokeColor] = useState(DEFAULT_STROKE_COLOR);
	const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
	const [arrowMenuOpen, setArrowMenuOpen] = useState(false);

	const endMs = Math.max(
		currentTimeMs + 1,
		Math.min(currentTimeMs + 3000, clipDurationMs)
	);

	const handleAddArrow = (direction: ArrowDirection) => {
		addAnnotation(
			"arrow",
			currentTimeMs,
			endMs,
			direction,
			strokeColor,
			strokeWidth
		);
		setArrowMenuOpen(false);
	};

	const handleAddCircle = () => {
		addAnnotation(
			"circle",
			currentTimeMs,
			endMs,
			undefined,
			strokeColor,
			strokeWidth
		);
	};

	const handleAddRectangle = () => {
		addAnnotation(
			"rectangle",
			currentTimeMs,
			endMs,
			undefined,
			strokeColor,
			strokeWidth
		);
	};

	return (
		<div className="flex items-center gap-1" data-testid="annotation-toolbar">
			{/* Arrow with direction submenu */}
			<Popover open={arrowMenuOpen} onOpenChange={setArrowMenuOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 w-7 p-0"
						aria-label="Add arrow annotation"
						data-testid="annotation-arrow-btn"
					>
						<ArrowUp className="h-3.5 w-3.5" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-2" align="start">
					<div className="grid grid-cols-3 gap-1">
						{ARROW_DIRECTIONS.map((dir) => (
							<button
								key={dir}
								type="button"
								className="h-7 w-7 flex items-center justify-center text-[10px] rounded hover:bg-muted/60 transition-colors border border-border/30"
								onClick={() => handleAddArrow(dir)}
								aria-label={`Arrow ${dir}`}
							>
								{directionEmoji(dir)}
							</button>
						))}
					</div>
				</PopoverContent>
			</Popover>

			{/* Circle */}
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-7 w-7 p-0"
				onClick={handleAddCircle}
				aria-label="Add circle annotation"
				data-testid="annotation-circle-btn"
			>
				<Circle className="h-3.5 w-3.5" />
			</Button>

			{/* Rectangle */}
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-7 w-7 p-0"
				onClick={handleAddRectangle}
				aria-label="Add rectangle annotation"
				data-testid="annotation-rect-btn"
			>
				<Square className="h-3.5 w-3.5" />
			</Button>

			{/* Color picker */}
			<div className="flex items-center gap-1 ml-1">
				<input
					type="color"
					value={strokeColor}
					onChange={(e) => setStrokeColor(e.target.value)}
					className="w-6 h-6 cursor-pointer rounded border p-0"
					aria-label="Annotation stroke color"
				/>
			</div>
		</div>
	);
}

function directionEmoji(dir: ArrowDirection): string {
	const map: Record<ArrowDirection, string> = {
		up: "\u2191",
		down: "\u2193",
		left: "\u2190",
		right: "\u2192",
		"up-left": "\u2196",
		"up-right": "\u2197",
		"down-left": "\u2199",
		"down-right": "\u2198",
	};
	return map[dir];
}
