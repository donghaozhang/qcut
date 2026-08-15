import {
	ArrowLeftRightIcon,
	SparklesIcon,
	StickerIcon,
	VideoIcon,
	BlendIcon,
	LucideIcon,
	TypeIcon,
	WandIcon,
	BotIcon,
	VolumeXIcon,
	PaletteIcon,
	Wand2Icon,
	ScissorsIcon,
	Layers,
	SquareTerminalIcon,
	MessageSquareIcon,
	TextSelect,
	FolderSync,
	FolderOpenIcon,
	WrenchIcon,
	ArrowUpFromLineIcon,
	ClapperboardIcon,
	SearchIcon,
	AudioLinesIcon,
	CaptionsIcon,
	LayoutTemplateIcon,
	SlidersHorizontalIcon,
	CodeXmlIcon,
	UserSquareIcon,
} from "lucide-react";
import { create } from "zustand";
import type { AudioLibrarySectionId } from "@/lib/audio/audio-library-catalog";

export type Tab =
	| "media"
	| "text"
	| "audio"
	| "captions"
	| "stickers"
	| "video-edit"
	| "effects"
	| "transitions"
	| "filters"
	| "adjustments"
	| "templates"
	| "text2image"
	| "nano-edit"
	| "ai"
	| "sounds"
	| "segmentation"
	| "remotion"
	| "hyperframes"
	| "pty"
	| "word-timeline"
	| "project-folder"
	| "upscale"
	| "moyin"
	| "ai-chat"
	| "digital-human"
	| "search";

export const tabs: { [key in Tab]: { icon: LucideIcon; label: string } } = {
	media: {
		icon: VideoIcon,
		label: "素材",
	},
	text2image: {
		icon: WandIcon,
		label: "AI Images",
	},
	ai: {
		icon: BotIcon,
		label: "AI Video",
	},
	upscale: {
		icon: ArrowUpFromLineIcon,
		label: "Video Upscale",
	},
	"nano-edit": {
		icon: PaletteIcon,
		label: "Skills",
	},
	text: {
		icon: TypeIcon,
		label: "文本",
	},
	audio: {
		icon: AudioLinesIcon,
		label: "音频",
	},
	captions: {
		icon: CaptionsIcon,
		label: "字幕",
	},
	stickers: {
		icon: StickerIcon,
		label: "贴纸",
	},
	"video-edit": {
		icon: Wand2Icon,
		label: "Audio Studio",
	},
	remotion: {
		icon: Layers,
		label: "Remotion",
	},
	hyperframes: {
		icon: CodeXmlIcon,
		label: "HyperFrames",
	},
	pty: {
		icon: SquareTerminalIcon,
		label: "Terminal",
	},
	"word-timeline": {
		icon: TextSelect,
		label: "Smart Speech",
	},
	"project-folder": {
		icon: FolderSync,
		label: "Project",
	},
	// WIP panels below
	filters: {
		icon: BlendIcon,
		label: "滤镜",
	},
	adjustments: {
		icon: SlidersHorizontalIcon,
		label: "调节",
	},
	templates: {
		icon: LayoutTemplateIcon,
		label: "模板",
	},
	segmentation: {
		icon: ScissorsIcon,
		label: "Segment (WIP)",
	},
	sounds: {
		icon: VolumeXIcon,
		label: "AI Audio",
	},
	effects: {
		icon: SparklesIcon,
		label: "特效",
	},
	transitions: {
		icon: ArrowLeftRightIcon,
		label: "转场",
	},
	moyin: {
		icon: ClapperboardIcon,
		label: "Director",
	},
	"ai-chat": {
		icon: MessageSquareIcon,
		label: "AI Chat",
	},
	search: {
		icon: SearchIcon,
		label: "Search",
	},
	"digital-human": {
		icon: UserSquareIcon,
		label: "数字人",
	},
};

// --- Tab Groups ---

export type TabGroup = "media" | "ai-create" | "agents" | "edit";

export type EditSubgroup = "ai-edit" | "manual-edit";

export interface Subgroup {
	label: string;
	tabs: Tab[];
}

export interface TabGroupDef {
	icon: LucideIcon;
	label: string;
	tabs: Tab[];
	subgroups?: Record<EditSubgroup, Subgroup>;
}

const editSubgroups: Record<EditSubgroup, Subgroup> = {
	"ai-edit": {
		label: "AI Assist",
		tabs: ["word-timeline", "upscale", "video-edit", "segmentation"],
	},
	"manual-edit": {
		label: "Manual Edit",
		tabs: [
			"audio",
			"text",
			"stickers",
			"effects",
			"transitions",
			"captions",
			"filters",
			"adjustments",
			"templates",
			"digital-human",
		],
	},
};

export const STANDARD_EDITOR_TABS = [
	"media",
	"audio",
	"text",
	"stickers",
	"effects",
	"transitions",
	"captions",
	"filters",
	"adjustments",
	"templates",
	"digital-human",
] as const satisfies readonly Tab[];

