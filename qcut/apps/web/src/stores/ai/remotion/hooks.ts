import type { RemotionComponentCategory } from "@/lib/remotion/types";
import type { AnalysisResult } from "@/lib/remotion/sequence-analysis-service";
import { useRemotionStore } from "./store";
import {
	selectSyncState,
	selectImportedFolders,
	selectIsFolderImporting,
} from "./selectors";

/** Hook to get a specific component by ID */
export function useRemotionComponent(componentId: string) {
	return useRemotionStore((state) =>
		state.registeredComponents.get(componentId)
	);
}

/** Hook to get a specific instance by element ID */
export function useRemotionInstance(elementId: string) {
	return useRemotionStore((state) => state.instances.get(elementId));
}

/** Hook to get components by category */
export function useComponentsByCategory(category: RemotionComponentCategory) {
	return useRemotionStore((state) => {
		const components = Array.from(state.registeredComponents.values());
		return components.filter((c) => c.category === category);
	});
}

/** Hook to subscribe to sync state changes */
export function useSyncState() {
	return useRemotionStore(selectSyncState);
}

/** Hook to check if store is initialized */
export function useRemotionInitialized() {
	return useRemotionStore((state) => state.isInitialized);
}

/** Hook to get analysis result for a component */
export function useComponentAnalysis(
	componentId: string | undefined
): AnalysisResult | undefined {
	return useRemotionStore((state) =>
		componentId ? state.analyzedSequences.get(componentId) : undefined
	);
}

/** Hook to get all imported folders */
export function useImportedFolders() {
	return useRemotionStore(selectImportedFolders);
}

/** Hook to check if folder import is in progress */
export function useFolderImporting() {
	return useRemotionStore(selectIsFolderImporting);
}
