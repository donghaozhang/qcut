"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const PREVIEW_SCALE_PRESETS = ["fit", 75, 100, 125, 150] as const;

export type PreviewScale = (typeof PREVIEW_SCALE_PRESETS)[number];

interface PreviewViewState {
	previewScale: PreviewScale;
	showSafeAreas: boolean;

	setPreviewScale: (scale: PreviewScale) => void;
	toggleSafeAreas: () => void;
	/** Step through the numeric presets; "fit" enters at the nearest end. */
	stepPreviewScale: (direction: "in" | "out") => void;
}

export const usePreviewViewStore = create<PreviewViewState>()(
	persist(
		(set) => ({
			previewScale: "fit",
			showSafeAreas: false,

			setPreviewScale: (scale) => {
				set({ previewScale: scale });
			},

			toggleSafeAreas: () => {
				set((state) => ({ showSafeAreas: !state.showSafeAreas }));
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
