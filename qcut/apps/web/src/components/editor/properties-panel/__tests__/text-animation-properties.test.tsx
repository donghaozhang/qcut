import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyTextAnimationPreset,
	TEXT_ANIMATION_PRESETS,
} from "@/lib/text/text-animation-presets";
import type { TextElement } from "@/types/timeline";
import { TextAnimationProperties } from "../text-animation-properties";

const storeMocks = vi.hoisted(() => ({
	pause: vi.fn(),
	play: vi.fn(),
	pushHistory: vi.fn(),
	seek: vi.fn(),
	updateTextElement: vi.fn(),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: (
		selector: (state: {
			pushHistory: typeof storeMocks.pushHistory;
			updateTextElement: typeof storeMocks.updateTextElement;
		}) => unknown
	) =>
		selector({
			pushHistory: storeMocks.pushHistory,
			updateTextElement: storeMocks.updateTextElement,
		}),
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: (
		selector: (state: {
			currentTime: number;
			pause: typeof storeMocks.pause;
			play: typeof storeMocks.play;
			seek: typeof storeMocks.seek;
		}) => unknown
	) =>
		selector({
			currentTime: 3,
			pause: storeMocks.pause,
			play: storeMocks.play,
			seek: storeMocks.seek,
		}),
}));

function createElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Text",
		content: "Hello",
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		duration: 5,
		startTime: 2,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("TextAnimationProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders entrance, exit, and loop tabs with the entrance catalog", () => {
		render(
			<TextAnimationProperties element={createElement()} trackId="track-1" />
		);

		expect(screen.getByRole("tab", { name: "入场" })).toHaveAttribute(
			"data-state",
			"active"
		);
		expect(screen.getByRole("tab", { name: "出场" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "循环" })).toBeInTheDocument();
		expect(
			screen.getAllByTestId(/^text-animation-card-entrance-/)
		).toHaveLength(TEXT_ANIMATION_PRESETS.entrance.length);
		expect(screen.queryByText("时长")).not.toBeInTheDocument();
	});

	it("applies a complete phase snapshot with one timeline update", () => {
		render(
			<TextAnimationProperties element={createElement()} trackId="track-1" />
		);

		fireEvent.click(screen.getByRole("radio", { name: /打字光标/ }));

		expect(storeMocks.updateTextElement).toHaveBeenCalledTimes(1);
		expect(storeMocks.updateTextElement).toHaveBeenCalledWith(
			"track-1",
			"text-1",
			{
				animationType: "none",
				textAnimations: expect.objectContaining({
					schemaVersion: 1,
					entrance: expect.objectContaining({
						sourcePreset: { id: "typewriter-cursor", version: 1 },
						timing: expect.any(Object),
						sequence: expect.any(Object),
						target: "text",
						effect: expect.objectContaining({ kind: "typewriter" }),
					}),
				}),
			},
			true
		);
	});

	it("filters the active catalog by localized text", () => {
		render(
			<TextAnimationProperties element={createElement()} trackId="track-1" />
		);

		fireEvent.change(screen.getByRole("searchbox", { name: "搜索文字动画" }), {
			target: { value: "激光" },
		});

		expect(
			screen.getByTestId("text-animation-card-entrance-laser-etch")
		).toBeInTheDocument();
		expect(
			screen.queryByTestId("text-animation-card-entrance-scale-up")
		).not.toBeInTheDocument();
	});

	it("switches to the independent exit catalog", () => {
		render(
			<TextAnimationProperties element={createElement()} trackId="track-1" />
		);

		fireEvent.click(screen.getByRole("tab", { name: "出场" }));

		expect(screen.getAllByTestId(/^text-animation-card-exit-/)).toHaveLength(
			TEXT_ANIMATION_PRESETS.exit.length
		);
		expect(
			screen.queryByTestId("text-animation-card-entrance-typewriter-cursor")
		).not.toBeInTheDocument();
	});

	it("replays the selected phase from the clip boundary", () => {
		const preset = TEXT_ANIMATION_PRESETS.entrance.find(
			(candidate) => candidate.id === "scale-up"
		);
		if (!preset) throw new Error("Missing scale-up fixture");
		const element = createElement({
			textAnimations: applyTextAnimationPreset({
				animations: undefined,
				preset,
			}),
		});
		render(<TextAnimationProperties element={element} trackId="track-1" />);

		fireEvent.click(screen.getByRole("button", { name: "在播放头预览" }));

		expect(storeMocks.pause).toHaveBeenCalledTimes(1);
		expect(storeMocks.seek).toHaveBeenCalledWith(2);
		expect(storeMocks.play).toHaveBeenCalledTimes(1);
	});

	it("shows legacy slide-left accurately and migrates it on the first timing edit", () => {
		const element = createElement({
			animationType: "slide-left",
			animationDuration: 1.25,
			animationDelay: 0.2,
		});
		render(<TextAnimationProperties element={element} trackId="track-1" />);

		expect(screen.getByText("时长")).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /^无,/ })).toHaveAttribute(
			"aria-checked",
			"false"
		);

		const durationInput = screen.getAllByRole("spinbutton")[0];
		fireEvent.focus(durationInput);
		fireEvent.change(durationInput, { target: { value: "1.5" } });
		fireEvent.blur(durationInput);

		expect(storeMocks.updateTextElement).toHaveBeenCalledWith(
			"track-1",
			"text-1",
			{
				animationType: "none",
				textAnimations: expect.objectContaining({
					schemaVersion: 1,
					entrance: expect.objectContaining({
						timing: {
							duration: 1.5,
							delay: 0.2,
							easing: "linear",
						},
						effect: {
							kind: "slide",
							direction: "left",
							distance: { value: 120, unit: "px" },
							fade: true,
						},
					}),
				}),
			},
			false
		);
	});

	it("blocks edits for future schemas instead of replacing them with V1", () => {
		const element = createElement({
			textAnimations: {
				schemaVersion: 2,
				entrance: { futureEffect: "fold" },
			} as unknown as TextElement["textAnimations"],
		});
		render(<TextAnimationProperties element={element} trackId="track-1" />);

		expect(
			screen.getByTestId("text-animation-unsupported-schema")
		).toHaveTextContent("版本 2");
		expect(screen.queryByRole("radio")).not.toBeInTheDocument();
		expect(storeMocks.updateTextElement).not.toHaveBeenCalled();
	});
});
