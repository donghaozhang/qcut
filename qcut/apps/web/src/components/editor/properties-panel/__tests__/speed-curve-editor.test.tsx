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
	onSeekToFrame,
}: {
	keyframes: MediaPropertyKeyframe[];
	playheadFrame: number | null;
	onChange?: ReturnType<
		typeof vi.fn<(keyframes: MediaPropertyKeyframe[]) => void>
	>;
	onInteractionStart?: ReturnType<typeof vi.fn<() => void>>;
	onInteractionEnd?: ReturnType<typeof vi.fn<() => void>>;
	onSeekToFrame?: ReturnType<typeof vi.fn<(frame: number) => void>>;
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
			seekLabel="Move the playhead"
			onChange={onChange}
			onInteractionStart={onInteractionStart}
			onInteractionEnd={onInteractionEnd}
			onReset={vi.fn()}
			onSeekToFrame={onSeekToFrame}
		/>
	);
	return { onChange, onInteractionStart, onInteractionEnd, onSeekToFrame };
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

	it("keeps the hit radius tight on long sources", () => {
		// One hour at 30fps: a proportional radius would swallow ~72 seconds.
		const durationInFrames = 108_000;
		const onChange = vi.fn<(keyframes: MediaPropertyKeyframe[]) => void>();
		render(
			<SpeedCurveEditor
				keyframes={[
					keyframe({ id: "start", frame: 0, value: 1 }),
					keyframe({ id: "middle", frame: 54_000, value: 4 }),
					keyframe({ id: "end", frame: durationInFrames, value: 1 }),
				]}
				durationInFrames={durationInFrames}
				playheadFrame={53_000}
				sourceDurationLabel="60:00.0"
				timelineDurationLabel="60:00.0"
				durationLabel="Duration"
				resetLabel="Reset"
				addPointLabel="Add speed point"
				removePointLabel="Remove speed point"
				seekLabel="Move the playhead"
				onChange={onChange}
				onInteractionStart={vi.fn()}
				onInteractionEnd={vi.fn()}
				onReset={vi.fn()}
			/>
		);

		const toggle = screen.getByTestId("speed-curve-point-toggle");
		expect(toggle).toHaveAccessibleName("Add speed point");
		fireEvent.click(toggle);
		const next = onChange.mock.calls[0][0] as MediaPropertyKeyframe[];
		expect(next).toHaveLength(4);
		expect(next.map((point) => point.frame)).toContain(53_000);
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

	it("deletes a focused point with Delete but leaves boundaries alone", () => {
		const middle = keyframe({ id: "middle", frame: 90, value: 4 });
		const { onChange } = renderEditor({
			keyframes: [flatCurve[0], middle, flatCurve[1]],
			playheadFrame: null,
		});

		fireEvent.keyDown(screen.getByTestId("speed-curve-point-0"), {
			key: "Delete",
		});
		expect(onChange).not.toHaveBeenCalled();

		fireEvent.keyDown(screen.getByTestId("speed-curve-point-1"), {
			key: "Backspace",
		});
		const next = onChange.mock.calls[0][0] as MediaPropertyKeyframe[];
		expect(next.map((point) => point.id)).toEqual(["start", "end"]);
	});

	it("seeks to the clicked frame and steps the playhead with arrow keys", () => {
		const onSeekToFrame = vi.fn<(frame: number) => void>();
		renderEditor({
			keyframes: flatCurve,
			playheadFrame: 100,
			onSeekToFrame,
		});
		const surface = screen.getByTestId("speed-curve-seek-surface");
		vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 200,
			height: 100,
		} as DOMRect);
		const plot = screen.getByTestId("speed-curve-editor");
		vi.spyOn(plot, "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 200,
			height: 100,
		} as DOMRect);

		fireEvent.click(surface, { clientX: 50 });
		expect(onSeekToFrame).toHaveBeenLastCalledWith(60);

		fireEvent.keyDown(surface, { key: "ArrowRight" });
		expect(onSeekToFrame).toHaveBeenLastCalledWith(101);
		fireEvent.keyDown(surface, { key: "PageDown" });
		expect(onSeekToFrame).toHaveBeenLastCalledWith(90);
	});

	it("omits the seek surface when seeking is not wired up", () => {
		renderEditor({ keyframes: flatCurve, playheadFrame: 100 });
		expect(screen.queryByTestId("speed-curve-seek-surface")).toBeNull();
	});
});
