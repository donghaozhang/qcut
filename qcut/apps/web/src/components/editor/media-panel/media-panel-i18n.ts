import type { TranslationKey } from "@/lib/i18n";
import type { EditSubgroup, Tab } from "./store";

export const TAB_LABEL_KEYS: Record<Tab, TranslationKey> = {
	media: "tabs.media",
	text: "tabs.text",
	audio: "tabs.audio",
	captions: "tabs.captions",
	stickers: "tabs.stickers",
	"video-edit": "tabs.videoEdit",
	effects: "tabs.effects",
	transitions: "tabs.transitions",
	filters: "tabs.filters",
	adjustments: "tabs.adjustments",
	templates: "tabs.templates",
	text2image: "tabs.text2image",
	"nano-edit": "tabs.nanoEdit",
	ai: "tabs.ai",
	sounds: "tabs.sounds",
	segmentation: "tabs.segmentation",
	remotion: "tabs.remotion",
	hyperframes: "tabs.hyperframes",
	pty: "tabs.pty",
	"word-timeline": "tabs.wordTimeline",
	"project-folder": "tabs.projectFolder",
	upscale: "tabs.upscale",
	moyin: "tabs.moyin",
	"ai-chat": "tabs.aiChat",
	"digital-human": "tabs.digitalHuman",
	search: "tabs.search",
};

export const EDIT_SUBGROUP_LABEL_KEYS: Record<EditSubgroup, TranslationKey> = {
	"ai-edit": "workspace.aiAssist",
	"manual-edit": "workspace.manualEdit",
};
