/**
 * Timeline Store Operations
 *
 * Composes timeline operation slices to keep the store implementation maintainable.
 * Uses dependency injection to access store closure helpers without circular imports.
 *
 * @module stores/timeline-store-operations
 */

import type { TimelineTrack } from "@/types/timeline";
import type { TimelineStore } from "./index";
import { createAddOps } from "./timeline-add-ops";
import { createElementOps } from "./timeline-element-ops";
import { createTrackOps } from "./timeline-track-ops";
import { createTransitionOps } from "./timeline-transition-ops";
import { createPrecisionEditOps } from "./timeline-precision-edit-ops";

/**
 * Dependencies injected from the store closure.
 * These are module-level helpers not accessible via get().
 */
export interface OperationDeps {
	updateTracks: (tracks: TimelineTrack[]) => void;
	updateTracksAndSave: (tracks: TimelineTrack[]) => void;
	autoSaveTimeline: () => void;
}

export type StoreGet = () => TimelineStore;
export type StoreSet = (
	partial:
		| Partial<TimelineStore>
		| ((state: TimelineStore) => Partial<TimelineStore>)
) => void;

/**
 * Creates all heavy timeline operations with injected dependencies.
 * The returned object is spread into the Zustand store.
 */
export function createTimelineOperations({
	get,
	set,
	deps,
}: {
	get: StoreGet;
	set: StoreSet;
	deps: OperationDeps;
}) {
	return {
		...createTrackOps(get, set, deps),
		...createElementOps(get, set, deps),
		...createAddOps(get, set, deps),
		...createTransitionOps(get, set, deps),
		...createPrecisionEditOps(get, set, deps),
	};
}
