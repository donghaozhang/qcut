import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useKeyboardShortcutsHelp } from "../use-keyboard-shortcuts-help";

describe("useKeyboardShortcutsHelp", () => {
	it("includes unbound commands in their professional categories", () => {
		const { result } = renderHook(() =>
			useKeyboardShortcutsHelp({
				keybindings: { space: "toggle-play" },
			})
		);

		const reverse = result.current.shortcuts.find(
			(shortcut) => shortcut.action === "reverse-selected"
		);
		expect(reverse).toMatchObject({
			category: "timeline",
			keys: [],
		});
		expect(
			result.current.shortcuts.find(
				(shortcut) => shortcut.action === "toggle-play"
			)?.keys
		).toEqual(["Space"]);
	});
});
