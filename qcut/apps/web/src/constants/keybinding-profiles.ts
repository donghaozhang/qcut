import type { KeybindingConfig } from "@/types/keybinding";

export const KEYBINDING_PROFILE_IDS = [
	"qcut",
	"final-cut-pro",
	"premiere-pro",
	"capcut",
] as const;

export type KeybindingProfileId = (typeof KEYBINDING_PROFILE_IDS)[number];

export interface KeybindingProfile {
	id: KeybindingProfileId;
	name: string;
	keybindings: KeybindingConfig;
}

const SHARED_EDIT_BINDINGS: KeybindingConfig = {
	space: "toggle-play",
	",": "frame-step-backward",
	".": "frame-step-forward",
	"-": "zoom-timeline-out",
	"=": "zoom-timeline-in",
	delete: "delete-selected",
	backspace: "delete-selected",
	"ctrl+a": "select-all",
	"ctrl+c": "copy-selected",
	"ctrl+x": "cut-selected",
	"ctrl+v": "paste-clipboard",
	"ctrl+z": "undo",
	"ctrl+shift+z": "redo",
};

const PROFESSIONAL_TOOL_BINDINGS: KeybindingConfig = {
	r: "reverse-selected",
	h: "mirror-selected",
	"ctrl+r": "rotate-selected",
	"alt+c": "crop-selected",
	"alt+k": "add-keyframe",
	"alt+i": "keyframe-ease-in",
	"alt+o": "keyframe-ease-out",
	"alt+l": "keyframe-linear",
	"alt+v": "edit-keyframe-value",
};

export const KEYBINDING_PROFILES: KeybindingProfile[] = [
	{
		id: "qcut",
		name: "QCut Default",
		keybindings: {
			...SHARED_EDIT_BINDINGS,
			...PROFESSIONAL_TOOL_BINDINGS,
			c: "crop-selected",
			j: "seek-backward",
			k: "toggle-play",
			l: "seek-forward",
			left: "frame-step-backward",
			right: "frame-step-forward",
			"shift+left": "jump-backward",
			"shift+right": "jump-forward",
			home: "goto-start",
			end: "goto-end",
			s: "split-element",
			n: "toggle-snapping",
			"[": "trim-start-to-playhead",
			"]": "trim-end-to-playhead",
			"ctrl+shift+c": "copy-attributes-selected",
			"ctrl+shift+v": "paste-attributes-selected",
			"ctrl+d": "duplicate-selected",
			"ctrl+y": "redo",
		},
	},
	{
		id: "final-cut-pro",
		name: "Final Cut Pro",
		keybindings: {
			...SHARED_EDIT_BINDINGS,
			...PROFESSIONAL_TOOL_BINDINGS,
			j: "seek-backward",
			k: "toggle-play",
			l: "seek-forward",
			q: "trim-start-to-playhead",
			w: "trim-end-to-playhead",
			"ctrl+b": "split-element",
			n: "toggle-snapping",
			home: "goto-start",
			end: "goto-end",
		},
	},
	{
		id: "premiere-pro",
		name: "Adobe Premiere Pro",
		keybindings: {
			...SHARED_EDIT_BINDINGS,
			...PROFESSIONAL_TOOL_BINDINGS,
			j: "seek-backward",
			k: "toggle-play",
			l: "seek-forward",
			q: "trim-start-to-playhead",
			w: "trim-end-to-playhead",
			"ctrl+k": "split-element",
			s: "toggle-snapping",
			home: "goto-start",
			end: "goto-end",
		},
	},
	{
		id: "capcut",
		name: "CapCut",
		keybindings: {
			...SHARED_EDIT_BINDINGS,
			...PROFESSIONAL_TOOL_BINDINGS,
			c: "crop-selected",
			"ctrl+b": "split-element",
			"[": "trim-start-to-playhead",
			"]": "trim-end-to-playhead",
			left: "frame-step-backward",
			right: "frame-step-forward",
			"shift+left": "jump-backward",
			"shift+right": "jump-forward",
			n: "toggle-snapping",
			home: "goto-start",
			end: "goto-end",
		},
	},
];

export const DEFAULT_KEYBINDING_PROFILE_ID: KeybindingProfileId = "qcut";

export function getKeybindingProfile({
	id,
}: {
	id: KeybindingProfileId;
}): KeybindingProfile {
	const profile = KEYBINDING_PROFILES.find((candidate) => candidate.id === id);
	if (!profile) throw new Error(`Unknown keybinding profile: ${id}`);
	return profile;
}

export function cloneProfileKeybindings({
	id,
}: {
	id: KeybindingProfileId;
}): KeybindingConfig {
	return { ...getKeybindingProfile({ id }).keybindings };
}
