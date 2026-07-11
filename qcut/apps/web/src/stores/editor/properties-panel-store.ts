import { create } from "zustand";

export const AUDIO_PROPERTIES_TABS = [
	"basic",
	"voice",
	"effects",
	"speed",
	"lyrics",
] as const;

export type AudioPropertiesTab = (typeof AUDIO_PROPERTIES_TABS)[number];

export type AudioPropertiesSection =
	| "loudness"
	| "denoise"
	| "voice-enhance"
	| "separation"
	| "pitch"
	| "pan"
	| "voice-conversion"
	| "equalizer"
	| "compressor"
	| "limiter"
	| "reverb"
	| "echo"
	| "telephone"
	| "beat-detection";

interface AudioPanelRequest {
	id: number;
	elementId: string;
	tab: AudioPropertiesTab;
	section?: AudioPropertiesSection;
}

interface PropertiesPanelState {
	activeAudioTab: AudioPropertiesTab;
	audioRequest?: AudioPanelRequest;
	setActiveAudioTab: (tab: AudioPropertiesTab) => void;
	requestAudioPanel: (request: Omit<AudioPanelRequest, "id">) => void;
}

export const usePropertiesPanelStore = create<PropertiesPanelState>((set) => ({
	activeAudioTab: "basic",
	setActiveAudioTab: (activeAudioTab) => set({ activeAudioTab }),
	requestAudioPanel: (request) =>
		set((state) => ({
			activeAudioTab: request.tab,
			audioRequest: {
				...request,
				id: (state.audioRequest?.id ?? 0) + 1,
			},
		})),
}));
