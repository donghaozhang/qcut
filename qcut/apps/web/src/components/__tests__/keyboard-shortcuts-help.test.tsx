import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import {
	KeyboardShortcutsDialog,
	OPEN_KEYBOARD_SHORTCUTS_EVENT,
} from "../keyboard-shortcuts-help";

function openKeyboardShortcutsDialog() {
	act(() => {
		window.dispatchEvent(new CustomEvent(OPEN_KEYBOARD_SHORTCUTS_EVENT));
	});
}

describe("KeyboardShortcutsDialog", () => {
	beforeEach(() => {
		useKeybindingsStore.getState().resetToDefaults();
		useKeybindingsStore.getState().setIsRecording(false);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("opens when the native menu dispatches its event", () => {
		render(<KeyboardShortcutsDialog />);

		expect(
			screen.queryByTestId("keyboard-shortcuts-dialog")
		).not.toBeInTheDocument();
		openKeyboardShortcutsDialog();
		expect(screen.getByTestId("keyboard-shortcuts-dialog")).toBeTruthy();
	});

	it("keeps edits in a draft until the user saves", () => {
		render(<KeyboardShortcutsDialog />);
		openKeyboardShortcutsDialog();

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

	it("stops recording when cancel closes the dialog", () => {
		render(<KeyboardShortcutsDialog />);
		openKeyboardShortcutsDialog();
		fireEvent.click(screen.getByTestId("shortcut-record-reverse-selected"));

		expect(useKeybindingsStore.getState().isRecording).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "取消" }));

		expect(useKeybindingsStore.getState().isRecording).toBe(false);
		expect(
			screen.queryByTestId("keyboard-shortcuts-dialog")
		).not.toBeInTheDocument();
	});

	it("defers export URL cleanup until after the download starts", () => {
		vi.useFakeTimers();
		const createObjectUrl = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:qcut-shortcuts");
		const revokeObjectUrl = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => {});

		render(<KeyboardShortcutsDialog />);
		openKeyboardShortcutsDialog();
		fireEvent.click(screen.getByRole("button", { name: "导出" }));

		expect(createObjectUrl).toHaveBeenCalledOnce();
		expect(revokeObjectUrl).not.toHaveBeenCalled();
		act(() => vi.runAllTimers());
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:qcut-shortcuts");
	});
});
