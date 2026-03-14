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
	TextSelect,
	FolderSync,
	FolderOpenIcon,
	WrenchIcon,
	ArrowUpFromLineIcon,
	ClapperboardIcon,
} from "lucide-react";
import { create } from "zustand";

export type Tab =
	| "media"
	| "text"
	| "stickers"
	| "video-edit"
	| "effects"
	| "transitions"
	| "filters"
	| "text2image"
	| "nano-edit"
	| "ai"
	| "sounds"
	| "segmentation"
	| "remotion"
	| "pty"
	| "word-timeline"
	| "project-folder"
	| "upscale"
	| "moyin";

export const tabs: { [key in Tab]: { icon: LucideIcon; label: string } } = {
	media: {
		icon: VideoIcon,
		label: "Media",
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
		label: "Text",
	},
	stickers: {
		icon: StickerIcon,
		label: "Stickers",
	},
	"video-edit": {
		icon: Wand2Icon,
		label: "Audio Studio",
	},
	remotion: {
		icon: Layers,
		label: "Remotion",
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
		label: "Filters (WIP)",
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
		label: "Effects (WIP)",
	},
	transitions: {
		icon: ArrowLeftRightIcon,
		label: "Transitions (WIP)",
	},
	moyin: {
		icon: ClapperboardIcon,
		label: "Director",
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
		tabs: ["text", "stickers", "effects", "filters", "transitions"],
	},
};

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
		tabs: ["media", "project-folder"],
	},
	agents: {
		icon: WrenchIcon,
		label: "Agents",
		tabs: ["nano-edit", "pty", "remotion"],
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
}));

// Expose for iPad CLI debugging (qcut://eval, qcut://panel)
(window as any).__mediaPanelStore = useMediaPanelStore;
