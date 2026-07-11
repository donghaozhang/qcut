"use client";

import { useMemo } from "react";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import { Action } from "@/constants/actions";
import { getPlatformAlternateKey, getPlatformSpecialKey } from "@/lib/utils";

export interface KeyboardShortcut {
	id: string;
	keys: string[];
	description: string;
	category: string;
	action: Action;
	icon?: React.ReactNode;
}

// Map actions to their descriptions and categories
const actionDescriptions: Record<
	Action,
	{ description: string; category: string }
> = {
	"toggle-play": { description: "Play/Pause", category: "Playback" },
	"stop-playback": { description: "Stop playback", category: "Playback" },
	"seek-forward": {
		description: "Seek forward 1 second",
		category: "Playback",
	},
	"seek-backward": {
		description: "Seek backward 1 second",
		category: "Playback",
	},
	"frame-step-forward": {
		description: "Frame step forward",
		category: "Navigation",
	},
	"frame-step-backward": {
		description: "Frame step backward",
		category: "Navigation",
	},
	"jump-forward": {
		description: "Jump forward 5 seconds",
		category: "Navigation",
	},
	"jump-backward": {
		description: "Jump backward 5 seconds",
		category: "Navigation",
	},
	"goto-start": { description: "Go to timeline start", category: "Navigation" },
	"goto-end": { description: "Go to timeline end", category: "Navigation" },
	"split-element": {
		description: "Split element at playhead",
		category: "Editing",
	},
	"delete-selected": {
		description: "Delete selected elements",
		category: "Editing",
	},
	"select-all": { description: "Select all elements", category: "Selection" },
	"duplicate-selected": {
		description: "Duplicate selected element",
		category: "Selection",
	},
	"copy-selected": {
		description: "Copy selected element",
		category: "Editing",
	},
	"cut-selected": {
		description: "Cut selected element",
		category: "Editing",
	},
	"paste-clipboard": {
		description: "Paste element at playhead",
		category: "Editing",
	},
	"copy-attributes-selected": {
		description: "Copy selected clip attributes",
		category: "Editing",
	},
	"paste-attributes-selected": {
		description: "Paste clip attributes",
		category: "Editing",
	},
	"toggle-snapping": { description: "Toggle snapping", category: "Editing" },
	undo: { description: "Undo", category: "History" },
	redo: { description: "Redo", category: "History" },
	// Effects actions
	"apply-brightness-effect": {
		description: "Apply brightness effect",
		category: "Effects",
	},
	"apply-contrast-effect": {
		description: "Apply contrast effect",
		category: "Effects",
	},
	"apply-saturation-effect": {
		description: "Apply saturation effect",
		category: "Effects",
	},
	"apply-blur-effect": {
		description: "Apply blur effect",
		category: "Effects",
	},
	"toggle-selected-effect": {
		description: "Toggle selected effect",
		category: "Effects",
	},
	"reset-effect-parameters": {
		description: "Reset effect parameters",
		category: "Effects",
	},
	"duplicate-effect": { description: "Duplicate effect", category: "Effects" },
	"increase-effect-intensity": {
		description: "Increase effect intensity",
		category: "Effects",
	},
	"decrease-effect-intensity": {
		description: "Decrease effect intensity",
		category: "Effects",
	},
};

// Convert key binding format to display format
const formatKey = (key: string): string => {
	return key
		.replace("ctrl", getPlatformSpecialKey())
		.replace("alt", getPlatformAlternateKey())
		.replace("shift", "Shift")
		.replace("left", "←")
		.replace("right", "→")
		.replace("up", "↑")
		.replace("down", "↓")
		.replace("space", "Space")
		.replace("home", "Home")
		.replace("end", "End")
		.replace("delete", "Delete")
		.replace("backspace", "Backspace")
		.replace("-", "+");
};

export const useKeyboardShortcutsHelp = () => {
	const { keybindings } = useKeybindingsStore();

	const shortcuts = useMemo(() => {
		const result: KeyboardShortcut[] = [];

		// Group keybindings by action
		const actionToKeys: Record<Action, string[]> = {} as any;

		Object.entries(keybindings).forEach(([key, action]) => {
			if (action) {
				if (!actionToKeys[action]) {
					actionToKeys[action] = [];
				}
				actionToKeys[action].push(formatKey(key));
			}
		});

		// Convert to shortcuts format
		Object.entries(actionToKeys).forEach(([action, keys]) => {
			const actionInfo = actionDescriptions[action as Action];
			if (actionInfo) {
				result.push({
					id: action,
					keys,
					description: actionInfo.description,
					category: actionInfo.category,
					action: action as Action,
				});
			}
		});

		// Sort shortcuts by category first, then by description to ensure consistent ordering
		return result.sort((a, b) => {
			if (a.category !== b.category) {
				return a.category.localeCompare(b.category);
			}
			return a.description.localeCompare(b.description);
		});
	}, [keybindings]);

	return {
		shortcuts,
	};
};
