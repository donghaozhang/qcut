import type { Action } from "@/constants/actions";
import {
	KEYBINDING_PROFILE_IDS,
	type KeybindingProfileId,
} from "@/constants/keybinding-profiles";
import { SHORTCUT_COMMANDS } from "@/constants/shortcut-commands";
import type { ActiveKeybindingProfileId } from "@/stores/editor/keybindings-store";
import type { KeybindingConfig, ShortcutKey } from "@/types/keybinding";

const EXPORT_VERSION = 1;

export interface KeybindingExport {
	version: typeof EXPORT_VERSION;
	profileId: ActiveKeybindingProfileId;
	keybindings: KeybindingConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAction(value: unknown): value is Action {
	return typeof value === "string" && value in SHORTCUT_COMMANDS;
}

function isProfileId(value: unknown): value is KeybindingProfileId {
	return (
		typeof value === "string" &&
		KEYBINDING_PROFILE_IDS.includes(value as KeybindingProfileId)
	);
}

function parseKeybindings({ value }: { value: unknown }): KeybindingConfig {
	if (!isRecord(value)) throw new Error("Keybindings must be an object");
	const entries: Array<[ShortcutKey, Action]> = [];
	for (const [key, action] of Object.entries(value)) {
		if (!key || !isAction(action)) {
			throw new Error(`Invalid keybinding entry: ${key}`);
		}
		entries.push([key as ShortcutKey, action]);
	}
	return Object.fromEntries(entries) as KeybindingConfig;
}

export function createKeybindingExport({
	keybindings,
	profileId,
}: {
	keybindings: KeybindingConfig;
	profileId: ActiveKeybindingProfileId;
}): KeybindingExport {
	return {
		version: EXPORT_VERSION,
		profileId,
		keybindings: { ...keybindings },
	};
}

export function serializeKeybindingExport({
	keybindings,
	profileId,
}: {
	keybindings: KeybindingConfig;
	profileId: ActiveKeybindingProfileId;
}): string {
	return JSON.stringify(
		createKeybindingExport({ keybindings, profileId }),
		null,
		2
	);
}

export function parseKeybindingExport({
	text,
}: {
	text: string;
}): KeybindingExport {
	const parsed: unknown = JSON.parse(text);
	if (!isRecord(parsed)) throw new Error("Shortcut file must be an object");

	if (!("keybindings" in parsed)) {
		return {
			version: EXPORT_VERSION,
			profileId: "custom",
			keybindings: parseKeybindings({ value: parsed }),
		};
	}

	const profileId =
		parsed.profileId === "custom" || isProfileId(parsed.profileId)
			? parsed.profileId
			: "custom";
	return {
		version: EXPORT_VERSION,
		profileId,
		keybindings: parseKeybindings({ value: parsed.keybindings }),
	};
}
