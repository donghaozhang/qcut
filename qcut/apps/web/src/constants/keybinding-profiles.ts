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
	m: "toggle-bookmark",
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
			a: "edit-mode-select",
			n: "toggle-snapping",
			p: "toggle-main-track-magnet",
			"`": "toggle-linked-ripple",
			"[": "trim-start-to-playhead",
			"]": "trim-end-to-playhead",
			"ctrl+shift+c": "copy-attributes-selected",
			"ctrl+shift+v": "paste-attributes-selected",
			"ctrl+d": "duplicate-selected",
			"ctrl+y": "redo",
			f: "freeze-selected",
			v: "toggle-element-enabled",
			"ctrl+shift+s": "separate-audio-selected",
			"ctrl+g": "group-selected",
			"ctrl+shift+g": "ungroup-selected",
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
			"ctrl+g": "group-selected",
			"ctrl+shift+g": "ungroup-selected",
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
			a: "edit-mode-select",
			n: "toggle-snapping",
			p: "toggle-main-track-magnet",
			"`": "toggle-linked-ripple",
			home: "goto-start",
			end: "goto-end",
			v: "toggle-element-enabled",
			"ctrl+g": "group-selected",
			"ctrl+shift+g": "ungroup-selected",
			// Jianying parity. Its own trim keys are Q/W; "[" and "]" stay bound
			// so nobody's muscle memory breaks.
			q: "trim-start-to-playhead",
			w: "trim-end-to-playhead",
			// 轨道放大/缩小. A US layout sends ⌘+ as ctrl+shift+=, so both forms
			// are bound; the bare -/= aliases stay for every profile.
			"ctrl+=": "zoom-timeline-in",
			"ctrl+shift+=": "zoom-timeline-in",
			"ctrl+-": "zoom-timeline-out",
			"alt+shift+k": "add-keyframe",
			"ctrl+shift+c": "copy-attributes-selected",
			"ctrl+shift+v": "paste-attributes-selected",
			"alt+shift+=": "player-zoom-in",
			"alt+shift+-": "player-zoom-out",
			"alt+shift+z": "player-zoom-fit",
			// Jianying uses a real Control chord here, which this key layer
			// cannot express, so the ⌘ form matches the qcut profile instead.
			"ctrl+shift+s": "separate-audio-selected",
			// JKL transport. QCut seeks a fixed step rather than shuttling.
			j: "seek-backward",
			k: "toggle-play",
			l: "seek-forward",
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
