/**
 * The ONE rule that decides which stored verification counts for a filter
 * card. The catalog join (jianying-filter-lab-catalog.ts) and the coverage
 * report (native-pipeline/filters/filter-lab-coverage.ts) must agree, or
 * `filter-lab catalog` and `filter-lab coverage` contradict each other —
 * so both delegate here.
 *
 * Rules, in order:
 * 1. version gate — when the card has a version, only records with exactly
 *    that version count (a record without a version does not);
 * 2. latest wins — among the surviving candidates, the newest verifiedAt;
 * 3. dual-lut mask downgrade — a dual-LUT card is only as verified as its
 *    mask evidence: without maskEdgeMae the result reports as unverified.
 */
import type { JianyingFilterVerification } from "./jianying-filter-lab-contract.js";

export const UNVERIFIED_VERIFICATION: JianyingFilterVerification = {
	status: "unverified",
};

export type JianyingFilterVerificationCandidates =
	| JianyingFilterVerification
	| JianyingFilterVerification[];

export function selectVerificationForCard({
	candidates,
	version,
	implementation,
}: {
	candidates: JianyingFilterVerificationCandidates | undefined;
	version?: string;
	implementation?: string;
}): JianyingFilterVerification {
	let list: JianyingFilterVerification[] = [];
	if (Array.isArray(candidates)) {
		list = candidates;
	} else if (candidates) {
		list = [candidates];
	}
	let chosen: JianyingFilterVerification | undefined;
	for (const record of list) {
		if (version && record.version !== version) continue;
		if (!chosen || (chosen.verifiedAt ?? "") <= (record.verifiedAt ?? "")) {
			chosen = record;
		}
	}
	if (!chosen) return UNVERIFIED_VERIFICATION;
	if (
		implementation === "dual-lut" &&
		chosen.status !== "unverified" &&
		chosen.maskEdgeMae === undefined
	) {
		return { ...chosen, status: "unverified" };
	}
	return chosen;
}
