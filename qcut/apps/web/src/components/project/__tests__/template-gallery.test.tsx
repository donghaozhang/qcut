import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateGallery } from "../template-gallery";

vi.mock("lucide-react", () => ({
	Film: () => <svg data-testid="film-icon" />,
	MonitorPlay: () => <svg data-testid="monitor-icon" />,
	Package: () => <svg data-testid="package-icon" />,
	User: () => <svg data-testid="user-icon" />,
}));

describe("TemplateGallery", () => {
	it("renders section heading", () => {
		render(<TemplateGallery onCreateFromTemplate={() => {}} />);
		expect(screen.getByText("Start from Template")).toBeTruthy();
	});

	it("renders all 4 templates", () => {
		render(<TemplateGallery onCreateFromTemplate={() => {}} />);
		expect(screen.getByText("Social Reel")).toBeTruthy();
		expect(screen.getByText("YouTube Video")).toBeTruthy();
		expect(screen.getByText("Product Demo")).toBeTruthy();
		expect(screen.getByText("AI Avatar")).toBeTruthy();
	});

	it("calls onCreateFromTemplate with correct canvas size for Social Reel", () => {
		const handler = vi.fn();
		render(<TemplateGallery onCreateFromTemplate={handler} />);
		fireEvent.click(screen.getByText("Social Reel"));
		expect(handler).toHaveBeenCalledWith("Social Reel", {
			width: 1080,
			height: 1920,
		});
	});

	it("calls onCreateFromTemplate with correct canvas size for YouTube Video", () => {
		const handler = vi.fn();
		render(<TemplateGallery onCreateFromTemplate={handler} />);
		fireEvent.click(screen.getByText("YouTube Video"));
		expect(handler).toHaveBeenCalledWith("YouTube Video", {
			width: 1920,
			height: 1080,
		});
	});
});
