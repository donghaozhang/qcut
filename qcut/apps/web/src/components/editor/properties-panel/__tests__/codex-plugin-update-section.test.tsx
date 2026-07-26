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

	it("shows status text for checking, not-installed, and unavailable phases", async () => {
		render(<CodexPluginUpdateSection />);
		await screen.findByText("QCut Plugin v1.1.0 is up to date");

		act(() => {
			mocks.listener?.({ ...mocks.state, phase: "checking" });
		});
		expect(screen.getByText("Checking QCut Plugin...")).toBeInTheDocument();
		expect(screen.getByTestId("codex-plugin-check-button")).toBeDisabled();

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "not-installed",
				installed: false,
				installedVersion: undefined,
			});
		});
		expect(
			screen.getByText("Install the plugin to control QCut from Codex")
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Install plugin" })
		).toBeInTheDocument();

		act(() => {
			mocks.listener?.({ ...mocks.state, phase: "unavailable" });
		});
		expect(
			screen.getByText("Codex CLI is not available on this computer")
		).toBeInTheDocument();
	});

	it("prefers the error detail, then the message, then the generic failure text", async () => {
		render(<CodexPluginUpdateSection />);
		await screen.findByText("QCut Plugin v1.1.0 is up to date");

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "error",
				error: "npm exited with code 1",
			});
		});
		expect(screen.getByText("npm exited with code 1")).toBeInTheDocument();

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "error",
				message: "Marketplace unreachable",
			});
		});
		expect(screen.getByText("Marketplace unreachable")).toBeInTheDocument();

		act(() => {
			mocks.listener?.({ ...mocks.state, phase: "error" });
		});
		expect(screen.getByText("QCut Plugin update failed")).toBeInTheDocument();
	});

	it("activates buttons from the keyboard and ignores other keys", async () => {
		render(<CodexPluginUpdateSection />);
		await screen.findByText("QCut Plugin v1.1.0 is up to date");

		const checkButton = screen.getByTestId("codex-plugin-check-button");
		fireEvent.keyDown(checkButton, { key: "a" });
		expect(mocks.plugin.checkForUpdates).not.toHaveBeenCalled();

		fireEvent.keyDown(checkButton, { key: "Enter" });
		await waitFor(() =>
			expect(mocks.plugin.checkForUpdates).toHaveBeenCalledTimes(1)
		);

		act(() => {
			mocks.listener?.({
				...mocks.state,
				phase: "available",
				latestVersion: "1.2.0",
			});
		});
		fireEvent.keyDown(screen.getByTestId("codex-plugin-update-button"), {
			key: " ",
		});
		await waitFor(() =>
			expect(mocks.plugin.installUpdate).toHaveBeenCalledTimes(1)
		);
	});
});
