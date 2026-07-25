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

vi.mock("../keyframe-editor", () => ({
	KeyframeEditor: () => <div data-testid="keyframe-editor" />,
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
					expect.objectContaining({ value: 5 }),
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

	it("applies the six curve presets to the full source duration", () => {
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
	});

	it("calculates playback rate from an edited target duration", () => {
		render(
			<MediaSpeedProperties
				element={element()}
				trackId="track"
				mediaKind="video"
			/>
		);

		fireEvent.change(screen.getByTestId("speed-target-duration"), {
			target: { value: "4" },
		});

		expect(mocks.updateMediaTiming).toHaveBeenLastCalledWith(
			"track",
			"clip",
			{ playbackRate: 2 },
			false
		);
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
		fireEvent.click(screen.getByTestId("speed-frame-interpolation"));
		expect(mocks.updateMediaTiming).toHaveBeenLastCalledWith(
			"track",
			"clip",
			{ frameInterpolation: "motion-compensated" },
			true
		);
	});
});
