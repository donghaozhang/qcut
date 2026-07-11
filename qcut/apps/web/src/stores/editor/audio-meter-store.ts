import { create } from "zustand";
import type { AudioMeterReading } from "@/lib/audio/audio-metering";
import { SILENT_AUDIO_METER } from "@/lib/audio/audio-metering";

interface AudioMeterState {
	master: AudioMeterReading;
	tracks: Record<string, AudioMeterReading>;
	buses: Record<string, AudioMeterReading>;
	duckingReductionDb: Record<string, number>;
	setSnapshot: (
		snapshot: Omit<AudioMeterState, "setSnapshot" | "clear">
	) => void;
	clear: () => void;
}

const EMPTY_SNAPSHOT = {
	master: SILENT_AUDIO_METER,
	tracks: {},
	buses: {},
	duckingReductionDb: {},
};

export const useAudioMeterStore = create<AudioMeterState>((set) => ({
	...EMPTY_SNAPSHOT,
	setSnapshot: (snapshot) => set(snapshot),
	clear: () => set(EMPTY_SNAPSHOT),
}));