export type StandardEditorTab = (typeof STANDARD_EDITOR_TABS)[number];
export type SoundsPanelTab = AudioLibrarySectionId;

/** Collapsible groups in the sounds panel sidebar (Jianying-style). */
export type AudioSidebarGroupId = "my" | "folders" | "music" | "sfx" | "lab";

export const tabGroups: { [key in TabGroup]: TabGroupDef } = {
	"ai-create": {
		icon: SparklesIcon,
		label: "Create",
		tabs: ["ai", "text2image", "moyin", "sounds"],
	},
	edit: {
		icon: ScissorsIcon,
		label: "Edit",
		tabs: [
			...editSubgroups["ai-edit"].tabs,
			...editSubgroups["manual-edit"].tabs,
		],
		subgroups: editSubgroups,
	},
	media: {
		icon: FolderOpenIcon,
		label: "Library",
		tabs: ["media", "project-folder", "search"],
	},
	agents: {
		icon: WrenchIcon,
		label: "Agents",
		tabs: ["nano-edit", "ai-chat", "pty", "remotion", "hyperframes"],
	},
};

/** Reverse lookup: given a tab in the edit group, return its subgroup. */
function getEditSubgroupForTab(tab: Tab): EditSubgroup | undefined {
	for (const [key, sub] of Object.entries(editSubgroups)) {
		if (sub.tabs.includes(tab)) return key as EditSubgroup;
	}
	return;
}

/** Reverse lookup: given a tab, return which group it belongs to. */
export function getGroupForTab(tab: Tab): TabGroup {
	for (const [groupKey, group] of Object.entries(tabGroups)) {
		if (group.tabs.includes(tab)) {
			return groupKey as TabGroup;
		}
	}
	return "media";
}

// --- Store ---

interface MediaPanelStore {
	activeGroup: TabGroup;
	setActiveGroup: (group: TabGroup) => void;

	activeTab: Tab;
	setActiveTab: (tab: Tab) => void;

	activeEditSubgroup: EditSubgroup;
	setActiveEditSubgroup: (subgroup: EditSubgroup) => void;

	lastTabPerGroup: Record<TabGroup, Tab>;

	// AI-specific state
	aiActiveTab: "text" | "image" | "avatar" | "upscale" | "angles";
	setAiActiveTab: (
		tab: "text" | "image" | "avatar" | "upscale" | "angles"
	) => void;

	activeSoundsTab: SoundsPanelTab;
	setActiveSoundsTab: (tab: SoundsPanelTab) => void;

	collapsedAudioGroups: Record<AudioSidebarGroupId, boolean>;
	setAudioGroupCollapsed: ({
		group,
		collapsed,
	}: {
		group: AudioSidebarGroupId;
		collapsed: boolean;
	}) => void;
}

const defaultLastTabPerGroup: Record<TabGroup, Tab> = {
	media: "media",
	"ai-create": "ai",
	agents: "nano-edit",
	edit: "word-timeline",
};

export const useMediaPanelStore = create<MediaPanelStore>((set) => ({
	activeGroup: "media",
	setActiveGroup: (group) =>
		set((state) => ({
			activeGroup: group,
			activeTab: state.lastTabPerGroup[group],
		})),

	activeTab: "media",
	setActiveTab: (tab) =>
		set((state) => {
			const group = getGroupForTab(tab);
			const editSubgroup =
				group === "edit" ? getEditSubgroupForTab(tab) : undefined;
			return {
				activeTab: tab,
				activeGroup: group,
				lastTabPerGroup: { ...state.lastTabPerGroup, [group]: tab },
				...(editSubgroup && { activeEditSubgroup: editSubgroup }),
			};
		}),

	activeEditSubgroup: "ai-edit",
	setActiveEditSubgroup: (subgroup) =>
		set((state) => {
			const firstTab = editSubgroups[subgroup].tabs[0];
			if (!firstTab) return { activeEditSubgroup: subgroup };
			return {
				activeEditSubgroup: subgroup,
				activeTab: firstTab,
				lastTabPerGroup: { ...state.lastTabPerGroup, edit: firstTab },
			};
		}),

	lastTabPerGroup: { ...defaultLastTabPerGroup },

	// AI-specific state defaults
	aiActiveTab: "text",
	setAiActiveTab: (tab) => set({ aiActiveTab: tab }),
	activeSoundsTab: "music-latest",
	setActiveSoundsTab: (activeSoundsTab) => set({ activeSoundsTab }),

	// Sound effects start collapsed to keep the sidebar short, like Jianying.
	collapsedAudioGroups: {
		my: false,
		folders: false,
		music: false,
		sfx: true,
		lab: false,
	},
	setAudioGroupCollapsed: ({ group, collapsed }) =>
		set((state) => ({
			collapsedAudioGroups: {
				...state.collapsedAudioGroups,
				[group]: collapsed,
			},
		})),
}));

// Expose for iPad CLI debugging (qcut://eval, qcut://panel)
(window as any).__mediaPanelStore = useMediaPanelStore;
