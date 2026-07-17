import {
	loadAudioLibraryCloudItems,
	persistAudioLibraryCloudItems,
} from "@/lib/audio/audio-library-personal";
import {
	loadCustomAudioPresets,
	parseCustomAudioPreset,
	persistCustomAudioPresets,
} from "@/lib/audio/audio-presets";
import {
	loadColorPresets,
	parseColorPreset,
	persistColorPresets,
} from "@/lib/color/color-presets";
import {
	loadCustomTextPresets,
	parseCustomTextPreset,
	storeCustomTextPresets,
} from "@/lib/text/text-presets";
import {
	loadCustomTimelineTemplates,
	parseTimelineTemplate,
	persistCustomTimelineTemplates,
} from "@/lib/templates/custom-template-registry";
import {
	loadClipAttributePresets,
	parseClipAttributePreset,
	persistClipAttributePresets,
} from "@/lib/timeline/clip-attribute-presets";
import type { UserLibraryItem } from "./user-library-contract";
import {
	USER_LIBRARY_NAMESPACES,
	type UserLibraryNamespace,
} from "./user-library-events";

export interface UserLibraryAdapter {
	documentKey: string;
	load: () => unknown[];
	namespace: UserLibraryNamespace;
	persist: ({ items }: { items: UserLibraryItem[] }) => void;
}

export const USER_LIBRARY_ADAPTERS: UserLibraryAdapter[] = [
	{
		documentKey: "default",
		load: loadAudioLibraryCloudItems,
		namespace: USER_LIBRARY_NAMESPACES.audioLibrary,
		persist: persistAudioLibraryCloudItems,
	},
	{
		documentKey: "default",
		load: loadCustomAudioPresets,
		namespace: USER_LIBRARY_NAMESPACES.audioPresets,
		persist: ({ items }) => {
			const presets = items
				.map((value) => parseCustomAudioPreset({ value }))
				.filter((preset) => preset !== null);
			persistCustomAudioPresets({ presets });
		},
	},
	{
		documentKey: "default",
		load: loadClipAttributePresets,
		namespace: USER_LIBRARY_NAMESPACES.clipPresets,
		persist: ({ items }) => {
			const presets = items
				.map((value) => parseClipAttributePreset({ value }))
				.filter((preset) => preset !== null);
			persistClipAttributePresets({ presets });
		},
	},
	{
		documentKey: "default",
		load: loadColorPresets,
		namespace: USER_LIBRARY_NAMESPACES.colorPresets,
		persist: ({ items }) => {
			const presets = items
				.map((value) => parseColorPreset({ value }))
				.filter((preset) => preset !== null);
			persistColorPresets({ presets });
		},
	},
	{
		documentKey: "default",
		load: loadCustomTextPresets,
		namespace: USER_LIBRARY_NAMESPACES.textPresets,
		persist: ({ items }) => {
			const presets = items
				.map((value) => parseCustomTextPreset({ value }))
				.filter((preset) => preset !== null);
			storeCustomTextPresets({ presets });
		},
	},
	{
		documentKey: "default",
		load: loadCustomTimelineTemplates,
		namespace: USER_LIBRARY_NAMESPACES.timelineTemplates,
		persist: ({ items }) => {
			const templates = items
				.map((value) => parseTimelineTemplate({ value }))
				.filter((template) => template !== null);
			persistCustomTimelineTemplates({ templates });
		},
	},
];
