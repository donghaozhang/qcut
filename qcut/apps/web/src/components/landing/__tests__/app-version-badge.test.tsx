import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppVersionBadge } from "../app-version-badge";

const { useAppVersionMock } = vi.hoisted(() => ({
	useAppVersionMock: vi.fn<() => string | null>(),
}));

vi.mock("@/hooks/use-app-version", () => ({
	useAppVersion: useAppVersionMock,
}));

beforeEach(() => {
	useAppVersionMock.mockReturnValue("2026.07.27.3");
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("AppVersionBadge", () => {
	it("shows the running QCut version prominently", () => {
		render(<AppVersionBadge />);
		const versionBadge = screen.getByTestId("app-version");

		expect(versionBadge).toHaveTextContent("QCut · v2026.07.27.3");
		expect(versionBadge).toHaveAttribute(
			"aria-label",
			"QCut version 2026.07.27.3"
		);
		expect(versionBadge.className).toContain("bg-yellow-500");
	});

	it("reserves its position while no app version is available", () => {
		useAppVersionMock.mockReturnValue(null);
		const { container } = render(<AppVersionBadge />);

		expect(screen.queryByTestId("app-version")).not.toBeInTheDocument();
		expect(container.firstElementChild?.className).toContain("min-h-7");
	});
});
