import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { TransitionsView } from "../index";

describe("TransitionsView", () => {
	beforeEach(() => {
		useTimelineStore.setState({
			selectedElements: [],
			_tracks: [],
			tracks: [],
		});
	});

	it("renders transition presets instead of the old placeholder", () => {
		render(<TransitionsView />);

		expect(screen.getByTestId("transition-card-dissolve")).toBeInTheDocument();
		expect(
			screen.queryByText("Transitions view coming soon...")
		).not.toBeInTheDocument();
	});

	it("filters cards by search query", () => {
		render(<TransitionsView />);

		fireEvent.change(screen.getByLabelText("Search transitions"), {
			target: { value: "rgb" },
		});

		expect(
			screen.getByTestId("transition-card-glitch-shift")
		).toBeInTheDocument();
		expect(
			screen.queryByTestId("transition-card-dissolve")
		).not.toBeInTheDocument();
	});

	it("switches categories", () => {
		render(<TransitionsView />);

		fireEvent.click(screen.getByRole("button", { name: "Slide" }));

		expect(
			screen.getByTestId("transition-card-slide-left")
		).toBeInTheDocument();
		expect(
			screen.getByTestId("transition-card-slide-right")
		).toBeInTheDocument();
		expect(
			screen.queryByTestId("transition-card-wipe-left")
		).not.toBeInTheDocument();
	});
});
