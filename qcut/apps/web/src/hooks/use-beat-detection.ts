/**
 * Hook wrapping the beat detection store for component use.
 */

import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import type { BeatDetectionConfig } from "@qcut/editor-core";
import { useCallback } from "react";

/** Hook wrapping the beat detection store for a specific element. */
export function useBeatDetection(elementId: string | null) {
	const store = useBeatDetectionStore();

	const result = elementId ? (store.cache.get(elementId) ?? null) : null;

	const analyze = useCallback(
		async (audioUrl: string, config?: BeatDetectionConfig) => {
			if (!elementId) return null;
			return store.analyze(elementId, audioUrl, config);
		},
		[elementId, store.analyze]
	);

	const clear = useCallback(() => {
		if (elementId) {
			store.setActiveElement(elementId);
			store.clear();
		}
	}, [elementId, store.setActiveElement, store.clear]);

	return {
		result,
		isAnalyzing: store.isAnalyzing,
		progress: store.progress,
		error: store.error,
		sensitivity: store.sensitivity,
		setSensitivity: store.setSensitivity,
		analyze,
		clear,
		snapToNearestBeat: store.snapToNearestBeat,
		getCutPoints: store.getCutPoints,
	};
}
