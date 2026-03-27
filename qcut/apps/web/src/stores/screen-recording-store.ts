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
import {
	type SpeedRegion,
	hasOverlap,
	clampSpeed,
	SPEED_REGION_DEFAULT_SPEED,
	SPEED_REGION_DEFAULT_DURATION_MS,
	SPEED_REGION_MIN_DURATION_MS,
} from "@/lib/screen-recording/speed-regions";

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

	/** Speed regions for playback speed control */
	speedRegions: SpeedRegion[];
	addSpeedRegion: (
		startMs: number,
		durationMs?: number,
		speed?: number
	) => void;
	removeSpeedRegion: (id: string) => void;
	updateSpeedRegion: (id: string, updates: Partial<SpeedRegion>) => void;
	setSpeedRegions: (regions: SpeedRegion[]) => void;
}

/** Check if any enhancements are active */
export const hasActiveEnhancements = (
	state: ScreenRecordingEnhancementState
): boolean =>
	state.background.type !== "none" ||
	(state.showCursorOverlay && state.cursorTelemetry !== null) ||
	state.zoomRegions.length > 0 ||
	state.speedRegions.length > 0;

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

		speedRegions: [],
		addSpeedRegion: (startMs, durationMs, speed) => {
			const duration = durationMs ?? SPEED_REGION_DEFAULT_DURATION_MS;
			const candidate: SpeedRegion = {
				id: `speed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				startMs,
				endMs: startMs + duration,
				speed: clampSpeed(speed ?? SPEED_REGION_DEFAULT_SPEED),
			};
			set((state) => {
				if (hasOverlap(state.speedRegions, candidate)) return state;
				return { speedRegions: [...state.speedRegions, candidate] };
			});
		},
		removeSpeedRegion: (id) =>
			set((state) => ({
				speedRegions: state.speedRegions.filter((r) => r.id !== id),
			})),
		updateSpeedRegion: (id, updates) =>
			set((state) => {
				const updated = state.speedRegions.map((r) => {
					if (r.id !== id) return r;
					const merged = { ...r, ...updates };
					if (updates.speed !== undefined) {
						merged.speed = clampSpeed(merged.speed);
					}
					if (merged.endMs - merged.startMs < SPEED_REGION_MIN_DURATION_MS) {
						merged.endMs = merged.startMs + SPEED_REGION_MIN_DURATION_MS;
					}
					return merged;
				});
				// Check overlap after update
				const target = updated.find((r) => r.id === id);
				if (target && hasOverlap(updated, target)) return state;
				return { speedRegions: updated };
			}),
		setSpeedRegions: (regions) => set({ speedRegions: regions }),
	}));

// Expose store for E2E testing (dev/test only)
if (typeof window !== "undefined" && import.meta.env.DEV) {
	(
		window as Window & {
			__screenRecordingEnhancementStore__?: typeof useScreenRecordingEnhancementStore;
		}
	).__screenRecordingEnhancementStore__ = useScreenRecordingEnhancementStore;
}
