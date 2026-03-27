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
import type { ZoomRegion } from "@/lib/screen-recording/zoom-region-utils";
import {
	DEFAULT_AUTO_ZOOM_CONFIG,
	type AutoZoomConfig,
} from "@/lib/screen-recording/auto-zoom-analyzer";

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

	/** Zoom regions */
	zoomRegions: ZoomRegion[];
	setZoomRegions: (regions: ZoomRegion[]) => void;
	addZoomRegion: (region: ZoomRegion) => void;
	removeZoomRegion: (id: string) => void;
	updateZoomRegion: (id: string, updates: Partial<ZoomRegion>) => void;

	/** Auto-zoom configuration */
	autoZoomConfig: AutoZoomConfig;
	setAutoZoomConfig: (config: Partial<AutoZoomConfig>) => void;
}

/** Check if any enhancements are active */
export const hasActiveEnhancements = (
	state: ScreenRecordingEnhancementState
): boolean =>
	state.background.type !== "none" ||
	(state.showCursorOverlay && state.cursorTelemetry !== null) ||
	state.zoomRegions.length > 0;

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

		zoomRegions: [],
		setZoomRegions: (regions) => set({ zoomRegions: regions }),
		addZoomRegion: (region) =>
			set((state) => ({
				zoomRegions: [...state.zoomRegions, region],
			})),
		removeZoomRegion: (id) =>
			set((state) => ({
				zoomRegions: state.zoomRegions.filter((r) => r.id !== id),
			})),
		updateZoomRegion: (id, updates) =>
			set((state) => ({
				zoomRegions: state.zoomRegions.map((r) =>
					r.id === id ? { ...r, ...updates } : r
				),
			})),

		autoZoomConfig: { ...DEFAULT_AUTO_ZOOM_CONFIG },
		setAutoZoomConfig: (config) =>
			set((state) => ({
				autoZoomConfig: { ...state.autoZoomConfig, ...config },
			})),
	}));

// Expose store for E2E testing
if (typeof window !== "undefined") {
	(window as any).__screenRecordingEnhancementStore__ =
		useScreenRecordingEnhancementStore;
}
