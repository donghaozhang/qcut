import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransitionSidebar } from "../transition-sidebar";

describe("TransitionSidebar", () => {
	it("nests Transition Lab categories under their own collapsible section", () => {
		render(
			<TransitionSidebar
				category="lab"
				labGroup="camera"
				labSource="jianying-local"
				onSelect={vi.fn()}
				onSelectLabGroup={vi.fn()}
			/>
		);

		const effectsToggle = screen.getByRole("button", { name: "转场效果" });
		const labButton = screen.getByRole("button", { name: "转场实验室" });
		const labCategories = screen.getByTestId("transition-lab-categories");
		expect(effectsToggle).toHaveAttribute("aria-expanded", "false");
		expect(labButton).toHaveAttribute("aria-expanded", "true");
		expect(
			within(labCategories).getByRole("button", { name: /运镜\s+40 个转场/ })
		).toHaveAttribute("aria-pressed", "true");

		fireEvent.click(labButton);

		expect(labButton).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByTestId("transition-lab-categories")).toBeNull();
	});

	it("selects ordinary categories from the expanded effect group", () => {
		const onSelect = vi.fn();
		render(
			<TransitionSidebar
				category="all"
				labGroup="all"
				labSource="all"
				onSelect={onSelect}
				onSelectLabGroup={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "模糊" }));

		expect(onSelect).toHaveBeenCalledWith({ category: "blur" });
	});

	it("selects a laboratory category from the expanded laboratory section", () => {
		const onSelectLabGroup = vi.fn();
		render(
			<TransitionSidebar
				category="lab"
				labGroup="all"
				labSource="jianying-local"
				onSelect={vi.fn()}
				onSelectLabGroup={onSelectLabGroup}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: /幻灯片\s+40 个转场/ }));

		expect(onSelectLabGroup).toHaveBeenCalledWith({ group: "slideshow" });
	});
});
