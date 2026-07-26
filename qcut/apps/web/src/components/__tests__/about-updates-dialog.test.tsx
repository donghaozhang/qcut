import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/test-utils";
import { useLocaleStore } from "@/stores/locale-store";

vi.mock("@/components/editor/properties-panel/update-settings-section", () => ({
	UpdateSettingsSection: () => <div data-testid="app-update-controls" />,
}));

vi.mock(
	"@/components/editor/properties-panel/codex-plugin-update-section",
	() => ({
		CodexPluginUpdateSection: () => (
			<div data-testid="plugin-update-controls" />
		),
	})
);

import { AboutUpdatesDialog } from "../about-updates-dialog";

beforeEach(() => {
	useLocaleStore.getState().setLocale({ locale: "en" });
});

describe("AboutUpdatesDialog", () => {
	it("shows app and plugin update controls", () => {
		render(<AboutUpdatesDialog open onOpenChange={vi.fn()} />);

		expect(screen.getByRole("heading", { name: "QCut" })).toBeInTheDocument();
		expect(screen.getByText("About & updates")).toBeInTheDocument();
		expect(screen.getByTestId("app-update-controls")).toBeInTheDocument();
		expect(screen.getByTestId("plugin-update-controls")).toBeInTheDocument();
	});

	it("can be closed from the dialog close button", () => {
		const onOpenChange = vi.fn();
		render(<AboutUpdatesDialog open onOpenChange={onOpenChange} />);

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
