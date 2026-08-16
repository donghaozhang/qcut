import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDigitalHumanStore } from "@/stores/digital-human-store";
import { useMediaStore } from "@/stores/media/media-store";
import { DIGITAL_HUMAN_FIGURE_PRESETS } from "../digital-human-figure-presets";
import { DigitalHumanView } from "../digital-human-view";

const [FIRST_PRESET] = DIGITAL_HUMAN_FIGURE_PRESETS;

const PORTRAIT = {
	id: "portrait-1",
	name: "presenter.png",
	type: "image" as const,
	url: "blob:portrait-1",
	file: new File([], "presenter.png"),
};

describe("DigitalHumanView", () => {
	beforeEach(() => {
		useDigitalHumanStore.getState().reset();
		useMediaStore.setState({ mediaItems: [PORTRAIT as never] });
	});

	it("offers the project's images as figures", () => {
		render(<DigitalHumanView />);

		expect(screen.getByTestId("digital-human-figure-portrait-1")).toBeVisible();
		expect(
			screen.queryByTestId("digital-human-figure-empty")
		).not.toBeInTheDocument();
	});

	it("says the library is empty instead of showing a bare grid", () => {
		useMediaStore.setState({ mediaItems: [] });
		render(<DigitalHumanView />);

		expect(screen.getByTestId("digital-human-figure-empty")).toBeVisible();
	});

	it("ships built-in figures so an empty project is still usable", () => {
		useMediaStore.setState({ mediaItems: [] });
		render(<DigitalHumanView />);

		const presets = screen.getByTestId("digital-human-figure-presets");
		expect(presets.childElementCount).toBe(DIGITAL_HUMAN_FIGURE_PRESETS.length);
		expect(
			screen.getByTestId(`digital-human-figure-preset-${FIRST_PRESET.id}`)
		).toBeVisible();
	});

	it("unlocks the voiceover step from a built-in figure alone", () => {
		useMediaStore.setState({ mediaItems: [] });
		render(<DigitalHumanView />);

		expect(screen.getByTestId("digital-human-next")).toBeDisabled();

		fireEvent.click(
			screen.getByTestId(`digital-human-figure-preset-${FIRST_PRESET.id}`)
		);

		expect(useDigitalHumanStore.getState().figurePresetId).toBe(
			FIRST_PRESET.id
		);
		expect(screen.getByTestId("digital-human-next")).toBeEnabled();
		expect(screen.getByTestId("digital-human-step-voice")).toBeEnabled();
	});

	it("keeps a preset and a project image from both being the figure", () => {
		render(<DigitalHumanView />);

		fireEvent.click(
			screen.getByTestId(`digital-human-figure-preset-${FIRST_PRESET.id}`)
		);
		fireEvent.click(screen.getByTestId("digital-human-figure-portrait-1"));

		const afterImage = useDigitalHumanStore.getState();
		expect(afterImage.figureMediaId).toBe("portrait-1");
		expect(afterImage.figurePresetId).toBeNull();

		fireEvent.click(
			screen.getByTestId(`digital-human-figure-preset-${FIRST_PRESET.id}`)
		);

		const afterPreset = useDigitalHumanStore.getState();
		expect(afterPreset.figurePresetId).toBe(FIRST_PRESET.id);
		expect(afterPreset.figureMediaId).toBeNull();
	});

	it("falls back off the voiceover step when the figure is cleared", () => {
		render(<DigitalHumanView />);

		fireEvent.click(screen.getByTestId("digital-human-figure-portrait-1"));
		fireEvent.click(screen.getByTestId("digital-human-next"));
		expect(useDigitalHumanStore.getState().step).toBe("voice");

		useDigitalHumanStore.getState().setFigureMediaId(null);

		expect(useDigitalHumanStore.getState().step).toBe("figure");
	});

	it("keeps the voiceover step locked until a figure is chosen", () => {
		render(<DigitalHumanView />);

		expect(screen.getByTestId("digital-human-step-voice")).toBeDisabled();
		expect(screen.getByTestId("digital-human-next")).toBeDisabled();

		fireEvent.click(screen.getByTestId("digital-human-figure-portrait-1"));

		expect(useDigitalHumanStore.getState().figureMediaId).toBe("portrait-1");
		expect(screen.getByTestId("digital-human-step-voice")).toBeEnabled();
		expect(screen.getByTestId("digital-human-next")).toBeEnabled();
	});

	it("advances to the voiceover step", () => {
		useDigitalHumanStore.setState({ figureMediaId: "portrait-1" });
		render(<DigitalHumanView />);

		fireEvent.click(screen.getByTestId("digital-human-next"));

		expect(useDigitalHumanStore.getState().step).toBe("voice");
		expect(screen.getByTestId("digital-human-voice-step")).toBeVisible();
		// Nothing is wired to a model yet, so generating must stay unavailable.
		expect(screen.getByTestId("digital-human-generate")).toBeDisabled();
	});

	it("records the selected shot size", () => {
		render(<DigitalHumanView />);

		fireEvent.click(screen.getByTestId("digital-human-shot-closeup"));

		expect(useDigitalHumanStore.getState().shotSize).toBe("closeup");
		expect(screen.getByTestId("digital-human-shot-closeup")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("replaces an image background when a colour is picked", () => {
		render(<DigitalHumanView />);

		fireEvent.click(
			screen.getByTestId("digital-human-background-image-portrait-1")
		);
		expect(useDigitalHumanStore.getState().backgroundMediaId).toBe(
			"portrait-1"
		);

		fireEvent.click(
			screen.getByTestId("digital-human-background-color-#000000")
		);

		const state = useDigitalHumanStore.getState();
		expect(state.backgroundColor).toBe("#000000");
		expect(state.backgroundMediaId).toBeNull();
	});
});
