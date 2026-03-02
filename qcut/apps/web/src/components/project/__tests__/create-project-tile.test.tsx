import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateProjectTile } from "../create-project-tile";

vi.mock("lucide-react", () => ({
	Plus: () => <svg data-testid="plus-icon" />,
}));

describe("CreateProjectTile", () => {
	it("renders New Project text", () => {
		render(<CreateProjectTile onClick={() => {}} />);
		expect(screen.getByText("New Project")).toBeTruthy();
	});

	it("calls onClick when clicked", () => {
		const onClick = vi.fn();
		render(<CreateProjectTile onClick={onClick} />);
		fireEvent.click(screen.getByTestId("create-project-tile"));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("renders plus icon", () => {
		render(<CreateProjectTile onClick={() => {}} />);
		expect(document.querySelector('[data-testid="plus-icon"]')).toBeTruthy();
	});
});
