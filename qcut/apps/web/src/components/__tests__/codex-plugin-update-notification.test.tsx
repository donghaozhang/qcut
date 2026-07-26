import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/test-utils";
import { useLocaleStore } from "@/stores/locale-store";

const mocks = vi.hoisted(() => ({
	installUpdate: vi.fn(async () => ({
		phase: "restart-required" as const,
		codexAvailable: true,
		installed: true,
		installedVersion: "1.1.0",
	})),
}));

vi.mock("@/hooks/use-codex-plugin-update", () => ({
	useCodexPluginUpdate: () => ({
		state: {
			phase: "available",
			codexAvailable: true,
			installed: true,
			installedVersion: "1.0.0",
			latestVersion: "1.1.0",
		},
		installUpdate: mocks.installUpdate,
	}),
}));

import { CodexPluginUpdateNotification } from "../codex-plugin-update-notification";

beforeEach(() => {
	vi.clearAllMocks();
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
});
