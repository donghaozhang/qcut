import type { RemotionStore } from "@/lib/remotion/types";

/** Selector to get all registered components as an array */
export const selectAllComponents = (state: RemotionStore) =>
	Array.from(state.registeredComponents.values());

/** Selector to get all active instances as an array */
export const selectAllInstances = (state: RemotionStore) =>
	Array.from(state.instances.values());

/** Selector to get pending render jobs */
export const selectPendingJobs = (state: RemotionStore) =>
	state.renderQueue.filter((job) => job.status === "pending");

/** Selector to get currently rendering jobs */
export const selectRenderingJobs = (state: RemotionStore) =>
	state.renderQueue.filter((job) => job.status === "rendering");

/** Selector to check if any render jobs are in progress */
export const selectIsRendering = (state: RemotionStore) =>
	state.renderQueue.some(
		(job) => job.status === "pending" || job.status === "rendering"
	);

/** Selector to get recent errors */
export const selectRecentErrors = (state: RemotionStore) => state.recentErrors;

/** Selector to get the current sync state */
export const selectSyncState = (state: RemotionStore) => state.syncState;

/** Selector to get all imported folders */
export const selectImportedFolders = (state: RemotionStore) =>
	Array.from(state.importedFolders.values());

/** Selector to check if folder import is in progress */
export const selectIsFolderImporting = (state: RemotionStore) =>
	state.isFolderImporting;
