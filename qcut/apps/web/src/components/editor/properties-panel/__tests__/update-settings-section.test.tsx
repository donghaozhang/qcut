import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@/test/test-utils";
import type { PlatformUpdateState } from "@qcut/platform-core";

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
		platform: () => ({
			hasCapability: () => true,
			updates: mocks.updates,
		}),
	};
});

import { UpdateSettingsSection } from "../update-settings-section";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.listener = undefined;
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
		fireEvent.click(await screen.findByRole("button", { name: "Check now" }));
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
});
