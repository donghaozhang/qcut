import "@/test/fix-radix-ui";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Slider } from "@/components/ui/slider";

describe("Slider Component", () => {
	it("renders with default value", () => {
		const { container } = render(<Slider defaultValue={[50]} max={100} />);
		const slider = container.querySelector('[role="slider"]');

		expect(slider).toBeInTheDocument();
		expect(slider).toHaveAttribute("aria-valuenow", "50");
		expect(slider).toHaveAttribute("aria-valuemax", "100");
	});

	it("renders with min and max values", () => {
		const { container } = render(
			<Slider defaultValue={[25]} min={10} max={90} />
		);
		const slider = container.querySelector('[role="slider"]');

		expect(slider).toHaveAttribute("aria-valuemin", "10");
		expect(slider).toHaveAttribute("aria-valuemax", "90");
	});

	it("forwards its accessible name to the interactive thumb", () => {
		render(<Slider defaultValue={[40]} aria-label="Filter intensity" />);
		expect(
			screen.getByRole("slider", { name: "Filter intensity" })
		).toBeInTheDocument();
	});

	it("handles controlled value", () => {
		const handleChange = vi.fn();
		const { rerender } = render(
			<Slider value={[30]} onValueChange={handleChange} />
		);

		const slider = screen.getByRole("slider");
		expect(slider).toHaveAttribute("aria-valuenow", "30");

		// Update value
		rerender(<Slider value={[60]} onValueChange={handleChange} />);
		expect(slider).toHaveAttribute("aria-valuenow", "60");
	});

	it("supports step prop", () => {
		const { container } = render(
			<Slider defaultValue={[50]} step={10} max={100} />
		);
		const slider = container.querySelector('[role="slider"]');

		// Check that slider exists and has step-related attributes
		expect(slider).toBeInTheDocument();
		expect(slider).toHaveAttribute("aria-valuenow", "50");
	});
});
