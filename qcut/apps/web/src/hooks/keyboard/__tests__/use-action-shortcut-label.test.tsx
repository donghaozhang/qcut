import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import { useActionShortcutLabels } from "../use-action-shortcut-label";

describe("useActionShortcutLabels", () => {
	beforeEach(() => {
		useKeybindingsStore.getState().resetToDefaults();
	});

	it("derives tooltip hints from the active keybindings", () => {
		const { result } = renderHook(() => useActionShortcutLabels());

		expect(result.current.withShortcut("Split element", "split-element")).toBe(
			"Split element (S)"
		);
		expect(
			result.current.withShortcut("Duplicate clip", "duplicate-selected")
		).toMatch(/^Duplicate clip \(.*D\)$/);
	});

	it("returns the plain label for unbound actions", () => {
		useKeybindingsStore.getState().replaceKeybindings({ keybindings: {} });
		const { result } = renderHook(() => useActionShortcutLabels());

		expect(result.current.withShortcut("Freeze frame", "freeze-selected")).toBe(
			"Freeze frame"
		);
		expect(result.current.shortcutFor("freeze-selected")).toBeNull();
	});

	it("tracks binding changes", () => {
		const { result, rerender } = renderHook(() => useActionShortcutLabels());
		expect(result.current.shortcutFor("freeze-selected")).toBe("F");

		useKeybindingsStore.getState().removeKeybinding("f");
		rerender();
		expect(result.current.shortcutFor("freeze-selected")).toBeNull();
	});
});
