import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonCutoutPreview } from "../PersonCutoutPreview";

const settings = {
	threshold: 0.5,
	temporalSmoothing: 0.5,
	feather: 2,
	edgeShift: 0,
};

describe("PersonCutoutPreview", () => {
	it("switches between the synchronized cutout and original views", () => {
		const { container } = render(
			<PersonCutoutPreview sourceUrl="blob:source" settings={settings} />
		);
		const video = container.querySelector("video");
		const canvas = container.querySelector("canvas");
		if (!video || !canvas) throw new Error("Expected preview media elements");

		expect(
			screen.getByRole("radio", { name: "Show cutout result" })
		).toHaveAttribute("aria-checked", "true");
		expect(video).toHaveClass("size-px", "opacity-0");

		fireEvent.click(screen.getByRole("radio", { name: "Show original video" }));

		expect(
			screen.getByRole("radio", { name: "Show original video" })
		).toHaveAttribute("aria-checked", "true");
		expect(video).toHaveClass("inset-0", "size-full");
		expect(canvas).toHaveClass("invisible");
	});
});
