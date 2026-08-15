"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActionWithOptionalArgs } from "@/constants/actions";
import {
	cloneProfileKeybindings,
	DEFAULT_KEYBINDING_PROFILE_ID,
	KEYBINDING_PROFILES,
	type KeybindingProfileId,
} from "@/constants/keybinding-profiles";
import { isAppleDevice, isDOMElement, isTypableElement } from "@/lib/utils";
import type { KeybindingConfig, ShortcutKey } from "@/types/keybinding";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";

// One-time migration: copy opencut-keybindings → qcut-keybindings
if (typeof window !== "undefined") {
	try {
		const OLD_KEY = "opencut-keybindings";
		const NEW_KEY = "qcut-keybindings";
		if (!localStorage.getItem(NEW_KEY)) {
			const legacy = localStorage.getItem(OLD_KEY);
			if (legacy) {
				localStorage.setItem(NEW_KEY, legacy);
				localStorage.removeItem(OLD_KEY);
			}
		}
	} catch (error) {
		// Log migration failure but don't block app startup
		handleError(error, {
			operation: "Migrate keybindings from old storage format",
			category: ErrorCategory.SYSTEM,
			severity: ErrorSeverity.LOW,
			showToast: false, // Don't spam users on startup
		});
		// Continue with default keybindings - app still works!
	}
}

export type ActiveKeybindingProfileId = KeybindingProfileId | "custom";

export const defaultKeybindings = cloneProfileKeybindings({
	id: DEFAULT_KEYBINDING_PROFILE_ID,
});

export interface KeybindingConflict {
	key: ShortcutKey;
	existingAction: ActionWithOptionalArgs;
	newAction: ActionWithOptionalArgs;
}

interface KeybindingsState {
	keybindings: KeybindingConfig;
	activeProfileId: ActiveKeybindingProfileId;
	isCustomized: boolean;
	keybindingsEnabled: boolean;
	isRecording: boolean;

	// Actions
	updateKeybinding: (key: ShortcutKey, action: ActionWithOptionalArgs) => void;
	removeKeybinding: (key: ShortcutKey) => void;
	replaceKeybindings: ({
		keybindings,
		profileId,
	}: {
		keybindings: KeybindingConfig;
		profileId?: ActiveKeybindingProfileId;
	}) => void;
	applyProfile: (profileId: KeybindingProfileId) => void;
	resetToDefaults: () => void;
	importKeybindings: (config: KeybindingConfig) => void;
	exportKeybindings: () => KeybindingConfig;
	enableKeybindings: () => void;
	disableKeybindings: () => void;
	setIsRecording: (isRecording: boolean) => void;

	// Validation
	validateKeybinding: (
		key: ShortcutKey,
		action: ActionWithOptionalArgs
	) => KeybindingConflict | null;
	getKeybindingsForAction: (action: ActionWithOptionalArgs) => ShortcutKey[];

	// Utility
	getKeybindingString: (ev: KeyboardEvent) => ShortcutKey | null;
}

export function migrateKeybindingsState({
	persistedState,
	version,
}: {
	persistedState: unknown;
	version: number;
}) {
	const state = persistedState as Partial<KeybindingsState>;
	const versionTwoState =
		version >= 2
			? state
			: {
					...state,
					keybindings: {
						"ctrl+c": "copy-selected",
						"ctrl+x": "cut-selected",
						"ctrl+v": "paste-clipboard",
						"ctrl+shift+c": "copy-attributes-selected",
						"ctrl+shift+v": "paste-attributes-selected",
						...state.keybindings,
					},
				};
	const versionThreeState =
		version >= 3
			? versionTwoState
			: {
					...versionTwoState,
					activeProfileId: versionTwoState.isCustomized
						? "custom"
						: DEFAULT_KEYBINDING_PROFILE_ID,
				};
	if (version >= 7) return versionThreeState;
	// v4-v7 all re-derive non-customized profiles so users pick up new
	// default bindings (v5 added freeze/bookmark/group/enable actions, v6
	// added the main-track magnet and linked-ripple toggles, v7 added the
	// select-tool binding).
	const activeProfileId =
		versionThreeState.activeProfileId ?? DEFAULT_KEYBINDING_PROFILE_ID;
	const activeProfile = KEYBINDING_PROFILES.find(
		(profile) => profile.id === activeProfileId
	);
	if (versionThreeState.isCustomized || !activeProfile) {
		return versionThreeState;
	}
	return {
		...versionThreeState,
		keybindings: cloneProfileKeybindings({ id: activeProfile.id }),
	};
}

