import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { MediaSpeedProperties } from "../media-speed-properties";

const mocks = vi.hoisted(() => ({
	updateMediaTiming: vi.fn(),
	pushHistory: vi.fn(),
	applyEffect: vi.fn(),
	getElementEffects: vi.fn<() => Array<{ presetId?: string }>>(() => []),
}));

vi.mock("@/stores/timeline/timeline-store", () => {
	const state = {
		updateMediaTiming: mocks.updateMediaTiming,
		pushHistory: mocks.pushHistory,
	};
	const useTimelineStore = (selector: (value: typeof state) => unknown) =>
		selector(state);
	useTimelineStore.getState = () => state;
	return { useTimelineStore };
});

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: (selector: (state: { currentTime: number }) => unknown) =>
		selector({ currentTime: 0 }),
}));

vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({
			applyEffect: mocks.applyEffect,
			getElementEffects: mocks.getElementEffects,
		}),
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: (
		selector: (state: { activeProject: { fps: number } }) => unknown
	) => selector({ activeProject: { fps: 30 } }),
}));

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

describe("MediaSpeedProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getElementEffects.mockReturnValue([]);
	});

	it("applies a speed-point curve and its existing effects atomically", () => {
		render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);

		fireEvent.mouseDown(screen.getByTestId("speed-mode-beat"), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(screen.getByTestId("speed-point-preset-flash"));

		expect(mocks.pushHistory).toHaveBeenCalledOnce();
		expect(mocks.updateMediaTiming).toHaveBeenCalledWith(
			"track",
			"clip",
			expect.objectContaining({
				speedKeyframes: expect.arrayContaining([
					expect.objectContaining({ value: 7 }),
				]),
			}),
			false
		);
		expect(mocks.applyEffect).toHaveBeenCalledWith(
			"clip",
			expect.objectContaining({ id: "dynamic-flash-pulse" })
		);
	});

	it("does not duplicate an effect already applied by a speed point", () => {
		mocks.getElementEffects.mockReturnValue([
			{ presetId: "dynamic-flash-pulse" },
		]);
		render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);

		fireEvent.mouseDown(screen.getByTestId("speed-mode-beat"), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(screen.getByTestId("speed-point-preset-flash"));

		expect(mocks.applyEffect).not.toHaveBeenCalled();
	});

	it("shows all curve choices and applies presets to the full source duration", () => {
		render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);

		fireEvent.mouseDown(screen.getByTestId("speed-mode-curve"), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getByTestId("speed-curve-preset-none")).toBeVisible();
		expect(screen.getByTestId("speed-curve-preset-custom")).toBeVisible();
		fireEvent.click(screen.getByTestId("speed-curve-preset-bullet"));

		const lastUpdate = mocks.updateMediaTiming.mock.calls.at(-1)?.[2];
		expect(lastUpdate.speedKeyframes[0].frame).toBe(0);
		expect(lastUpdate.speedKeyframes.at(-1).frame).toBe(240);
		expect(
			Math.min(
				...lastUpdate.speedKeyframes.map(
					(keyframe: { value: number }) => keyframe.value
				)
			)
		).toBe(0.2);
		expect(screen.getByTestId("speed-curve-preset-bullet")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("clamps normal speed to the same 10x limit used by export", () => {
		render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);

		fireEvent.change(screen.getByLabelText("倍速数值"), {
			target: { value: "20" },
		});

		expect(mocks.updateMediaTiming).toHaveBeenLastCalledWith(
			"track",
			"clip",
			{ playbackRate: 10 },
			false
		);
	});

	it("keeps duration edits local until Enter commits them", () => {
		render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);

		const durationInput = screen.getByTestId("speed-target-duration");
		fireEvent.focus(durationInput);
		fireEvent.change(durationInput, {
			target: { value: "12" },
		});

		expect(durationInput).toHaveValue(12);
		expect(mocks.updateMediaTiming).not.toHaveBeenCalled();

		fireEvent.keyDown(durationInput, { key: "Enter" });

		expect(mocks.updateMediaTiming).toHaveBeenLastCalledWith(
			"track",
			"clip",
			{ playbackRate: 8 / 12 },
			false
		);
	});

	it("resets invalid drafts and follows external duration changes", () => {
		const { rerender } = render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);
		const durationInput = screen.getByTestId("speed-target-duration");

		fireEvent.change(durationInput, { target: { value: "" } });
		fireEvent.blur(durationInput);

		expect(durationInput).toHaveValue(8);
		expect(mocks.updateMediaTiming).not.toHaveBeenCalled();

		rerender(
			<MediaSpeedProperties
				element={element({ playbackRate: 2 })}
				trackId="track"
				mediaKind="video"
			/>
		);

		expect(durationInput).toHaveValue(4);
	});

	it("exposes optional pitch shift and motion-compensated interpolation", () => {
		const { rerender } = render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="audio"
			/>
		);
		fireEvent.click(screen.getByTestId("speed-pitch-shift"));
		expect(mocks.updateMediaTiming).toHaveBeenLastCalledWith(
			"track",
			"clip",
			{ preservePitch: false },
			true
		);

		rerender(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);
		fireEvent.mouseDown(screen.getByTestId("speed-mode-curve"), {
			button: 0,
		});
		fireEvent.click(screen.getByTestId("speed-frame-interpolation"));
		expect(mocks.updateMediaTiming).toHaveBeenLastCalledWith(
			"track",
			"clip",
			{ frameInterpolation: "motion-compensated" },
			true
		);
	});
});
