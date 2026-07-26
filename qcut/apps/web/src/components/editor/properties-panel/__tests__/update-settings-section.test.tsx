import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { act, fireEvent, render, screen, waitFor } from "@/test/test-utils";
import type { PlatformUpdateState } from "@qcut/platform-core";
import { useLocaleStore } from "@/stores/locale-store";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

const mocks = vi.hoisted(() => {
	const state: PlatformUpdateState = {
		phase: "up-to-date",
		currentVersion: "2026.07.11.1",
		percent: 0,
		transferred: 0,
		total: 0,
		automaticDownload: false,
	};
	return {
		state,
		platformUnavailable: false,
		listener: undefined as ((state: PlatformUpdateState) => void) | undefined,
		updates: {
			checkForUpdates: vi.fn(async () => state),
			downloadUpdate: vi.fn(async () => state),
			installUpdate: vi.fn(async () => undefined),
			getState: vi.fn(async () => state),
			getPreferences: vi.fn(async () => ({
				automaticUpdates: true,
				maxAutomaticDownloadBytes: 512 * 1024 * 1024,
			})),
			setPreferences: vi.fn(
				async (preferences: { automaticUpdates?: boolean }) => ({
					automaticUpdates: preferences.automaticUpdates ?? true,
					maxAutomaticDownloadBytes: 512 * 1024 * 1024,
				})
			),
			onStateChanged: vi.fn(
				(listener: (state: PlatformUpdateState) => void) => {
					mocks.listener = listener;
					return vi.fn();
				}
			),
		},
	};
});

vi.mock("@qcut/platform-core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@qcut/platform-core")>();
	return {
		...actual,
		platform: () => {
			if (mocks.platformUnavailable) {
				throw new Error("platform bridge unavailable");
			}
			return {
				hasCapability: () => true,
				updates: mocks.updates,
			};
		},
	};
});

import { UpdateSettingsSection } from "../update-settings-section";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.platformUnavailable = false;
	mocks.listener = undefined;
	useLocaleStore.getState().setLocale({ locale: "en" });
});

describe("UpdateSettingsSection", () => {
	it("loads the current version and persists the automatic update toggle", async () => {
		render(<UpdateSettingsSection />);

		expect(
			await screen.findByText("QCut v2026.07.11.1 is up to date")
		).toBeInTheDocument();
		const toggle = screen.getByRole("switch", {
			name: /^Automatic updates/,
		});
		expect(toggle).toBeChecked();

		fireEvent.click(toggle);
		await waitFor(() =>
			expect(mocks.updates.setPreferences).toHaveBeenCalledWith({
				automaticUpdates: false,
			})
		);
	});

	it("checks manually and offers download when consent is required", async () => {
		render(<UpdateSettingsSection />);
		fireEvent.click(await screen.findByTestId("app-update-check-button"));
		await waitFor(() =>
			expect(mocks.updates.checkForUpdates).toHaveBeenCalledTimes(1)
		);
		await act(async () => {
			await Promise.resolve();
		});

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "available",
				version: "2026.07.12.1",
				decision: "too-large",
			});
		});
		const download = await screen.findByRole("button", {
			name: "Download v2026.07.12.1",
		});
		fireEvent.click(download);
		await waitFor(() =>
			expect(mocks.updates.downloadUpdate).toHaveBeenCalledTimes(1)
		);
	});

	it("restarts the app when a downloaded update is ready", async () => {
		render(<UpdateSettingsSection />);
		await screen.findByText("QCut v2026.07.11.1 is up to date");

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "ready",
				version: "2026.07.12.1",
			});
		});

		fireEvent.click(
			await screen.findByRole("button", { name: "Restart and install" })
		);
		await waitFor(() =>
			expect(mocks.updates.installUpdate).toHaveBeenCalledTimes(1)
		);
	});

	it("disables update controls when the platform bridge is unavailable", () => {
		mocks.platformUnavailable = true;
		render(<UpdateSettingsSection />);

		expect(screen.getByText("Updates unavailable")).toBeInTheDocument();
		expect(screen.getByTestId("app-update-check-button")).toBeDisabled();
		expect(
			screen.getByRole("switch", { name: /^Automatic updates/ })
		).toBeDisabled();
		expect(mocks.updates.getState).not.toHaveBeenCalled();
	});

	it("shows checking, download progress, and error statuses", async () => {
		render(<UpdateSettingsSection />);
		await screen.findByText("QCut v2026.07.11.1 is up to date");

		act(() => {
			mocks.listener?.({ ...mocks.state, phase: "checking" });
		});
		expect(screen.getByText("Checking for updates...")).toBeInTheDocument();
		expect(screen.getByTestId("app-update-check-button")).toBeDisabled();

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "downloading",
				version: "2026.07.12.1",
				percent: 42,
			});
		});
		expect(
			screen.getByText("Downloading v2026.07.12.1 · 42%")
		).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"42"
		);

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "error",
				error: "Update server unreachable",
			});
		});
		expect(screen.getByText("Update server unreachable")).toBeInTheDocument();

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "error",
				message: "Retrying later",
			});
		});
		expect(screen.getByText("Retrying later")).toBeInTheDocument();

		act(() => {
			mocks.listener?.({ ...mocks.state, phase: "error" });
		});
		expect(screen.getByText("Updates unavailable")).toBeInTheDocument();
	});

	it("shows a toast when downloading the update fails", async () => {
		mocks.updates.downloadUpdate.mockRejectedValueOnce(new Error("disk full"));
		render(<UpdateSettingsSection />);
		await screen.findByText("QCut v2026.07.11.1 is up to date");

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "available",
				version: "2026.07.12.1",
			});
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Download v2026.07.12.1" })
		);
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("Failed to download update")
		);
	});

	it("shows a toast when installing the update fails", async () => {
		mocks.updates.installUpdate.mockRejectedValueOnce(
			new Error("install blocked")
		);
		render(<UpdateSettingsSection />);
		await screen.findByText("QCut v2026.07.11.1 is up to date");

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "ready",
				version: "2026.07.12.1",
			});
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Restart and install" })
		);
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("Failed to install update")
		);
	});

	it("activates update actions with Enter or Space and ignores other keys", async () => {
		render(<UpdateSettingsSection />);
		await screen.findByText("QCut v2026.07.11.1 is up to date");

		const check = screen.getByTestId("app-update-check-button");
		fireEvent.keyDown(check, { key: "Escape" });
		expect(mocks.updates.checkForUpdates).not.toHaveBeenCalled();

		fireEvent.keyDown(check, { key: "Enter" });
		await waitFor(() =>
			expect(mocks.updates.checkForUpdates).toHaveBeenCalledTimes(1)
		);
		await act(async () => {
			await Promise.resolve();
		});

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "available",
				version: "2026.07.12.1",
			});
		});
		fireEvent.keyDown(
			screen.getByRole("button", { name: "Download v2026.07.12.1" }),
			{ key: " " }
		);
		await waitFor(() =>
			expect(mocks.updates.downloadUpdate).toHaveBeenCalledTimes(1)
		);
		await act(async () => {
			await Promise.resolve();
		});

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "ready",
				version: "2026.07.12.1",
			});
		});
		fireEvent.keyDown(
			screen.getByRole("button", { name: "Restart and install" }),
			{ key: "Enter" }
		);
		await waitFor(() =>
			expect(mocks.updates.installUpdate).toHaveBeenCalledTimes(1)
		);
	});
});
