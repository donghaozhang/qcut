import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopOnly, WebUnavailable } from "../desktop-only";

vi.mock("@/hooks/use-platform-capability", () => ({
	useIsDesktop: vi.fn(() => false),
}));

import { useIsDesktop } from "@/hooks/use-platform-capability";

describe("DesktopOnly", () => {
	beforeEach(() => {
		vi.mocked(useIsDesktop).mockReturnValue(false);
	});

	it("hides children on web by default", () => {
		render(<DesktopOnly><span>secret</span></DesktopOnly>);
		expect(screen.queryByText("secret")).toBeNull();
	});

	it("shows children on desktop", () => {
		vi.mocked(useIsDesktop).mockReturnValue(true);
		render(<DesktopOnly><span>visible</span></DesktopOnly>);
		expect(screen.getByText("visible")).toBeDefined();
	});

	it("shows fallback on web when provided", () => {
		render(
			<DesktopOnly fallback={<span>web fallback</span>}>
				<span>desktop content</span>
			</DesktopOnly>
		);
		expect(screen.queryByText("desktop content")).toBeNull();
		expect(screen.getByText("web fallback")).toBeDefined();
	});
});

describe("WebUnavailable", () => {
	it("shows feature name in message", () => {
		render(<WebUnavailable feature="Terminal" />);
		expect(screen.getByText(/Terminal requires the QCut desktop app/)).toBeDefined();
	});
});
