/**
 * Track lock contract — pure preflight helpers shared by every timeline
 * command entry point (store APIs, UI handlers, CLI, AI automation).
 *
 * Policy (QTL-001):
 * - A content command whose direct targets sit on a locked track must fail
 *   as a whole: no state change, no history entry.
 * - Derived sets (ripple shift domains, "all tracks" defaults, broad style
 *   scopes) silently skip locked tracks instead of failing.
 * - Track metadata (mute, solo, hidden, height, rename, reorder, the lock
 *   toggle itself) is not content and stays editable while locked.
 *
 * @module @qcut/editor-core/timeline/lock-contract
 */

/** Minimal structural view of a track for lock checks. */
export interface LockAwareTrack {
	id: string;
	locked?: boolean;
	elements: readonly { id: string; groupId?: string }[];
}

/** Non-null when a command targets at least one locked track. */
export interface LockViolation {
	lockedTrackIds: string[];
}

/** Ids of every locked track. */
export function getLockedTrackIds(
	tracks: readonly LockAwareTrack[]
): Set<string> {
	const lockedIds = new Set<string>();
	for (const track of tracks) {
		if (track.locked) lockedIds.add(track.id);
	}
	return lockedIds;
}

/** Ids of the tracks that contain any of the given elements. */
export function findTrackIdsForElements({
	tracks,
	elementIds,
}: {
	tracks: readonly LockAwareTrack[];
	elementIds: Iterable<string>;
}): Set<string> {
	const wanted = new Set(elementIds);
	const trackIds = new Set<string>();
	if (wanted.size === 0) return trackIds;
	for (const track of tracks) {
		for (const element of track.elements) {
			if (wanted.has(element.id)) {
				trackIds.add(track.id);
				break;
			}
		}
	}
	return trackIds;
}

/** Ids of the tracks that contain any element of the given group. */
export function findTrackIdsForGroup({
	tracks,
	groupId,
}: {
	tracks: readonly LockAwareTrack[];
	groupId: string;
}): Set<string> {
	const trackIds = new Set<string>();
	for (const track of tracks) {
		if (track.elements.some((element) => element.groupId === groupId)) {
			trackIds.add(track.id);
		}
	}
	return trackIds;
}

/**
 * Preflight a content command. Returns null when every direct target is
 * editable, otherwise the list of locked tracks that block the command.
 *
 * `elementIds` targets are resolved to their containing tracks, so callers
 * that only know an element id (transform, effects) need no extra lookup.
 */
export function preflightLockedTracks({
	tracks,
	trackIds = [],
	elementIds = [],
}: {
	tracks: readonly LockAwareTrack[];
	trackIds?: Iterable<string>;
	elementIds?: Iterable<string>;
}): LockViolation | null {
	const lockedIds = getLockedTrackIds(tracks);
	if (lockedIds.size === 0) return null;

	const targetTrackIds = new Set(trackIds);
	for (const trackId of findTrackIdsForElements({ tracks, elementIds })) {
		targetTrackIds.add(trackId);
	}

	const lockedTargets = [...targetTrackIds].filter((trackId) =>
		lockedIds.has(trackId)
	);
	return lockedTargets.length > 0 ? { lockedTrackIds: lockedTargets } : null;
}

/** Drop locked tracks from a derived id set (ripple domains, defaults). */
export function excludeLockedTrackIds({
	tracks,
	trackIds,
}: {
	tracks: readonly LockAwareTrack[];
	trackIds: Iterable<string>;
}): Set<string> {
	const lockedIds = getLockedTrackIds(tracks);
	const remaining = new Set<string>();
	for (const trackId of trackIds) {
		if (!lockedIds.has(trackId)) remaining.add(trackId);
	}
	return remaining;
}
