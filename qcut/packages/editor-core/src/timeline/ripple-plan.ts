/**
 * Ripple domains and typed links (QTL-003).
 *
 * A ripple edit must move exactly three things: the track being edited,
 * tracks holding elements explicitly linked to the edited elements, and
 * nothing else. This module derives the typed link graph from the persisted
 * timeline (today links are encoded as shared `groupId`s) and resolves the
 * set of tracks a ripple command may shift.
 *
 * Domain policy:
 * - Unrelated tracks stay fixed — they are simply outside the domain.
 * - Locked unrelated tracks are also outside the domain (nothing to decide).
 * - A locked track holding a linked dependency BLOCKS the whole command:
 *   shifting one side of a link but not the other desynchronizes the pair,
 *   so the caller must fail closed and report it.
 *
 * @module @qcut/editor-core/timeline/ripple-plan
 */

/**
 * `video-audio` and `group` are derivable from persisted data today.
 * `caption-owner`, `effect-target`, and `semantic-scene` are reserved for
 * the persisted semantic graph (QTL-011).
 */
export type TimelineLinkType =
	| "video-audio"
	| "group"
	| "caption-owner"
	| "effect-target"
	| "semantic-scene";

export interface TimelineElementLink {
	type: TimelineLinkType;
	fromElementId: string;
	toElementId: string;
	/** Set when the user explicitly detached the link; automation must not
	 * re-follow (persisted with QTL-011). */
	detached?: boolean;
}

export interface LinkAwareElement {
	id: string;
	groupId?: string;
	mediaId?: string;
	type?: string;
}

export interface LinkAwareTrack {
	id: string;
	type?: string;
	locked?: boolean;
	elements: readonly LinkAwareElement[];
}

/**
 * Derive the typed link graph from shared `groupId`s. A media-track element
 * and an audio-track element sharing groupId AND mediaId form a
 * `video-audio` pair (separated audio); every other cross-member relation in
 * a group is a generic `group` link.
 */
export function deriveTimelineLinks({
	tracks,
}: {
	tracks: readonly LinkAwareTrack[];
}): TimelineElementLink[] {
	const membersByGroup = new Map<
		string,
		Array<{ element: LinkAwareElement; trackType?: string }>
	>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (!element.groupId) continue;
			const members = membersByGroup.get(element.groupId) ?? [];
			members.push({ element, trackType: track.type });
			membersByGroup.set(element.groupId, members);
		}
	}

	const links: TimelineElementLink[] = [];
	for (const members of membersByGroup.values()) {
		for (let i = 0; i < members.length; i++) {
			for (let j = i + 1; j < members.length; j++) {
				const a = members[i];
				const b = members[j];
				const isSeparatedAudioPair =
					a.element.mediaId !== undefined &&
					a.element.mediaId === b.element.mediaId &&
					(a.trackType === "audio") !== (b.trackType === "audio");
				links.push({
					type: isSeparatedAudioPair ? "video-audio" : "group",
					fromElementId: a.element.id,
					toElementId: b.element.id,
				});
			}
		}
	}
	return links;
}

export interface RippleDomainResolution {
	/** Tracks a ripple shift may move (never includes locked tracks). */
	domainTrackIds: Set<string>;
	/** Locked tracks holding linked dependencies — the command must fail. */
	lockedDependencyTrackIds: string[];
}

/**
 * Resolve which tracks a ripple command may shift. The domain seeds from the
 * edited tracks, then expands one hop along links attached to the edited
 * elements (`seedElementIds`; defaults to every element on the seed tracks).
 */
export function resolveRippleDomain({
	tracks,
	seedTrackIds,
	seedElementIds,
	links,
}: {
	tracks: readonly LinkAwareTrack[];
	seedTrackIds: Iterable<string>;
	seedElementIds?: Iterable<string>;
	links: readonly TimelineElementLink[];
}): RippleDomainResolution {
	const trackIdByElementId = new Map<string, string>();
	const trackById = new Map<string, LinkAwareTrack>();
	for (const track of tracks) {
		trackById.set(track.id, track);
		for (const element of track.elements) {
			trackIdByElementId.set(element.id, track.id);
		}
	}

	const seeds = new Set(seedTrackIds);
	const edited =
		seedElementIds !== undefined
			? new Set(seedElementIds)
			: new Set(
					[...seeds].flatMap(
						(trackId) =>
							trackById.get(trackId)?.elements.map((element) => element.id) ??
							[]
					)
				);

	const dependencyTrackIds = new Set<string>();
	for (const link of links) {
		if (link.detached) continue;
		const partnerId = edited.has(link.fromElementId)
			? link.toElementId
			: edited.has(link.toElementId)
				? link.fromElementId
				: null;
		if (!partnerId) continue;
		const partnerTrackId = trackIdByElementId.get(partnerId);
		if (partnerTrackId) dependencyTrackIds.add(partnerTrackId);
	}

	const domainTrackIds = new Set<string>();
	const lockedDependencyTrackIds: string[] = [];
	for (const trackId of [...seeds, ...dependencyTrackIds]) {
		const track = trackById.get(trackId);
		if (!track) continue;
		if (track.locked) {
			// A locked seed is the caller's explicit-target failure (QTL-001);
			// a locked dependency is this module's fail-closed signal.
			if (!seeds.has(trackId)) lockedDependencyTrackIds.push(trackId);
			continue;
		}
		domainTrackIds.add(trackId);
	}

	return { domainTrackIds, lockedDependencyTrackIds };
}
