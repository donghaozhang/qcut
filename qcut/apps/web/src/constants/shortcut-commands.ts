import type { Action } from "./actions";
import type { TranslationKey } from "@/lib/i18n";

export const SHORTCUT_CATEGORIES = [
	"timeline",
	"player",
	"basic",
	"other",
] as const;

export type ShortcutCategory = (typeof SHORTCUT_CATEGORIES)[number];

export interface ShortcutCommandDefinition {
	category: ShortcutCategory;
	labelKey: TranslationKey;
}

export const SHORTCUT_CATEGORY_LABELS: Record<
	ShortcutCategory,
	TranslationKey
> = {
	timeline: "shortcuts.category.timeline",
	player: "shortcuts.category.player",
	basic: "shortcuts.category.basic",
	other: "shortcuts.category.other",
};

export const SHORTCUT_COMMANDS: Record<Action, ShortcutCommandDefinition> = {
	"toggle-play": {
		category: "player",
		labelKey: "shortcuts.action.togglePlay",
	},
	"stop-playback": {
		category: "player",
		labelKey: "shortcuts.action.stopPlayback",
	},
	"seek-forward": {
		category: "player",
		labelKey: "shortcuts.action.seekForward",
	},
	"seek-backward": {
		category: "player",
		labelKey: "shortcuts.action.seekBackward",
	},
	"frame-step-forward": {
		category: "player",
		labelKey: "shortcuts.action.frameForward",
	},
	"frame-step-backward": {
		category: "player",
		labelKey: "shortcuts.action.frameBackward",
	},
	"jump-forward": {
		category: "player",
		labelKey: "shortcuts.action.jumpForward",
	},
	"jump-backward": {
		category: "player",
		labelKey: "shortcuts.action.jumpBackward",
	},
	"goto-start": {
		category: "player",
		labelKey: "shortcuts.action.gotoStart",
	},
	"goto-end": {
		category: "player",
		labelKey: "shortcuts.action.gotoEnd",
	},
	"split-element": {
		category: "timeline",
		labelKey: "shortcuts.action.split",
	},
	"delete-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.delete",
	},
	"trim-start-to-playhead": {
		category: "timeline",
		labelKey: "shortcuts.action.trimStart",
	},
	"trim-end-to-playhead": {
		category: "timeline",
		labelKey: "shortcuts.action.trimEnd",
	},
	"zoom-timeline-in": {
		category: "timeline",
		labelKey: "shortcuts.action.zoomIn",
	},
	"zoom-timeline-out": {
		category: "timeline",
		labelKey: "shortcuts.action.zoomOut",
	},
	"add-keyframe": {
		category: "timeline",
		labelKey: "shortcuts.action.addKeyframe",
	},
	"keyframe-ease-in": {
		category: "timeline",
		labelKey: "shortcuts.action.easeIn",
	},
	"keyframe-ease-out": {
		category: "timeline",
		labelKey: "shortcuts.action.easeOut",
	},
	"keyframe-linear": {
		category: "timeline",
		labelKey: "shortcuts.action.linear",
	},
	"edit-keyframe-value": {
		category: "timeline",
		labelKey: "shortcuts.action.editValue",
	},
	"reverse-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.reverse",
	},
	"mirror-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.mirror",
	},
	"rotate-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.rotate",
	},
	"crop-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.crop",
	},
	"toggle-snapping": {
		category: "timeline",
		labelKey: "shortcuts.action.snapping",
	},
	"select-all": {
		category: "basic",
		labelKey: "shortcuts.action.selectAll",
	},
	"duplicate-selected": {
		category: "basic",
		labelKey: "shortcuts.action.duplicate",
	},
	"copy-selected": {
		category: "basic",
		labelKey: "shortcuts.action.copy",
	},
	"cut-selected": {
		category: "basic",
		labelKey: "shortcuts.action.cut",
	},
	"paste-clipboard": {
		category: "basic",
		labelKey: "shortcuts.action.paste",
	},
	"copy-attributes-selected": {
		category: "basic",
		labelKey: "shortcuts.action.copyAttributes",
	},
	"paste-attributes-selected": {
		category: "basic",
		labelKey: "shortcuts.action.pasteAttributes",
	},
	"freeze-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.freeze",
	},
	"separate-audio-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.separateAudio",
	},
	"toggle-bookmark": {
		category: "timeline",
		labelKey: "shortcuts.action.toggleBookmark",
	},
	"toggle-element-enabled": {
		category: "timeline",
		labelKey: "shortcuts.action.toggleEnabled",
	},
	"group-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.group",
	},
	"ungroup-selected": {
		category: "timeline",
		labelKey: "shortcuts.action.ungroup",
	},
	"toggle-safe-areas": {
		category: "player",
		labelKey: "shortcuts.action.safeAreas",
	},
	"player-zoom-in": {
		category: "player",
		labelKey: "shortcuts.action.playerZoomIn",
	},
	"player-zoom-out": {
		category: "player",
		labelKey: "shortcuts.action.playerZoomOut",
	},
	"player-zoom-fit": {
		category: "player",
		labelKey: "shortcuts.action.playerZoomFit",
	},
	undo: {
		category: "basic",
		labelKey: "shortcuts.action.undo",
	},
	redo: {
		category: "basic",
		labelKey: "shortcuts.action.redo",
	},
	"apply-brightness-effect": {
		category: "other",
		labelKey: "shortcuts.action.brightness",
	},
	"apply-contrast-effect": {
		category: "other",
		labelKey: "shortcuts.action.contrast",
	},
	"apply-saturation-effect": {
		category: "other",
		labelKey: "shortcuts.action.saturation",
	},
	"apply-blur-effect": {
		category: "other",
		labelKey: "shortcuts.action.blur",
	},
	"toggle-selected-effect": {
		category: "other",
		labelKey: "shortcuts.action.toggleEffect",
	},
	"reset-effect-parameters": {
		category: "other",
		labelKey: "shortcuts.action.resetEffect",
	},
	"duplicate-effect": {
		category: "other",
		labelKey: "shortcuts.action.duplicateEffect",
	},
	"increase-effect-intensity": {
		category: "other",
		labelKey: "shortcuts.action.increaseEffect",
	},
	"decrease-effect-intensity": {
		category: "other",
		labelKey: "shortcuts.action.decreaseEffect",
	},
};
