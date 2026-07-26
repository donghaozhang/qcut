"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ColorScopeMode } from "@/lib/color/color-scopes";

export const PREVIEW_SCALE_PRESETS = ["fit", 75, 100, 125, 150] as const;

export type PreviewScale = (typeof PREVIEW_SCALE_PRESETS)[number];

export const SCOPE_DOCK_MIN_HEIGHT = 120;
export const SCOPE_DOCK_MAX_HEIGHT = 320;

export const SCOPE_DOCK_ORDER: ColorScopeMode[] = [
	"parade",
	"waveform",
	"vectorscope",
	"histogram",
];

interface PreviewViewState {
	previewScale: PreviewScale;
	showSafeAreas: boolean;
	showRulers: boolean;
	scopesEnabled: boolean;
	scopeDockHeight: number;
	visibleScopes: Record<ColorScopeMode, boolean>;

	setPreviewScale: (scale: PreviewScale) => void;
	toggleSafeAreas: () => void;
	toggleRulers: () => void;
	toggleScopes: () => void;
	toggleScope: (mode: ColorScopeMode) => void;
	setScopeDockHeight: (height: number) => void;
	/** Step through the numeric presets; "fit" enters at the nearest end. */
	stepPreviewScale: (direction: "in" | "out") => void;
}

export const usePreviewViewStore = create<PreviewViewState>()(
	persist(
		(set) => ({
			previewScale: "fit",
			showSafeAreas: false,
			showRulers: false,
			scopesEnabled: false,
			scopeDockHeight: 180,
			visibleScopes: {
				parade: true,
				waveform: true,
				vectorscope: true,
				histogram: false,
			},

			setPreviewScale: (scale) => {
				set({ previewScale: scale });
			},

			toggleSafeAreas: () => {
				set((state) => ({ showSafeAreas: !state.showSafeAreas }));
			},

			toggleRulers: () => {
				set((state) => ({ showRulers: !state.showRulers }));
			},

			toggleScopes: () => {
				set((state) => ({ scopesEnabled: !state.scopesEnabled }));
			},

			toggleScope: (mode) => {
				set((state) => ({
					visibleScopes: {
						...state.visibleScopes,
						[mode]: !state.visibleScopes[mode],
					},
				}));
			},

			setScopeDockHeight: (height) => {
				set({
					scopeDockHeight: Math.min(
						Math.max(height, SCOPE_DOCK_MIN_HEIGHT),
						SCOPE_DOCK_MAX_HEIGHT
					),
				});
			},

			stepPreviewScale: (direction) => {
				set((state) => {
					const numericPresets = PREVIEW_SCALE_PRESETS.filter(
						(preset): preset is Exclude<PreviewScale, "fit"> => preset !== "fit"
					);
					if (state.previewScale === "fit") {
						return {
							previewScale:
								direction === "in"
									? numericPresets[0]
									: numericPresets[numericPresets.length - 1],
						};
					}
					const index = numericPresets.indexOf(state.previewScale);
					const nextIndex = direction === "in" ? index + 1 : index - 1;
					if (nextIndex < 0 || nextIndex >= numericPresets.length) {
						return state;
					}
					return { previewScale: numericPresets[nextIndex] };
				});
			},
		}),
		{
			name: "qcut-preview-view",
			version: 1,
		}
	)
);
