import { useRemotionStore } from "./store";

/**
 * Expose store for debugging in browser console.
 * Usage:
 *   __REMOTION_DEBUG__.isInitialized()  // Should be true
 *   __REMOTION_DEBUG__.getComponents()  // Should list 13+ component IDs
 *   __REMOTION_DEBUG__.getState()       // Full store state
 */
if (typeof window !== "undefined") {
	(window as unknown as { __REMOTION_DEBUG__: object }).__REMOTION_DEBUG__ = {
		getState: () => useRemotionStore.getState(),
		getComponents: () => [
			...useRemotionStore.getState().registeredComponents.keys(),
		],
		isInitialized: () => useRemotionStore.getState().isInitialized,
		getInstances: () => [...useRemotionStore.getState().instances.keys()],
		getImportedFolders: () => [
			...useRemotionStore.getState().importedFolders.keys(),
		],
		isFolderImporting: () => useRemotionStore.getState().isFolderImporting,
	};
}
