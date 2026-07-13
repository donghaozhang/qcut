import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransitionCard } from "../transition-card";
import { getTransitionPresetById } from "../transition-presets";

vi.mock("../transition-preview", () => ({
	TransitionPreview: ({ isPlaying }: { isPlaying: boolean }) => (
		<div data-testid="transition-preview" data-playing={String(isPlaying)} />
	),
}));

function requirePreset({ presetId }: { presetId: string }) {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) {
		throw new Error(`Missing preset fixture: ${presetId}`);
	}
	return preset;
}

const dissolve = requirePreset({ presetId: "dissolve" });
const futureAsset = {
	...dissolve,
	id: "future-asset",
	name: "Future Asset",
	localizedName: "未来素材",
	premium: true,
	downloaded: false,
};

const handlers = {
	onSelect: vi.fn(),
	onApply: vi.fn(),
	onDragStart: vi.fn(),
	onToggleFavorite: vi.fn(),
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
			favorite={false}
			onSelect={handlers.onSelect}
			onApply={handlers.onApply}
			onToggleFavorite={handlers.onToggleFavorite}
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

		expect(screen.getByText("可用")).toBeInTheDocument();
		expect(screen.getByText("0.50s")).toBeInTheDocument();
		expect(screen.queryByText("Pro")).not.toBeInTheDocument();
		expect(screen.queryByText("素材")).not.toBeInTheDocument();
	});

	it("shows Pro and Asset badges for premium presets without assets", () => {
		renderCard({ preset: futureAsset, available: false });

		expect(screen.getByText("Pro")).toBeInTheDocument();
		expect(screen.getByText("素材")).toBeInTheDocument();
		expect(screen.queryByText("可用")).not.toBeInTheDocument();
	});

	it("applies a ready preset on double-click", () => {
		renderCard();

		fireEvent.doubleClick(screen.getByTestId("transition-card-dissolve"));

		expect(handlers.onApply).toHaveBeenCalledWith({ preset: dissolve });
	});

	it("applies the preset without selecting it when the apply button is clicked", () => {
		renderCard();

		fireEvent.click(screen.getByRole("button", { name: "应用叠化" }));

		expect(handlers.onApply).toHaveBeenCalledWith({ preset: dissolve });
		expect(handlers.onSelect).not.toHaveBeenCalled();
	});

	it("keeps keyboard events on the apply button from selecting the card", () => {
		renderCard();

		fireEvent.keyDown(screen.getByRole("button", { name: "应用叠化" }), {
			key: "Enter",
		});

		expect(handlers.onSelect).not.toHaveBeenCalled();
	});

	it("disables the apply button when the transition cannot be applied", () => {
		renderCard({ canApply: false });

		expect(screen.getByRole("button", { name: "应用叠化" })).toBeDisabled();
	});

	it("disables the apply button when the preset asset is unavailable", () => {
		renderCard({ preset: futureAsset, available: false });

		expect(screen.getByRole("button", { name: "应用未来素材" })).toBeDisabled();
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
		renderCard({ preset: futureAsset, available: false });
		fireEvent.dragStart(screen.getByTestId("transition-card-future-asset"), {
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

		renderCard({ preset: futureAsset, available: false });
		expect(screen.getByTestId("transition-card-future-asset")).toHaveAttribute(
			"draggable",
			"false"
		);
	});
});
