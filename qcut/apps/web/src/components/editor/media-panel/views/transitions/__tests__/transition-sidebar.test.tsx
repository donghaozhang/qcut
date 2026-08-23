import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransitionSidebar } from "../transition-sidebar";

describe("TransitionSidebar", () => {
	it("keeps Transition Lab independent from the collapsible effect categories", () => {
		render(<TransitionSidebar category="lab" onSelect={vi.fn()} />);

		const effectsToggle = screen.getByRole("button", { name: "转场效果" });
		const labButton = screen.getByRole("button", { name: "转场实验室" });
		expect(effectsToggle).toHaveAttribute("aria-expanded", "true");
		expect(labButton).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "热门" })).toBeVisible();

		fireEvent.click(effectsToggle);

		expect(effectsToggle).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("button", { name: "热门" })).toBeNull();
		expect(labButton).toBeVisible();
	});

	it("selects ordinary categories from the expanded effect group", () => {
		const onSelect = vi.fn();
		render(<TransitionSidebar category="all" onSelect={onSelect} />);

		fireEvent.click(screen.getByRole("button", { name: "模糊" }));

		expect(onSelect).toHaveBeenCalledWith({ category: "blur" });
	});
});
