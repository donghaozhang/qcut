import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertyGroup } from "../property-item";

describe("PropertyGroup header", () => {
	it("stays a plain collapsible when no header features are requested", () => {
		render(
			<PropertyGroup title="位置与大小" testId="group">
				<span>body</span>
			</PropertyGroup>
		);
		expect(screen.queryByRole("checkbox")).toBeNull();
		expect(screen.getByText("body")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("group"));
		expect(screen.queryByText("body")).toBeNull();
	});

	it("wires the enable checkbox, reset icon and header actions", () => {
		const onEnabledChange = vi.fn();
		const onReset = vi.fn();
		render(
			<PropertyGroup
				title="变形"
				enabled={false}
				enableLabel="启用变形"
				onEnabledChange={onEnabledChange}
				resetLabel="重置变形"
				onReset={onReset}
				info="tooltip"
				headerActions={<span data-testid="actions">◇</span>}
			>
				<span>body</span>
			</PropertyGroup>
		);
		const checkbox = screen.getByLabelText("启用变形");
		expect(checkbox).toHaveAttribute("data-state", "unchecked");
		fireEvent.click(checkbox);
		expect(onEnabledChange).toHaveBeenCalledWith(true);
		fireEvent.click(screen.getByLabelText("重置变形"));
		expect(onReset).toHaveBeenCalledOnce();
		expect(screen.getByTestId("actions")).toBeInTheDocument();
		// A disabled section keeps its body visible but inert.
		expect(screen.getByText("body").parentElement).toHaveClass(
			"pointer-events-none"
		);
	});
});
