"use client";

import { useMemo } from "react";
import type { Action } from "@/constants/actions";
import {
	SHORTCUT_CATEGORIES,
	SHORTCUT_CATEGORY_LABELS,
	SHORTCUT_COMMANDS,
	type ShortcutCategory,
} from "@/constants/shortcut-commands";
import { useTranslation } from "@/lib/i18n";
import { getPlatformAlternateKey, getPlatformSpecialKey } from "@/lib/utils";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import type { KeybindingConfig } from "@/types/keybinding";

export interface KeyboardShortcut {
	id: string;
	keys: string[];
	description: string;
	category: ShortcutCategory;
	categoryLabel: string;
	action: Action;
}

export function formatShortcutKey({ key }: { key: string }): string {
	return key
		.split("+")
		.map((part) => {
			const displayNames: Record<string, string> = {
				ctrl: getPlatformSpecialKey(),
				alt: getPlatformAlternateKey(),
				shift: "Shift",
				left: "←",
				right: "→",
				up: "↑",
				down: "↓",
				space: "Space",
				home: "Home",
				end: "End",
				delete: "Delete",
				backspace: "Backspace",
				escape: "Esc",
				// Match the keycap legend most editors print for this key.
				"`": "~",
			};
			return displayNames[part] ?? part.toUpperCase();
		})
		.join("+");
}

export function useKeyboardShortcutsHelp({
	keybindings: keybindingsOverride,
}: {
	keybindings?: KeybindingConfig;
} = {}) {
	const storedKeybindings = useKeybindingsStore((state) => state.keybindings);
	const { t } = useTranslation();
	const keybindings = keybindingsOverride ?? storedKeybindings;

	const shortcuts = useMemo(() => {
		const actionToKeys = new Map<Action, string[]>();
		for (const [key, action] of Object.entries(keybindings)) {
			if (!action) continue;
			const keys = actionToKeys.get(action) ?? [];
			keys.push(formatShortcutKey({ key }));
			actionToKeys.set(action, keys);
		}

		return (
			Object.entries(SHORTCUT_COMMANDS) as Array<
				[Action, (typeof SHORTCUT_COMMANDS)[Action]]
			>
		)
			.map(([action, definition]) => ({
				id: action,
				keys: actionToKeys.get(action) ?? [],
				description: t(definition.labelKey),
				category: definition.category,
				categoryLabel: t(SHORTCUT_CATEGORY_LABELS[definition.category]),
				action,
			}))
			.sort((left, right) => {
				const categoryDifference =
					SHORTCUT_CATEGORIES.indexOf(left.category) -
					SHORTCUT_CATEGORIES.indexOf(right.category);
				return (
					categoryDifference ||
					left.description.localeCompare(right.description)
				);
			});
	}, [keybindings, t]);

	return { shortcuts };
}
