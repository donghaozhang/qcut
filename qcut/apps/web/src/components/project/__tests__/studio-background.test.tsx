import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioBackground } from "../studio-background";

describe("StudioBackground", () => {
	it("renders without errors", () => {
		render(<StudioBackground />);
		expect(screen.getByTestId("studio-background")).toBeTruthy();
	});

	it("has pointer-events-none to avoid blocking interaction", () => {
		render(<StudioBackground />);
		const el = screen.getByTestId("studio-background");
		expect(el.className).toContain("pointer-events-none");
	});

	it("has aria-hidden for accessibility", () => {
		render(<StudioBackground />);
		const el = screen.getByTestId("studio-background");
		expect(el.getAttribute("aria-hidden")).toBe("true");
	});
});
