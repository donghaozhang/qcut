import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformUpdateState } from "@qcut/platform-core";
import { useLocaleStore } from "@/stores/locale-store";
import { fireEvent, render, screen, waitFor } from "@/test/test-utils";

const mocks = vi.hoisted(() => ({
	available: true,
	state: {
		phase: "up-to-date",
		currentVersion: "2026.8.103",
		percent: 0,
		transferred: 0,
		total: 0,
		automaticDownload: false,
	} as PlatformUpdateState,
	checkForUpdates: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/use-app-update", () => ({
	useAppUpdate: () => ({
		state: mocks.state,
		available: mocks.available,
		checkForUpdates: mocks.checkForUpdates,
	}),
}));

vi.mock("@/components/about-updates-dialog", () => ({
	AboutUpdatesDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="update-details">Update details</div> : null,
}));

import { AppUpdateButton } from "../app-update-button";

beforeEach(() => {
	vi.clearAllMocks();
	useLocaleStore.getState().setLocale({ locale: "en" });
	mocks.available = true;
	mocks.state = {
		phase: "up-to-date",
		currentVersion: "2026.8.103",
		percent: 0,
		transferred: 0,
		total: 0,
		automaticDownload: false,
	};
});

describe("AppUpdateButton", () => {
	it("checks for the latest release and opens update details", async () => {
		render(<AppUpdateButton />);

		fireEvent.click(
			screen.getByRole("button", { name: "Check for latest update" })
		);

		expect(screen.getByTestId("update-details")).toBeInTheDocument();
		await waitFor(() => expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1));
	});

	it("makes an available update visually actionable without rechecking", () => {
		mocks.state = {
			...mocks.state,
			phase: "available",
			version: "2026.8.207",
		};
		render(<AppUpdateButton />);

		const button = screen.getByRole("button", {
			name: "Update available · v2026.8.207",
		});
		expect(button).toHaveClass("bg-yellow-500");
		fireEvent.click(button);
		expect(mocks.checkForUpdates).not.toHaveBeenCalled();
		expect(screen.getByTestId("update-details")).toBeInTheDocument();
	});

	it("shows progress and the ready-to-install state", () => {
		mocks.state = {
			...mocks.state,
			phase: "downloading",
			percent: 42,
		};
		const { rerender } = render(<AppUpdateButton />);
		expect(
			screen.getByRole("button", { name: "Downloading update · 42%" })
		).toBeInTheDocument();

		mocks.state = { ...mocks.state, phase: "ready" };
		rerender(<AppUpdateButton />);
		expect(
			screen.getByRole("button", { name: "Install update" })
		).toBeInTheDocument();
	});

	it("does not render in the web build without update capability", () => {
		mocks.available = false;
		render(<AppUpdateButton />);

		expect(
			screen.queryByTestId("global-app-update-button")
		).not.toBeInTheDocument();
	});
});
