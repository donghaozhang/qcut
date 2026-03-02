import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiStatusIndicator } from "../ai-status-indicator";

vi.mock("@/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="badge" className={className}>
			{children}
		</div>
	),
}));

describe("AiStatusIndicator", () => {
	it("renders AI Ready text", () => {
		render(<AiStatusIndicator />);
		expect(screen.getByText("AI Ready")).toBeTruthy();
	});

	it("renders green indicator dot", () => {
		render(<AiStatusIndicator />);
		const badge = screen.getByTestId("badge");
		const dots = badge.querySelectorAll("span.bg-green-500, span.bg-green-400");
		expect(dots.length).toBeGreaterThan(0);
	});
});
