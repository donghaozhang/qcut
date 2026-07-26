import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaPropertyKeyframe } from "@/types/timeline";
import { SpeedCurveEditor } from "../speed-curve-editor";

function keyframe(
	overrides: Partial<MediaPropertyKeyframe> & { id: string; frame: number }
): MediaPropertyKeyframe {
	return { value: 1, easing: "linear", ...overrides };
}

function renderEditor({
	keyframes,
	playheadFrame,
	onChange = vi.fn<(keyframes: MediaPropertyKeyframe[]) => void>(),
	onInteractionStart = vi.fn<() => void>(),
	onInteractionEnd = vi.fn<() => void>(),
}: {
	keyframes: MediaPropertyKeyframe[];
	playheadFrame: number | null;
	onChange?: ReturnType<
		typeof vi.fn<(keyframes: MediaPropertyKeyframe[]) => void>
	>;
	onInteractionStart?: ReturnType<typeof vi.fn<() => void>>;
	onInteractionEnd?: ReturnType<typeof vi.fn<() => void>>;
}) {
	render(
		<SpeedCurveEditor
			keyframes={keyframes}
			durationInFrames={240}
			playheadFrame={playheadFrame}
			sourceDurationLabel="8.0s"
			timelineDurationLabel="8.0s"
			durationLabel="Duration"
			resetLabel="Reset"
			addPointLabel="Add speed point"
			removePointLabel="Remove speed point"
			onChange={onChange}
			onInteractionStart={onInteractionStart}
			onInteractionEnd={onInteractionEnd}
			onReset={vi.fn()}
		/>
	);
	return { onChange, onInteractionStart, onInteractionEnd };
}

const flatCurve = [
	keyframe({ id: "start", frame: 0, value: 2 }),
	keyframe({ id: "end", frame: 240, value: 1 }),
];

describe("SpeedCurveEditor", () => {
	it("adds an interpolated point at the playhead as one undo step", () => {
		const { onChange, onInteractionStart, onInteractionEnd } = renderEditor({
			keyframes: flatCurve,
			playheadFrame: 120,
		});
		const toggle = screen.getByTestId("speed-curve-point-toggle");
		expect(toggle).toHaveAccessibleName("Add speed point");

		fireEvent.click(toggle);
		expect(onInteractionStart).toHaveBeenCalledTimes(1);
		expect(onInteractionEnd).toHaveBeenCalledTimes(1);
		const next = onChange.mock.calls[0][0] as MediaPropertyKeyframe[];
		expect(next).toHaveLength(3);
		expect(next[1]).toMatchObject({
			frame: 120,
			value: 1.5,
			easing: "easeInOut",
		});
	});

	it("removes the point under the playhead but never a boundary point", () => {
		const middle = keyframe({ id: "middle", frame: 118, value: 4 });
		const { onChange } = renderEditor({
			keyframes: [flatCurve[0], middle, flatCurve[1]],
			playheadFrame: 120,
		});
		const toggle = screen.getByTestId("speed-curve-point-toggle");
		expect(toggle).toHaveAccessibleName("Remove speed point");

		fireEvent.click(toggle);
		const next = onChange.mock.calls[0][0] as MediaPropertyKeyframe[];
		expect(next.map((point) => point.id)).toEqual(["start", "end"]);
	});

	it("disables the toggle on boundary points and without a playhead", () => {
		renderEditor({ keyframes: flatCurve, playheadFrame: 0 });
		expect(screen.getByTestId("speed-curve-point-toggle")).toBeDisabled();
	});

	it("hides the playhead line when the playhead is outside the clip", () => {
		renderEditor({ keyframes: flatCurve, playheadFrame: null });
		expect(screen.queryByTestId("speed-curve-playhead")).toBeNull();
		expect(screen.getByTestId("speed-curve-point-toggle")).toBeDisabled();
	});

	it("positions the playhead line proportionally to the source frame", () => {
		renderEditor({ keyframes: flatCurve, playheadFrame: 60 });
		expect(screen.getByTestId("speed-curve-playhead").style.left).toBe("25%");
	});
});
