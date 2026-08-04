import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import type { TimelineTrack } from "@/types/timeline";
import { preflightLockedTracks } from "@qcut/editor-core/timeline";

/**
 * Shared lock preflight for store commands (QTL-001). Returns true — and
 * reports the violation — when any direct target sits on a locked track, in
 * which case the caller must bail out before pushing history or mutating
 * state. Derived sets (ripple domains, broad scopes) are not routed through
 * here; they silently skip locked tracks instead.
 */
export function blockedByTrackLock({
	tracks,
	operation,
	trackIds,
	elementIds,
}: {
	tracks: TimelineTrack[];
	operation: string;
	trackIds?: Iterable<string>;
	elementIds?: Iterable<string>;
}): boolean {
	const violation = preflightLockedTracks({ tracks, trackIds, elementIds });
	if (!violation) return false;

	handleError(new Error("Cannot modify a locked track"), {
		operation,
		category: ErrorCategory.VALIDATION,
		severity: ErrorSeverity.MEDIUM,
		metadata: { lockedTrackIds: violation.lockedTrackIds },
	});
	return true;
}
