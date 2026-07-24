import type { ScreenRecordingCaptureMode } from "@/lib/project/screen-recording-capture-mode";
import type { ScreenRecordingQualityPreset } from "@/lib/project/screen-recording-quality";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ScreenRecordingPreferencesState {
	captureMode: ScreenRecordingCaptureMode;
	qualityPreset: ScreenRecordingQualityPreset;
	setCaptureMode: ({
		captureMode,
	}: {
		captureMode: ScreenRecordingCaptureMode;
	}) => void;
	setQualityPreset: ({
		qualityPreset,
	}: {
		qualityPreset: ScreenRecordingQualityPreset;
	}) => void;
}

export const useScreenRecordingPreferencesStore =
	create<ScreenRecordingPreferencesState>()(
		persist(
			(set) => ({
				captureMode: "editor",
				qualityPreset: "native",
				setCaptureMode: ({ captureMode }) => set({ captureMode }),
				setQualityPreset: ({ qualityPreset }) => set({ qualityPreset }),
			}),
			{
				name: "qcut-screen-recording-preferences",
			}
		)
	);
