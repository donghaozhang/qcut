/**
 * Dirty domains and unknown-subtree ownership (JYI-002).
 *
 * Unknown fields survive writeback only while their owner is untouched in
 * the domains they depend on. Editing a segment's name (metadata) must not
 * destroy an unknown filter parameter (style-owned); deleting the segment
 * must drop its opaque companions; a structure edit invalidates unknown
 * children unless ownership is proven safe (JYR-005 gate).
 *
 * @module @qcut/editor-core/draft-interop/dirty-domains
 */

export const INTEROP_DIRTY_DOMAINS = [
	"timing",
	"geometry",
	"style",
	"resource",
	"linkage",
	"structure",
	"metadata",
] as const;

export type InteropDirtyDomain = (typeof INTEROP_DIRTY_DOMAINS)[number];

const dirtyDomainSet = new Set<string>(INTEROP_DIRTY_DOMAINS);

export function isInteropDirtyDomain(
	value: unknown
): value is InteropDirtyDomain {
	return typeof value === "string" && dirtyDomainSet.has(value);
}

/** Ownership record for one preserved unknown subtree. */
export interface UnknownSubtreeOwnership {
	/** Binding key of the subtree in the envelope's raw-node map. */
	foreignRef: string;
	/** Semantic node that owns the subtree's fate. */
	ownerSemanticId: string;
	/**
	 * Domains whose edits on the owner invalidate the preserved subtree.
	 * Unproven ownership must be declared broadly — never narrowly guessed.
	 */
	ownedDomains: InteropDirtyDomain[];
}

/**
 * Writeback fate of one unknown subtree:
 * - `preserve`: owner untouched in every owned domain — patch it through.
 * - `drop`: the owner was deleted; opaque companions must go with it.
 * - `conflict`: owned domains were edited — require an explicit downgrade
 *   or block the writeback; never silently keep or discard.
 */
export type UnknownSubtreeDecision = "preserve" | "drop" | "conflict";

export function evaluateUnknownSubtree({
	ownership,
	ownerDeleted,
	ownerDirtyDomains,
}: {
	ownership: UnknownSubtreeOwnership;
	ownerDeleted: boolean;
	ownerDirtyDomains: readonly InteropDirtyDomain[];
}): UnknownSubtreeDecision {
	if (ownerDeleted) return "drop";
	// A structural edit re-parents or re-shapes the node graph; unknown
	// children cannot be proven safe without re-verification.
	if (ownerDirtyDomains.includes("structure")) return "conflict";
	const owned = new Set(ownership.ownedDomains);
	for (const domain of ownerDirtyDomains) {
		if (owned.has(domain)) return "conflict";
	}
	return "preserve";
}

/** Decisions for a whole envelope's subtrees, keyed by foreignRef. */
export function evaluateUnknownSubtrees({
	subtrees,
	deletedOwnerIds,
	dirtyDomainsByOwnerId,
}: {
	subtrees: readonly UnknownSubtreeOwnership[];
	deletedOwnerIds: ReadonlySet<string>;
	dirtyDomainsByOwnerId: ReadonlyMap<string, readonly InteropDirtyDomain[]>;
}): Map<string, UnknownSubtreeDecision> {
	const decisions = new Map<string, UnknownSubtreeDecision>();
	for (const ownership of subtrees) {
		decisions.set(
			ownership.foreignRef,
			evaluateUnknownSubtree({
				ownership,
				ownerDeleted: deletedOwnerIds.has(ownership.ownerSemanticId),
				ownerDirtyDomains:
					dirtyDomainsByOwnerId.get(ownership.ownerSemanticId) ?? [],
			})
		);
	}
	return decisions;
}
