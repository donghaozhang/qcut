import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformCodexPluginUpdateState } from "@qcut/platform-core";
import { fireEvent, render, screen } from "@/test/test-utils";
import { useLocaleStore } from "@/stores/locale-store";

const mocks = vi.hoisted(() => ({
	installUpdate: vi.fn(async () => ({
		phase: "restart-required" as const,
		codexAvailable: true,
		installed: true,
		installedVersion: "1.1.0",
	})),
	state: {
		phase: "available",
		codexAvailable: true,
		installed: true,
		installedVersion: "1.0.0",
		latestVersion: "1.1.0",
	} as PlatformCodexPluginUpdateState,
}));

vi.mock("@/hooks/use-codex-plugin-update", () => ({
	useCodexPluginUpdate: () => ({
		state: mocks.state,
		installUpdate: mocks.installUpdate,
	}),
}));

import { CodexPluginUpdateNotification } from "../codex-plugin-update-notification";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state = {
		phase: "available",
		codexAvailable: true,
		installed: true,
		installedVersion: "1.0.0",
		latestVersion: "1.1.0",
	};
	useLocaleStore.getState().setLocale({ locale: "en" });
});

describe("CodexPluginUpdateNotification", () => {
	it("offers an available plugin update", () => {
		render(<CodexPluginUpdateNotification />);

		expect(
			screen.getByText("QCut Plugin v1.1.0 is available")
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Update plugin" }));
		expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
	});

	it("can dismiss the current plugin version", () => {
		render(<CodexPluginUpdateNotification />);

		fireEvent.click(screen.getByRole("button", { name: "Later" }));
		expect(
			screen.queryByTestId("codex-plugin-update-notification")
		).not.toBeInTheDocument();
	});

	it("announces the installed version when a restart is required", () => {
		mocks.state = {
			phase: "restart-required",
			codexAvailable: true,
			installed: true,
			installedVersion: "1.1.0",
		};
		render(<CodexPluginUpdateNotification />);

		expect(
			screen.getByText("Updated to v1.1.0. Start a new Codex task to use it.")
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Update plugin" })
		).not.toBeInTheDocument();
	});

	it("starts the update with Enter and ignores other keys", () => {
		render(<CodexPluginUpdateNotification />);

		const updateButton = screen.getByRole("button", { name: "Update plugin" });
		fireEvent.keyDown(updateButton, { key: "Escape" });
		expect(mocks.installUpdate).not.toHaveBeenCalled();

		fireEvent.keyDown(updateButton, { key: "Enter" });
		expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
	});

	it("dismisses the notification with the Space key", () => {
		render(<CodexPluginUpdateNotification />);

		fireEvent.keyDown(screen.getByRole("button", { name: "Later" }), {
			key: " ",
		});
		expect(
			screen.queryByTestId("codex-plugin-update-notification")
		).not.toBeInTheDocument();
	});
});
