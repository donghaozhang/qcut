import { create } from "zustand";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import {
	DEFAULT_CURSOR_CONFIG,
	type CursorRenderConfig,
} from "@/lib/screen-recording/cursor-renderer";
import {
	DEFAULT_BACKGROUND,
	type BackgroundConfig,
} from "@/lib/screen-recording/wallpapers";

interface ScreenRecordingEnhancementState {
	/** Cursor telemetry for current recording */
	cursorTelemetry: CursorTelemetryData | null;
	setCursorTelemetry: (data: CursorTelemetryData | null) => void;

	/** Cursor rendering config */
	cursorConfig: CursorRenderConfig;
	setCursorConfig: (config: Partial<CursorRenderConfig>) => void;

	/** Whether cursor overlay is visible in preview */
	showCursorOverlay: boolean;
	setShowCursorOverlay: (show: boolean) => void;

	/** Background beautification config */
	background: BackgroundConfig;
	setBackground: (config: Partial<BackgroundConfig>) => void;
}

export const useScreenRecordingEnhancementStore =
	create<ScreenRecordingEnhancementState>((set) => ({
		cursorTelemetry: null,
		setCursorTelemetry: (data) => set({ cursorTelemetry: data }),

		cursorConfig: { ...DEFAULT_CURSOR_CONFIG },
		setCursorConfig: (config) =>
			set((state) => ({
				cursorConfig: { ...state.cursorConfig, ...config },
			})),

		showCursorOverlay: true,
		setShowCursorOverlay: (show) => set({ showCursorOverlay: show }),

		background: { ...DEFAULT_BACKGROUND },
		setBackground: (config) =>
			set((state) => ({
				background: { ...state.background, ...config },
			})),
	}));