export const useKeybindingsStore = create<KeybindingsState>()(
	persist(
		(set, get) => ({
			keybindings: { ...defaultKeybindings },
			activeProfileId: DEFAULT_KEYBINDING_PROFILE_ID,
			isCustomized: false,
			keybindingsEnabled: true,
			isRecording: false,

			updateKeybinding: (key: ShortcutKey, action: ActionWithOptionalArgs) => {
				set((state) => {
					const newKeybindings = { ...state.keybindings };
					newKeybindings[key] = action;

					return {
						keybindings: newKeybindings,
						activeProfileId: "custom",
						isCustomized: true,
					};
				});
			},

			removeKeybinding: (key: ShortcutKey) => {
				set((state) => {
					const newKeybindings = Object.fromEntries(
						Object.entries(state.keybindings).filter(
							([candidate]) => candidate !== key
						)
					) as KeybindingConfig;

					return {
						keybindings: newKeybindings,
						activeProfileId: "custom",
						isCustomized: true,
					};
				});
			},

			replaceKeybindings: ({ keybindings, profileId = "custom" }) => {
				validateImportedKeybindings({ keybindings });
				set({
					keybindings: { ...keybindings },
					activeProfileId: profileId,
					isCustomized: profileId === "custom",
				});
			},

			applyProfile: (profileId) => {
				set({
					keybindings: cloneProfileKeybindings({ id: profileId }),
					activeProfileId: profileId,
					isCustomized: false,
				});
			},

			resetToDefaults: () => {
				set({
					keybindings: { ...defaultKeybindings },
					activeProfileId: DEFAULT_KEYBINDING_PROFILE_ID,
					isCustomized: false,
				});
			},

			enableKeybindings: () => {
				set({ keybindingsEnabled: true });
			},

			disableKeybindings: () => {
				set({ keybindingsEnabled: false });
			},

			importKeybindings: (config: KeybindingConfig) => {
				validateImportedKeybindings({ keybindings: config });
				set({
					keybindings: { ...config },
					activeProfileId: "custom",
					isCustomized: true,
				});
			},

			exportKeybindings: () => {
				return get().keybindings;
			},

			validateKeybinding: (
				key: ShortcutKey,
				action: ActionWithOptionalArgs
			) => {
				const { keybindings } = get();
				const existingAction = keybindings[key];

				if (existingAction && existingAction !== action) {
					return {
						key,
						existingAction,
						newAction: action,
					};
				}

				return null;
			},
			setIsRecording: (isRecording: boolean) => {
				set({ isRecording });
			},

			getKeybindingsForAction: (action: ActionWithOptionalArgs) => {
				const { keybindings } = get();
				return Object.keys(keybindings).filter(
					(key) => keybindings[key as ShortcutKey] === action
				) as ShortcutKey[];
			},

			getKeybindingString: (ev: KeyboardEvent) => {
				return generateKeybindingString(ev) as ShortcutKey | null;
			},
		}),
		{
			name: "qcut-keybindings",
			version: 7,
			migrate: (persistedState, version) =>
				migrateKeybindingsState({ persistedState, version }),
		}
	)
);

// Utility functions
export function generateKeybindingString(
	ev: KeyboardEvent
): ShortcutKey | null {
	const target = ev.target;

	// We may or may not have a modifier key
	const modifierKey = getActiveModifier(ev);

	// We will always have a non-modifier key
	const key = getPressedKey(ev);
	if (!key) return null;

	// All key combos backed by modifiers are valid shortcuts (whether currently typing or not)
	if (modifierKey) {
		// If the modifier is shift and the target is an input, we ignore
		if (
			modifierKey === "shift" &&
			isDOMElement(target) &&
			isTypableElement(target)
		) {
			return null;
		}

		return `${modifierKey}+${key}` as ShortcutKey;
	}

	// no modifier key here then we do not do anything while on input
	if (isDOMElement(target) && isTypableElement(target)) return null;

	// single key while not input
	return `${key}` as ShortcutKey;
}

function getPressedKey(ev: KeyboardEvent): string | null {
	// Sometimes the property code is not available on the KeyboardEvent object
	const key = (ev.key ?? "").toLowerCase();
	const code = ev.code ?? "";

	// Check arrow keys
	if (key.startsWith("arrow")) {
		return key.slice(5);
	}

	// Check for special keys
	if (key === "tab") return "tab";
	if (key === " " || key === "space") return "space";
	if (key === "home") return "home";
	if (key === "end") return "end";
	if (key === "delete") return "delete";
	if (key === "backspace") return "backspace";
	if (key === "escape" || key === "esc") return "escape";

	// Check letter keys
	if (code.startsWith("Key")) {
		const letter = code.slice(3).toLowerCase();
		if (letter.length === 1 && letter >= "a" && letter <= "z") {
			return letter;
		}
	}

	// Check number keys using physical position for AZERTY support
	if (code.startsWith("Digit")) {
		const digit = code.slice(5);
		if (digit.length === 1 && digit >= "0" && digit <= "9") {
			return digit;
		}
	}

	// Fallback for other layouts
	const isDigit = key.length === 1 && key >= "0" && key <= "9";
	if (isDigit) return key;

	const punctuationByCode: Record<string, string> = {
		BracketLeft: "[",
		BracketRight: "]",
		Comma: ",",
		Period: ".",
		Minus: "-",
		Equal: "=",
		Slash: "/",
		Backquote: "`",
	};
	const punctuation = punctuationByCode[code];
	if (punctuation) return punctuation;

	if (["/", ".", ",", "[", "]", "-", "=", "`", "enter"].includes(key)) {
		return key;
	}

	// If no other cases match, this is not a valid key
	return null;
}

function getActiveModifier(ev: KeyboardEvent): string | null {
	const modifierKeys = {
		ctrl: isAppleDevice() ? ev.metaKey : ev.ctrlKey,
		alt: ev.altKey,
		shift: ev.shiftKey,
	};

	// active modifier: ctrl | alt | ctrl+alt | ctrl+shift | ctrl+alt+shift | alt+shift
	// modiferKeys object's keys are sorted to match the above order
	const activeModifier = Object.keys(modifierKeys)
		.filter((key) => modifierKeys[key as keyof typeof modifierKeys])
		.join("+");

	return activeModifier === "" ? null : activeModifier;
}

function validateImportedKeybindings({
	keybindings,
}: {
	keybindings: KeybindingConfig;
}): void {
	for (const [key, action] of Object.entries(keybindings)) {
		if (typeof key !== "string" || key.length === 0) {
			throw new Error(`Invalid key format: ${key}`);
		}
		if (typeof action !== "string" || action.length === 0) {
			throw new Error(`Invalid action for key: ${key}`);
		}
	}
}
