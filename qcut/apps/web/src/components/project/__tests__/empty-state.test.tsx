import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoProjects, NoResults } from "../empty-state";

vi.mock("lucide-react", () => ({
	Plus: () => <svg data-testid="plus-icon" />,
	Search: () => <svg data-testid="search-icon" />,
	Sparkles: () => <svg data-testid="sparkles-icon" />,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		[key: string]: unknown;
	}) => (
		<button onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

describe("NoProjects", () => {
	it("renders branded heading", () => {
		render(<NoProjects onCreateProject={() => {}} />);
		expect(screen.getByText("Start your first AI-powered video")).toBeTruthy();
	});

	it("renders subtext", () => {
		render(<NoProjects onCreateProject={() => {}} />);
		expect(
			screen.getByText("Create a project to begin editing with AI assistance")
		).toBeTruthy();
	});

	it("renders sparkles icon", () => {
		render(<NoProjects onCreateProject={() => {}} />);
		expect(
			document.querySelector('[data-testid="sparkles-icon"]')
		).toBeTruthy();
	});

	it("calls onCreateProject when CTA is clicked", () => {
		const onCreateProject = vi.fn();
		render(<NoProjects onCreateProject={onCreateProject} />);
		fireEvent.click(screen.getByTestId("new-project-button-empty-state"));
		expect(onCreateProject).toHaveBeenCalledOnce();
	});
});

describe("NoResults", () => {
	it("renders search query in message", () => {
		render(<NoResults searchQuery="test query" onClearSearch={() => {}} />);
		expect(screen.getByText(/test query/)).toBeTruthy();
	});

	it("calls onClearSearch when button is clicked", () => {
		const onClearSearch = vi.fn();
		render(<NoResults searchQuery="test" onClearSearch={onClearSearch} />);
		fireEvent.click(screen.getByText("Clear Search"));
		expect(onClearSearch).toHaveBeenCalledOnce();
	});
});
