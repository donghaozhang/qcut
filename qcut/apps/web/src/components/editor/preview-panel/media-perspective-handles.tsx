import type {
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import type { MediaPerspective } from "@/types/timeline";
import {
	PERSPECTIVE_CORNERS,
	type PerspectiveCorner,
} from "./media-perspective-geometry";

const CORNER_LABELS: Record<PerspectiveCorner, string> = {
	topLeft: "Drag top-left corner",
	topRight: "Drag top-right corner",
	bottomRight: "Drag bottom-right corner",
	bottomLeft: "Drag bottom-left corner",
};

/**
 * Draggable corner pins for 拖拽变形. They sit inside the selection frame at
 * the normalized corner coordinates; flips mirror the frame, so a flipped
 * clip shows each pin on the visually corresponding side.
 */
export function MediaPerspectiveHandles({
	perspective,
	flipHorizontal,
	flipVertical,
	onCornerPointerDown,
	onCornerKeyDown,
}: {
	perspective: MediaPerspective;
	flipHorizontal: boolean;
	flipVertical: boolean;
	onCornerPointerDown: (args: {
		event: ReactPointerEvent<HTMLElement>;
		corner: PerspectiveCorner;
	}) => void;
	onCornerKeyDown: (args: {
		event: ReactKeyboardEvent<HTMLElement>;
		corner: PerspectiveCorner;
	}) => void;
}) {
	return (
		<div
			className="pointer-events-none absolute inset-0 z-10"
			data-testid="media-perspective-box"
		>
			{PERSPECTIVE_CORNERS.map((field) => {
				const x = perspective[field.x];
				const y = perspective[field.y];
				return (
					<button
						key={field.corner}
						type="button"
						className="pointer-events-auto absolute z-20 size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-primary bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						style={{
							left: `${(flipHorizontal ? 1 - x : x) * 100}%`,
							top: `${(flipVertical ? 1 - y : y) * 100}%`,
						}}
						aria-label={CORNER_LABELS[field.corner]}
						title={CORNER_LABELS[field.corner]}
						data-testid={`media-perspective-handle-${field.corner}`}
						onPointerDown={(event) =>
							onCornerPointerDown({ event, corner: field.corner })
						}
						onKeyDown={(event) =>
							onCornerKeyDown({ event, corner: field.corner })
						}
					/>
				);
			})}
		</div>
	);
}
