import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@/test/test-utils";
import { PortraitCollapsibleGroup } from "../portrait-collapsible-group";

function GroupHarness({ active = false }: { active?: boolean }) {
	const [open, setOpen] = useState(false);
	return (
		<PortraitCollapsibleGroup
			active={active}
			label="皮肤管理"
			open={open}
			onOpenChange={setOpen}
			testId="portrait-group-skin"
		>
			<div>磨皮参数</div>
		</PortraitCollapsibleGroup>
	);
}

describe("PortraitCollapsibleGroup", () => {
	it("starts collapsed and toggles its content independently", () => {
		render(<GroupHarness />);
		const trigger = screen.getByRole("button", {
			name: "皮肤管理",
		});

		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("磨皮参数")).not.toBeInTheDocument();

		fireEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText("磨皮参数")).toBeVisible();

		fireEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("磨皮参数")).not.toBeInTheDocument();
	});

	it("exposes whether the group contains active adjustments", () => {
		render(<GroupHarness active />);

		expect(screen.getByTestId("portrait-group-skin")).toHaveAttribute(
			"data-active",
			"true"
		);
	});
});
