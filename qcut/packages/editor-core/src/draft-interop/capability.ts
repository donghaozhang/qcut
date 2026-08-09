/**
 * Interop capability states (JYI-001).
 *
 * Every track, segment, attachment, and resource carries its own capability;
 * a whole project never gets one fuzzy score. The four states and their
 * commit gates come from the bidirectional plan:
 *
 * - `exact`: QCut can edit it and write it back losslessly for the profile.
 * - `downgrade`: converts to an explicit static/approximate result; the user
 *   must accept the warning first.
 * - `opaque`: QCut does not edit it but preserves the original node and its
 *   references; only same-profile writeback with the node unchanged.
 * - `blocked`: cannot be represented or verified safely.
 *
 * @module @qcut/editor-core/draft-interop/capability
 */

export const INTEROP_CAPABILITIES = [
	"exact",
	"downgrade",
	"opaque",
	"blocked",
] as const;

export type InteropCapability = (typeof INTEROP_CAPABILITIES)[number];

const capabilitySet = new Set<string>(INTEROP_CAPABILITIES);

export function isInteropCapability(
	value: unknown
): value is InteropCapability {
	return typeof value === "string" && capabilitySet.has(value);
}

/** Strictness order: exact < downgrade < opaque < blocked. */
const CAPABILITY_RANK: Record<InteropCapability, number> = {
	exact: 0,
	downgrade: 1,
	opaque: 2,
	blocked: 3,
};

/**
 * A parent is only as capable as its least capable child: combining any set
 * of capabilities yields the strictest member (empty input is `exact` —
 * nothing constrains the parent).
 */
export function combineInteropCapabilities(
	values: readonly InteropCapability[]
): InteropCapability {
	let worst: InteropCapability = "exact";
	for (const value of values) {
		if (CAPABILITY_RANK[value] > CAPABILITY_RANK[worst]) {
			worst = value;
		}
	}
	return worst;
}

export interface InteropCapabilityAggregate {
	exact: number;
	downgrade: number;
	opaque: number;
	blocked: number;
	total: number;
	/** Strictest member — the parent's effective capability. */
	overall: InteropCapability;
}

export function aggregateInteropCapabilities({
	values,
}: {
	values: readonly InteropCapability[];
}): InteropCapabilityAggregate {
	const aggregate: InteropCapabilityAggregate = {
		exact: 0,
		downgrade: 0,
		opaque: 0,
		blocked: 0,
		total: values.length,
		overall: combineInteropCapabilities(values),
	};
	for (const value of values) {
		aggregate[value] += 1;
	}
	return aggregate;
}

export interface InteropCommitGateInput {
	capability: InteropCapability;
	/** All downgrade warnings for the node were explicitly accepted. */
	warningsAccepted: boolean;
	/** The write target is the same product and profile as the source. */
	sameProfile: boolean;
	/** The preserved original node has not been structurally invalidated. */
	nodeUnchanged: boolean;
}

/**
 * The plan's commit-gate table, verbatim: exact commits, downgrade commits
 * only after acceptance, opaque commits only same-profile with the node
 * unchanged, blocked never commits.
 */
export function canCommitInteropNode({
	capability,
	warningsAccepted,
	sameProfile,
	nodeUnchanged,
}: InteropCommitGateInput): boolean {
	switch (capability) {
		case "exact":
			return true;
		case "downgrade":
			return warningsAccepted;
		case "opaque":
			return sameProfile && nodeUnchanged;
		case "blocked":
			return false;
	}
}
