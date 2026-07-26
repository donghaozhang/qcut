import { resolveSpeedKeyframeMarks } from "@/lib/video/speed-keyframe-marks";
import type { MediaElement } from "@/types/timeline";

/** Minimum clip width in px before the marks would collide into a smear. */
const MIN_WIDTH_FOR_MARKS = 48;

/**
 * Speed keyframe marks — dots along the top edge of a speed-adjusted clip,
 * mirroring the speed-point strip CapCut draws on its clips.
 */
export function TimelineSpeedKeyframeMarks({
	element,
	fps,
	widthPx,
}: {
	element: MediaElement;
	fps: number;
	widthPx: number;
}) {
	if (widthPx < MIN_WIDTH_FOR_MARKS) return null;
	const marks = resolveSpeedKeyframeMarks({ element, fps });
	if (marks.length === 0) return null;

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 top-0 z-20 h-2"
			data-testid="timeline-speed-keyframe-marks"
		>
			{marks.map((mark) => (
				<span
					key={mark.id}
					className="absolute top-0.5 size-1 -translate-x-1/2 rounded-full bg-amber-300/90 shadow-[0_0_2px_rgba(0,0,0,0.6)]"
					style={{ left: `${mark.ratio * 100}%` }}
					data-testid={`timeline-speed-keyframe-mark-${mark.id}`}
				/>
			))}
		</div>
	);
}
