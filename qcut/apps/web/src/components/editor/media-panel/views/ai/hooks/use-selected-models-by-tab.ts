/**
 * Per-tab selected-models state for the AI panel.
 *
 * Each tab (text / image / avatar / upscale / angles) owns an independent
 * list of selected model ids. Cross-tab contamination is structurally
 * impossible because each tab only ever sees its own slice.
 *
 * Replaces the previous single-shared `selectedModels` + tab-switch
 * `defaults` table in `ai/index.tsx`, which silently leaked selections
 * between tabs when a tab was missing from the defaults map.
 *
 * @see apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/use-selected-models-by-tab.test.ts
 */

import { useCallback, useMemo, useState } from "react";
import type { AIActiveTab } from "../types/ai-types";

/**
 * Default selection for each tab at mount. Picked to be a sensible
 * "first reasonable model" per tab so the Generate button is enabled
 * immediately.
 */
export const TAB_DEFAULT_MODELS: Record<AIActiveTab, readonly string[]> = {
	text: ["gmi_seedance_2_0_fast_260128_t2v"],
	image: ["sora2_image_to_video_pro"],
	avatar: ["kling_avatar_v2_pro"],
	upscale: ["bytedance_video_upscaler"],
	angles: ["shots_cinematic_angles"],
};

export type SelectedModelsByTab = Record<AIActiveTab, string[]>;

export interface UseSelectedModelsByTabResult {
	/** Full per-tab map — exposed for tests and debug. */
	selectedModelsByTab: SelectedModelsByTab;
	/** The active tab's selection. This is what consumers should read. */
	selectedModels: string[];
	/**
	 * Update the active tab's selection. Accepts either a new array or
	 * a functional setter. Mirrors the shape of `useState`'s setter so
	 * existing call sites (toggleModel, etc.) work without changes.
	 */
	setSelectedModels: (next: string[] | ((prev: string[]) => string[])) => void;
}

function createInitialState(): SelectedModelsByTab {
	return {
		text: [...TAB_DEFAULT_MODELS.text],
		image: [...TAB_DEFAULT_MODELS.image],
		avatar: [...TAB_DEFAULT_MODELS.avatar],
		upscale: [...TAB_DEFAULT_MODELS.upscale],
		angles: [...TAB_DEFAULT_MODELS.angles],
	};
}

/**
 * Owns per-tab selected-model lists and exposes the active tab's slice
 * as `selectedModels` / `setSelectedModels` so existing downstream code
 * (which expects a single flat array) keeps working unchanged.
 */
export function useSelectedModelsByTab(
	activeTab: AIActiveTab
): UseSelectedModelsByTabResult {
	const [selectedModelsByTab, setSelectedModelsByTab] =
		useState<SelectedModelsByTab>(createInitialState);

	const selectedModels = useMemo(
		() => selectedModelsByTab[activeTab],
		[selectedModelsByTab, activeTab]
	);

	const setSelectedModels = useCallback(
		(next: string[] | ((prev: string[]) => string[])) => {
			setSelectedModelsByTab((byTab) => {
				const prevArr = byTab[activeTab];
				const nextArr = typeof next === "function" ? next(prevArr) : next;
				if (nextArr === prevArr) return byTab;
				return { ...byTab, [activeTab]: nextArr };
			});
		},
		[activeTab]
	);

	return { selectedModelsByTab, selectedModels, setSelectedModels };
}
