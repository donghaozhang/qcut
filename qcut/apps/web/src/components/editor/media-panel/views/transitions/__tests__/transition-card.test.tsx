import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransitionCard } from "../transition-card";
import { getTransitionPresetById } from "../transition-presets";

vi.mock("../transition-preview", () => ({
	TransitionPreview: ({ isPlaying }: { isPlaying: boolean }) => (
		<div data-testid="transition-preview" data-playing={String(isPlaying)} />
	),
}));

function requirePreset(presetId: string) {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) {
		throw new Error(`Missing preset fixture: ${presetId}`);
	}
	return preset;
}

const dissolve = requirePreset("dissolve");
const glitchShift = requirePreset("glitch-shift");

const handlers = {
	onSelect: vi.fn(),
	onApply: vi.fn(),
	onDragStart: vi.fn(),
};

function renderCard({
	preset = dissolve,
	selected = false,
	canApply = true,
	available = true,
} = {}) {
	return render(
		<TransitionCard
			preset={preset}
			selected={selected}
			canApply={canApply}
			available={available}
			onSelect={handlers.onSelect}
			onApply={handlers.onApply}
			onDragStart={handlers.onDragStart}
		/>
	);
}

describe("TransitionCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("selects the preset on click", () => {
		renderCard();

		fireEvent.click(screen.getByTestId("transition-card-dissolve"));

		expect(handlers.onSelect).toHaveBeenCalledWith({ preset: dissolve });
	});

	it("selects the preset with Enter and Space but not other keys", () => {
		renderCard();
		const card = screen.getByTestId("transition-card-dissolve");

		fireEvent.keyDown(card, { key: "a" });
		expect(handlers.onSelect).not.toHaveBeenCalled();

		fireEvent.keyDown(card, { key: "Enter" });
		fireEvent.keyDown(card, { key: " " });
		expect(handlers.onSelect).toHaveBeenCalledTimes(2);
		expect(handlers.onSelect).toHaveBeenCalledWith({ preset: dissolve });
	});

	it("plays the preview on hover and stops on leave", () => {
		renderCard();
		const card = screen.getByTestId("transition-card-dissolve");
		const preview = screen.getByTestId("transition-preview");

		expect(preview).toHaveAttribute("data-playing", "false");

		fireEvent.mouseEnter(card);
		expect(preview).toHaveAttribute("data-playing", "true");

		fireEvent.mouseLeave(card);
		expect(preview).toHaveAttribute("data-playing", "false");
	});

	it("plays the preview on focus and stops on blur", () => {
		renderCard();
		const card = screen.getByTestId("transition-card-dissolve");
		const preview = screen.getByTestId("transition-preview");

		fireEvent.focus(card);
		expect(preview).toHaveAttribute("data-playing", "true");

		fireEvent.blur(card);
		expect(preview).toHaveAttribute("data-playing", "false");
	});

	it("shows the Ready badge and duration for available presets", () => {
		renderCard();

		expect(screen.getByText("Ready")).toBeInTheDocument();
		expect(screen.getByText("0.50s")).toBeInTheDocument();
		expect(screen.queryByText("Pro")).not.toBeInTheDocument();
		expect(screen.queryByText("Asset")).not.toBeInTheDocument();
	});

	it("shows Pro and Asset badges for premium presets without assets", () => {
		renderCard({ preset: glitchShift, available: false });

		expect(screen.getByText("Pro")).toBeInTheDocument();
		expect(screen.getByText("Asset")).toBeInTheDocument();
		expect(screen.queryByText("Ready")).not.toBeInTheDocument();
	});

	it("applies the preset without selecting it when the apply button is clicked", () => {
		renderCard();

		fireEvent.click(screen.getByRole("button", { name: "Apply Dissolve" }));

		expect(handlers.onApply).toHaveBeenCalledWith({ preset: dissolve });
		expect(handlers.onSelect).not.toHaveBeenCalled();
	});

	it("keeps keyboard events on the apply button from selecting the card", () => {
		renderCard();

		fireEvent.keyDown(screen.getByRole("button", { name: "Apply Dissolve" }), {
			key: "Enter",
		});

		expect(handlers.onSelect).not.toHaveBeenCalled();
	});

	it("disables the apply button when the transition cannot be applied", () => {
		renderCard({ canApply: false });

		expect(
			screen.getByRole("button", { name: "Apply Dissolve" })
		).toBeDisabled();
	});

	it("disables the apply button when the preset asset is unavailable", () => {
		renderCard({ preset: glitchShift, available: false });

		expect(
			screen.getByRole("button", { name: "Apply Glitch Shift" })
		).toBeDisabled();
	});

	it("forwards drag start only for available presets", () => {
		renderCard();
		fireEvent.dragStart(screen.getByTestId("transition-card-dissolve"), {
			dataTransfer: { effectAllowed: "", setData: vi.fn() },
		});
		expect(handlers.onDragStart).toHaveBeenCalledWith({
			event: expect.anything(),
			preset: dissolve,
		});

		handlers.onDragStart.mockClear();
		renderCard({ preset: glitchShift, available: false });
		fireEvent.dragStart(screen.getByTestId("transition-card-glitch-shift"), {
			dataTransfer: { effectAllowed: "", setData: vi.fn() },
		});
		expect(handlers.onDragStart).not.toHaveBeenCalled();
	});

	it("marks only available presets as draggable", () => {
		renderCard();
		expect(screen.getByTestId("transition-card-dissolve")).toHaveAttribute(
			"draggable",
			"true"
		);

		renderCard({ preset: glitchShift, available: false });
		expect(screen.getByTestId("transition-card-glitch-shift")).toHaveAttribute(
			"draggable",
			"false"
		);
	});
});
