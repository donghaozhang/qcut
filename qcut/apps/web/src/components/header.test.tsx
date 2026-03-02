import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock("@/lib/asset-path", () => ({
	getAssetPath: (p: string) => `/${p}`,
}));

vi.mock("./ui/theme-toggle", () => ({
	ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("./header-base", () => ({
	HeaderBase: ({
		leftContent,
		rightContent,
		className,
	}: {
		leftContent: React.ReactNode;
		rightContent: React.ReactNode;
		className: string;
	}) => (
		<header className={className}>
			{leftContent}
			{rightContent}
		</header>
	),
}));

import { Header } from "@/components/header";

afterEach(() => {
	cleanup();
});

describe("Header", () => {
	it("renders default variant", () => {
		const { getByText } = render(<Header />);
		expect(getByText("QCut")).toBeInTheDocument();
		expect(getByText("Projects")).toBeInTheDocument();
	});

	it("renders landing variant with backdrop blur class", () => {
		const { container } = render(<Header variant="landing" />);
		const header = container.querySelector("header");
		expect(header?.className).toContain("backdrop-blur-sm");
	});

	it("renders dark variant with transparent bg", () => {
		const { container } = render(<Header variant="dark" />);
		const header = container.querySelector("header");
		expect(header?.className).toContain("bg-transparent");
	});

	it("applies absolute positioning for landing variant", () => {
		const { container } = render(<Header variant="landing" />);
		const wrapper = container.firstElementChild;
		expect(wrapper?.className).toContain("absolute");
	});

	it("hides ThemeToggle for dark variant", () => {
		const { queryByTestId } = render(<Header variant="dark" />);
		expect(queryByTestId("theme-toggle")).not.toBeInTheDocument();
	});

	it("shows ThemeToggle for default variant", () => {
		const { getByTestId } = render(<Header />);
		expect(getByTestId("theme-toggle")).toBeInTheDocument();
	});
});
