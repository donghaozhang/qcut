import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimelineEditModeControl } from "../timeline-edit-mode-control";
import { useTimelineEditModeStore } from "@/stores/timeline/timeline-edit-mode-store";

function renderControl() {
	return render(
		<TooltipProvider>
			<TimelineEditModeControl />
		</TooltipProvider>
	);
}

describe("TimelineEditModeControl", () => {
	beforeEach(() => {
		useTimelineEditModeStore.setState({ editMode: "select" });
	});

	it("shows the active tool on the trigger button", () => {
		renderControl();
		expect(screen.getByTestId("timeline-edit-mode-current")).toHaveAttribute(
			"aria-label",
			"选择"
		);

		useTimelineEditModeStore.setState({ editMode: "slip" });
		renderControl();
		expect(
			screen.getAllByTestId("timeline-edit-mode-current")[1]
		).toHaveAttribute("aria-label", "滑移编辑");
	});

	it("switches the mode from the dropdown", () => {
		renderControl();
		fireEvent.pointerDown(screen.getByTestId("timeline-edit-mode-trigger"));
		fireEvent.click(screen.getByTestId("timeline-edit-mode-roll"));

		expect(useTimelineEditModeStore.getState().editMode).toBe("roll");
	});

	it("lists every tool with the select shortcut hint", () => {
		renderControl();
		fireEvent.pointerDown(screen.getByTestId("timeline-edit-mode-trigger"));

		for (const mode of ["select", "roll", "slip", "slide"]) {
			expect(
				screen.getByTestId(`timeline-edit-mode-${mode}`)
			).toBeInTheDocument();
		}
		// The qcut profile binds A to the select tool, Jianying-style.
		expect(screen.getByTestId("timeline-edit-mode-select")).toHaveTextContent(
			/A$/
		);
	});
});
