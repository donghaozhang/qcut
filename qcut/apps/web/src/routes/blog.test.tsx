import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import type { FC } from "react";

const mockOpenInNewTab = vi.fn();
let BlogPage: FC;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: FC }) => {
		BlogPage = opts.component;
		return {};
	},
}));

vi.mock("@/components/header", () => ({
	Header: () => <div data-testid="header" />,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: {
		children: React.ReactNode;
		onClick?: () => void;
	}) => (
		<button onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

vi.mock("lucide-react", () => ({
	ExternalLink: () => <span>icon</span>,
}));

vi.mock("@/lib/utils", () => ({
	openInNewTab: (...args: unknown[]) => mockOpenInNewTab(...args),
	cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));

beforeAll(async () => {
	initPlatform(createWebAdapter());
	await import("./blog");
});

afterEach(() => {
	cleanup();
	mockOpenInNewTab.mockClear();
	delete (window as unknown as Record<string, unknown>).electronAPI;
});

describe("BlogPage", () => {
	it("renders the page with heading and button", () => {
		const { getByText, getByTestId } = render(<BlogPage />);
		expect(getByTestId("header")).toBeInTheDocument();
		expect(getByText("Latest Updates")).toBeInTheDocument();
		expect(getByText("Visit QCut on GitHub")).toBeInTheDocument();
	});

	it("uses platform shell when electronAPI is not available", async () => {
		// With the web adapter, platform().shell.openExternal uses window.open
		// instead of falling back to openInNewTab
		const { getByText } = render(<BlogPage />);
		fireEvent.click(getByText("Visit QCut on GitHub"));

		// Web adapter's openExternal handles it via window.open, so
		// openInNewTab should NOT be called
		await vi.waitFor(() => {
			expect(mockOpenInNewTab).not.toHaveBeenCalled();
		});
	});

	it("calls electronAPI.shell.openExternal when available", async () => {
		const mockOpenExternal = vi.fn().mockResolvedValue(undefined);
		(window as unknown as Record<string, unknown>).electronAPI = {
			shell: { openExternal: mockOpenExternal },
		};
		initPlatform(createDesktopAdapter());

		const { getByText } = render(<BlogPage />);
		fireEvent.click(getByText("Visit QCut on GitHub"));

		await vi.waitFor(() => {
			expect(mockOpenExternal).toHaveBeenCalledWith(
				"https://github.com/donghaozhang/qcut"
			);
		});
		expect(mockOpenInNewTab).not.toHaveBeenCalled();
	});

	it("falls back to openInNewTab when electronAPI throws", async () => {
		const mockOpenExternal = vi.fn().mockRejectedValue(new Error("fail"));
		(window as unknown as Record<string, unknown>).electronAPI = {
			shell: { openExternal: mockOpenExternal },
		};
		initPlatform(createDesktopAdapter());

		const { getByText } = render(<BlogPage />);
		fireEvent.click(getByText("Visit QCut on GitHub"));

		await vi.waitFor(() => {
			expect(mockOpenInNewTab).toHaveBeenCalledWith(
				"https://github.com/donghaozhang/qcut"
			);
		});
	});
});
