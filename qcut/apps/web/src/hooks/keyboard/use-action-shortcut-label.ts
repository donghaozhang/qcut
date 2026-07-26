"use client";

import { useMemo } from "react";
import type { Action } from "@/constants/actions";
import { formatShortcutKey } from "@/hooks/keyboard/use-keyboard-shortcuts-help";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import type { ShortcutKey } from "@/types/keybinding";

/**
 * Formatted shortcut hints for the currently active keybindings.
 *
 * Returns a function that appends the first bound key for an action to a
 * tooltip label — e.g. `withShortcut("Split element", "split-element")` →
 * `"Split element (S)"` — or returns the label unchanged when the action is
 * unbound. Tooltips derived this way can never drift from the real bindings.
 */
export function useActionShortcutLabels() {
	const keybindings = useKeybindingsStore((state) => state.keybindings);

	return useMemo(() => {
		const firstKeyByAction = new Map<Action, string>();
		for (const [key, action] of Object.entries(keybindings) as Array<
			[ShortcutKey, Action]
		>) {
			if (!action || firstKeyByAction.has(action)) continue;
			firstKeyByAction.set(action, formatShortcutKey({ key }));
		}
		const shortcutFor = (action: Action): string | null =>
			firstKeyByAction.get(action) ?? null;
		const withShortcut = (label: string, action: Action): string => {
			const key = shortcutFor(action);
			return key ? `${label} (${key})` : label;
		};
		return { shortcutFor, withShortcut };
	}, [keybindings]);
}
