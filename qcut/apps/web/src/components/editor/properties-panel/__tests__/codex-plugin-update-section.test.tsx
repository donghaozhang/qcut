import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@/test/test-utils";
import type { PlatformCodexPluginUpdateState } from "@qcut/platform-core";
import { useLocaleStore } from "@/stores/locale-store";

const mocks = vi.hoisted(() => {
	const state: PlatformCodexPluginUpdateState = {
		phase: "up-to-date",
		codexAvailable: true,
		installed: true,
		installedVersion: "1.1.0",
		latestVersion: "1.1.0",
	};
	return {
		state,
		listener: undefined as
			| ((state: PlatformCodexPluginUpdateState) => void)
			| undefined,
		plugin: {
			checkForUpdates: vi.fn(async () => state),
			installUpdate: vi.fn(async () => ({
				...state,
				phase: "restart-required" as const,
			})),
			getState: vi.fn(async () => state),
			onStateChanged: vi.fn(
				(listener: (state: PlatformCodexPluginUpdateState) => void) => {
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
			updates: { plugin: mocks.plugin },
		}),
	};
});

import { CodexPluginUpdateSection } from "../codex-plugin-update-section";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.listener = undefined;
	useLocaleStore.getState().setLocale({ locale: "en" });
});

describe("CodexPluginUpdateSection", () => {
	it("shows the installed plugin version and checks manually", async () => {
		render(<CodexPluginUpdateSection />);

		expect(
			await screen.findByText("QCut Plugin v1.1.0 is up to date")
		).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("codex-plugin-check-button"));
		await waitFor(() =>
			expect(mocks.plugin.checkForUpdates).toHaveBeenCalledTimes(1)
		);
	});

	it("installs an available plugin update", async () => {
		render(<CodexPluginUpdateSection />);
		await screen.findByText("QCut Plugin v1.1.0 is up to date");

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "available",
				latestVersion: "1.2.0",
			});
		});

		fireEvent.click(
			await screen.findByRole("button", { name: "Update plugin" })
		);
		await waitFor(() =>
			expect(mocks.plugin.installUpdate).toHaveBeenCalledTimes(1)
		);
	});

	it("keeps a disabled progress action visible while updating", async () => {
		render(<CodexPluginUpdateSection />);
		await screen.findByText("QCut Plugin v1.1.0 is up to date");

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "updating",
			});
		});

		expect(
			screen.getByRole("button", { name: "Updating QCut Plugin..." })
		).toBeDisabled();
	});
});
