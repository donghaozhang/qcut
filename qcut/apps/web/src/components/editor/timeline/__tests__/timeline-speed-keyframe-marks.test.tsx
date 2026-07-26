import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { TimelineSpeedKeyframeMarks } from "../timeline-speed-keyframe-marks";

function element(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "media",
		name: "Clip",
		startTime: 0,
		duration: 8,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

const curve = [
	{ id: "start", frame: 0, value: 1, easing: "linear" as const },
	{ id: "middle", frame: 120, value: 4, easing: "linear" as const },
	{ id: "end", frame: 240, value: 1, easing: "linear" as const },
];

describe("TimelineSpeedKeyframeMarks", () => {
	it("draws one mark per speed keyframe", () => {
		render(
			<TimelineSpeedKeyframeMarks
				element={element({ speedKeyframes: curve })}
				fps={30}
				widthPx={400}
			/>
		);
		expect(screen.getAllByTestId(/timeline-speed-keyframe-mark-/)).toHaveLength(
			3
		);
		expect(
			screen.getByTestId("timeline-speed-keyframe-mark-start").style.left
		).toBe("0%");
		expect(
			screen.getByTestId("timeline-speed-keyframe-mark-end").style.left
		).toBe("100%");
	});

	it("renders nothing for a clip without a speed curve", () => {
		render(
			<TimelineSpeedKeyframeMarks element={element()} fps={30} widthPx={400} />
		);
		expect(screen.queryByTestId("timeline-speed-keyframe-marks")).toBeNull();
	});

	it("hides the marks on clips too narrow to read them", () => {
		render(
			<TimelineSpeedKeyframeMarks
				element={element({ speedKeyframes: curve })}
				fps={30}
				widthPx={20}
			/>
		);
		expect(screen.queryByTestId("timeline-speed-keyframe-marks")).toBeNull();
	});
});
