import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import { KeyboardShortcutsHelp } from "../keyboard-shortcuts-help";

describe("KeyboardShortcutsHelp", () => {
	beforeEach(() => {
		useKeybindingsStore.getState().resetToDefaults();
		useKeybindingsStore.getState().setIsRecording(false);
	});

	it("keeps edits in a draft until the user saves", () => {
		render(<KeyboardShortcutsHelp />);
		fireEvent.click(screen.getByRole("button", { name: "快捷键" }));

		expect(screen.getByTestId("keyboard-shortcuts-dialog")).toBeTruthy();
		expect(screen.getByRole("tab", { name: "时间线" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "播放器" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "基础" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "其他" })).toBeTruthy();

		fireEvent.click(screen.getByTestId("shortcut-record-reverse-selected"));
		fireEvent.keyDown(document, { key: "b", code: "KeyB" });

		expect(useKeybindingsStore.getState().keybindings.b).toBeUndefined();
		fireEvent.click(screen.getByTestId("shortcut-save"));
		expect(useKeybindingsStore.getState().keybindings.b).toBe(
			"reverse-selected"
		);
		expect(useKeybindingsStore.getState().activeProfileId).toBe("custom");
	});
});
