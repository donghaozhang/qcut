/**
 * Coverage aggregation over verification records (FLP-004): turns the
 * per-run parity records into a stratified report, so "how much of the
 * catalog is actually verified" is a number instead of a feeling.
 *
 * Pure functions only — callers supply catalog cards and store records.
 * Which record counts for a card is decided by the shared gate in
 * electron/jianying-filter-verification-gate.ts, the same one the catalog
 * badge uses.
 */
import { selectVerificationForCard } from "../../jianying-filter-verification-gate.js";
import type { JianyingFilterVerificationReferenceKind } from "../../jianying-filter-lab-contract.js";

export interface FilterLabCoverageCard {
	resourceId: string;
	title?: string;
	version?: string;
	/** Drives the dual-lut mask downgrade, matching the catalog gate. */
	implementation?: string;
	cacheStatus?: string;
	available?: boolean;
}

export interface FilterLabCoverageRecord {
	resourceId: string;
	version?: string;
	status: "unverified" | "close" | "verified";
	referenceKind?: JianyingFilterVerificationReferenceKind;
	rgbRmse?: number;
	/** Present only when a mask was compared; gates dual-lut verification. */
	maskEdgeMae?: number;
	verifiedAt: string;
}

export interface FilterLabCoverageStratum {
	key: string;
	total: number;
	verified: number;
	close: number;
	unverified: number;
	/** rgbRmse range over this stratum's counted records, when any exist. */
	bestRmse?: number;
	worstRmse?: number;
}

export interface FilterLabCoverageReport {
	totals: {
		cards: number;
		verified: number;
		close: number;
		unverified: number;
		/** All stored runs, including ones not counted against a card. */
		recordedRuns: number;
	};
	strata: FilterLabCoverageStratum[];
	gaps: Record<FilterLabCoverageGap, number>;
	details?: FilterLabCoverageDetail[];
}

export type FilterLabCoverageGap =
	| "verified"
	| "close"
	| "unverified-result"
	| "missing-reference"
	| "missing-mask-evidence"
	| "offline-resource-missing"
	| "implementation-unknown";

export interface FilterLabCoverageDetail {
	resourceId: string;
	title?: string;
	version?: string;
	implementation?: string;
	cacheStatus?: string;
	available?: boolean;
	status: FilterLabCoverageRecord["status"];
	gap: FilterLabCoverageGap;
	rgbRmse?: number;
	verifiedAt?: string;
}

interface EffectiveFilterLabCoverageRecord {
	status: FilterLabCoverageRecord["status"];
	rgbRmse?: number;
	maskEdgeMae?: number;
	verifiedAt?: string;
}

/**
 * The status that counts for a card. Delegates to the shared gate so this
 * report and the `filter-lab catalog` badge can never disagree.
 */
function effectiveRecordFor<Card extends FilterLabCoverageCard>({
	card,
	records,
}: {
	card: Card;
	records: FilterLabCoverageRecord[];
}): EffectiveFilterLabCoverageRecord {
	const candidates = records.filter(
		(record) => record.resourceId === card.resourceId
	);
	const selected = selectVerificationForCard({
		candidates,
		...(card.version ? { version: card.version } : {}),
		...(card.implementation ? { implementation: card.implementation } : {}),
	});
	return selected;
}

function gapFor<Card extends FilterLabCoverageCard>({
	card,
	record,
}: {
	card: Card;
	record: EffectiveFilterLabCoverageRecord;
}): FilterLabCoverageGap {
	if (record.status === "verified") return "verified";
	if (record.status === "close") return "close";
	if (!record.verifiedAt) {
		if (card.available === false) return "offline-resource-missing";
		if (card.implementation === "unknown") return "implementation-unknown";
		return "missing-reference";
	}
	if (card.implementation === "dual-lut" && record.maskEdgeMae === undefined) {
		return "missing-mask-evidence";
	}
	return "unverified-result";
}

export function buildFilterLabCoverageReport<
	Card extends FilterLabCoverageCard,
>({
	cards,
	records,
	strataOf,
	includeDetails = false,
}: {
	cards: Card[];
	records: FilterLabCoverageRecord[];
	strataOf: (card: Card) => string;
	includeDetails?: boolean;
}): FilterLabCoverageReport {
	const strata = new Map<string, FilterLabCoverageStratum>();
	const totals = {
		cards: cards.length,
		verified: 0,
		close: 0,
		unverified: 0,
		recordedRuns: records.length,
	};
	const gaps: Record<FilterLabCoverageGap, number> = {
		verified: 0,
		close: 0,
		"unverified-result": 0,
		"missing-reference": 0,
		"missing-mask-evidence": 0,
		"offline-resource-missing": 0,
		"implementation-unknown": 0,
	};
	const details: FilterLabCoverageDetail[] = [];
	for (const card of cards) {
		const key = strataOf(card);
		const stratum = strata.get(key) ?? {
			key,
			total: 0,
			verified: 0,
			close: 0,
			unverified: 0,
		};
		stratum.total += 1;
		const record = effectiveRecordFor({ card, records });
		const status = record.status;
		const gap = gapFor({ card, record });
		stratum[status] += 1;
		totals[status] += 1;
		gaps[gap] += 1;
		if (record.rgbRmse !== undefined && status !== "unverified") {
			stratum.bestRmse =
				stratum.bestRmse === undefined
					? record.rgbRmse
					: Math.min(stratum.bestRmse, record.rgbRmse);
			stratum.worstRmse =
				stratum.worstRmse === undefined
					? record.rgbRmse
					: Math.max(stratum.worstRmse, record.rgbRmse);
		}
		if (includeDetails) {
			details.push({
				resourceId: card.resourceId,
				...(card.title ? { title: card.title } : {}),
				...(card.version ? { version: card.version } : {}),
				...(card.implementation ? { implementation: card.implementation } : {}),
				...(card.cacheStatus ? { cacheStatus: card.cacheStatus } : {}),
				...(card.available !== undefined ? { available: card.available } : {}),
				status,
				gap,
				...(record.rgbRmse !== undefined ? { rgbRmse: record.rgbRmse } : {}),
				...(record.verifiedAt ? { verifiedAt: record.verifiedAt } : {}),
			});
		}
		strata.set(key, stratum);
	}
	return {
		totals,
		gaps,
		strata: [...strata.values()].sort((left, right) =>
			left.key.localeCompare(right.key)
		),
		...(includeDetails ? { details } : {}),
	};
}
