import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSLATIONS } from "@/lib/i18n/translations";
import { TEXT_ANIMATION_PRESETS } from "@/lib/text/text-animation-presets";
import { TextAnimationPresetGrid } from "../text-animation-preset-grid";

vi.mock("../use-text-animation-preview", () => ({
	useTextAnimationPreview: ({ active }: { active: boolean }) =>
		active ? 0.75 : 0.55,
}));

const presets = TEXT_ANIMATION_PRESETS.entrance.slice(0, 3);
const translate = (key: keyof typeof TRANSLATIONS.zh) => TRANSLATIONS.zh[key];

describe("TextAnimationPresetGrid", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders a four-column single-select grid with None first", () => {
		render(
			<TextAnimationPresetGrid
				ariaLabel="入场动画预设"
				emptyLabel="没有动画"
				onSelect={vi.fn()}
				presets={presets}
				selectedPresetId="none"
				translate={translate}
			/>
		);

		const grid = screen.getByTestId("text-animation-preset-grid");
		expect(grid).toHaveClass("grid-cols-4");
		expect(screen.getAllByRole("radio")).toHaveLength(3);
		expect(screen.getAllByRole("radio")[0]).toHaveAccessibleName(/^无, 0\.6s$/);
		expect(screen.getAllByText("无")).not.toHaveLength(0);
	});

	it("returns the complete preset on selection", () => {
		const onSelect = vi.fn();
		render(
			<TextAnimationPresetGrid
				ariaLabel="入场动画预设"
				emptyLabel="没有动画"
				onSelect={onSelect}
				presets={presets}
				selectedPresetId="none"
				translate={translate}
			/>
		);

		fireEvent.click(screen.getByRole("radio", { name: /打字光标/ }));

		expect(onSelect).toHaveBeenCalledWith({ preset: presets[1] });
	});

	it("previews only the hovered card and resets it on leave", () => {
		render(
			<TextAnimationPresetGrid
				ariaLabel="入场动画预设"
				emptyLabel="没有动画"
				onSelect={vi.fn()}
				presets={presets}
				selectedPresetId="none"
				translate={translate}
			/>
		);
		const card = screen.getByTestId(
			"text-animation-card-entrance-typewriter-cursor"
		);
		const preview = screen.getByTestId(
			"text-animation-preview-entrance-typewriter-cursor"
		);

		expect(preview).toHaveAttribute("data-preview-progress", "0.550");
		fireEvent.mouseEnter(card);
		expect(preview).toHaveAttribute("data-preview-progress", "0.750");
		expect(
			screen
				.getAllByTestId(/^text-animation-preview-/)
				.filter(
					(candidate) =>
						candidate.getAttribute("data-preview-progress") === "0.750"
				)
		).toHaveLength(1);
		fireEvent.mouseLeave(card);
		expect(preview).toHaveAttribute("data-preview-progress", "0.550");
	});

	it("provides the same preview feedback for keyboard focus", () => {
		render(
			<TextAnimationPresetGrid
				ariaLabel="入场动画预设"
				emptyLabel="没有动画"
				onSelect={vi.fn()}
				presets={presets}
				selectedPresetId="none"
				translate={translate}
			/>
		);
		const card = screen.getByTestId(
			"text-animation-card-entrance-fade-characters"
		);
		const preview = screen.getByTestId(
			"text-animation-preview-entrance-fade-characters"
		);

		fireEvent.focus(card);
		expect(preview).toHaveAttribute("data-preview-progress", "0.750");
		fireEvent.blur(card);
		expect(preview).toHaveAttribute("data-preview-progress", "0.550");
	});

	it("renders a clear empty search state", () => {
		render(
			<TextAnimationPresetGrid
				ariaLabel="入场动画预设"
				emptyLabel="没有匹配的动画"
				onSelect={vi.fn()}
				presets={[]}
				selectedPresetId="none"
				translate={translate}
			/>
		);

		expect(screen.getByText("没有匹配的动画")).toBeInTheDocument();
		expect(
			screen.queryByTestId("text-animation-preset-grid")
		).not.toBeInTheDocument();
	});

	it("renders the Jianying-derived loop presets through the shared preview", () => {
		const loopPresets = TEXT_ANIMATION_PRESETS.loop.filter((preset) =>
			["flip", "ring-orbit", "jitter"].includes(preset.id)
		);
		render(
			<TextAnimationPresetGrid
				ariaLabel="循环动画预设"
				emptyLabel="没有动画"
				onSelect={vi.fn()}
				presets={loopPresets}
				selectedPresetId="flip"
				translate={translate}
			/>
		);

		expect(loopPresets).toHaveLength(3);
		expect(screen.getByText("空间翻转")).toBeInTheDocument();
		expect(screen.getByText("环绕")).toBeInTheDocument();
		expect(screen.getByText("颤抖")).toBeInTheDocument();
	});
});
