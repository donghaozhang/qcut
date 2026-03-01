/**
 * Remotion Integration Store
 *
 * Zustand store for managing Remotion component state in QCut.
 * Handles component registration, instance lifecycle, playback sync,
 * render queue management, and error tracking.
 *
 * @module stores/remotion-store
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
	RemotionStore,
	RemotionStoreState,
	RemotionError,
	SyncState,
} from "@/lib/remotion/types";
import { builtInComponentDefinitions } from "@/lib/remotion/built-in";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { createRegistryActions } from "./actions/registry-actions";
import { createInstanceActions } from "./actions/instance-actions";
import { createPlaybackActions } from "./actions/playback-actions";
import { createSyncActions } from "./actions/sync-actions";
import { createRenderQueueActions } from "./actions/render-queue-actions";
import { createErrorActions } from "./actions/error-actions";
import { createAnalysisActions } from "./actions/analysis-actions";
import { createFolderImportActions } from "./actions/folder-import-actions";

// ============================================================================
// Initial State
// ============================================================================

const initialSyncState: SyncState = {
	globalFrame: 0,
	isPlaying: false,
	playbackRate: 1,
	activeElementIds: [],
	lastSyncTime: Date.now(),
};

const initialState: RemotionStoreState = {
	registeredComponents: new Map(),
	instances: new Map(),
	renderQueue: [],
	syncState: initialSyncState,
	isInitialized: false,
	isLoading: false,
	recentErrors: [],
	analyzedSequences: new Map(),
	importedFolders: new Map(),
	isFolderImporting: false,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useRemotionStore = create<RemotionStore>()(
	subscribeWithSelector((set, get) => ({
		...initialState,

		// Initialization
		initialize: async () => {
			debugLog("[REMOTION] initialize() called", {
				isInitialized: get().isInitialized,
				isLoading: get().isLoading,
			});

			const { isInitialized } = get();
			if (isInitialized) {
				debugLog("[REMOTION] Already initialized, returning early");
				return;
			}

			set({ isLoading: true });

			try {
				const newComponents = new Map(get().registeredComponents);
				debugLog("[REMOTION] Loading built-in components...");

				for (const definition of builtInComponentDefinitions) {
					newComponents.set(definition.id, definition);
					debugLog("[REMOTION] Registered:", definition.id);
				}

				set({
					registeredComponents: newComponents,
					isInitialized: true,
					isLoading: false,
				});

				debugLog("[REMOTION] Initialization complete!", {
					totalComponents: newComponents.size,
				});
			} catch (error) {
				debugError("[REMOTION] Initialization failed:", error);
				const remotionError: RemotionError = {
					type: "load",
					message:
						error instanceof Error
							? error.message
							: "Failed to initialize Remotion store",
					recoverable: true,
					recoveryAction: "retry",
					timestamp: Date.now(),
				};

				set((state) => ({
					isLoading: false,
					recentErrors: [...state.recentErrors.slice(-19), remotionError],
				}));
			}
		},

		// Composed actions
		...createRegistryActions(set, get),
		...createInstanceActions(set, get),
		...createPlaybackActions(set, get),
		...createSyncActions(set, get),
		...createRenderQueueActions(set),
		...createErrorActions(set),
		...createAnalysisActions(set, get),
		...createFolderImportActions(set, get),

		// Cleanup
		reset: () => {
			const instances = get().instances;
			for (const [, instance] of instances) {
				if (instance.playerRef) {
					instance.playerRef.pause();
				}
			}

			set(initialState);
		},
	}))
);

// ============================================================================
// Store Initialization
// ============================================================================

export async function initializeRemotionStore() {
	const store = useRemotionStore.getState();
	if (!store.isInitialized) {
		await store.initialize();
	}
}
