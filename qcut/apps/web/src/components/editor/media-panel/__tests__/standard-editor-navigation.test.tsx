import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StandardEditorNavigation } from "../standard-editor-navigation";
import { STANDARD_EDITOR_TABS, useMediaPanelStore } from "../store";

describe("StandardEditorNavigation", () => {
	beforeEach(() => {
		useMediaPanelStore.setState({
			activeGroup: "media",
			activeTab: "media",
			activeEditSubgroup: "ai-edit",
			lastTabPerGroup: {
				media: "media",
				"ai-create": "ai",
				agents: "nano-edit",
				edit: "word-timeline",
			},
			aiActiveTab: "text",
		});
	});

	it("renders every core editor tool as a direct tab", () => {
		render(<StandardEditorNavigation />);

		for (const tab of STANDARD_EDITOR_TABS) {
			expect(screen.getByTestId(`${tab}-panel-tab`)).toBeInTheDocument();
		}
		expect(screen.getAllByRole("button")).toHaveLength(
			STANDARD_EDITOR_TABS.length + 1
		);
	});

	it("opens a manual editing tool without an intermediate subgroup", () => {
		render(<StandardEditorNavigation />);

		fireEvent.click(screen.getByTestId("transitions-panel-tab"));

		const state = useMediaPanelStore.getState();
		expect(state.activeTab).toBe("transitions");
		expect(state.activeGroup).toBe("edit");
		expect(state.activeEditSubgroup).toBe("manual-edit");
		expect(screen.getByTestId("transitions-panel-tab")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("returns from a secondary workspace through a standard tab", () => {
		useMediaPanelStore.setState({
			activeGroup: "agents",
			activeTab: "pty",
		});
		render(<StandardEditorNavigation />);

		fireEvent.click(screen.getByTestId("media-panel-tab"));

		expect(useMediaPanelStore.getState().activeGroup).toBe("media");
		expect(useMediaPanelStore.getState().activeTab).toBe("media");
	});
});
