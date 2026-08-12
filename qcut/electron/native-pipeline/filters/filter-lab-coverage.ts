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

export interface FilterLabCoverageCard {
	resourceId: string;
	version?: string;
	/** Drives the dual-lut mask downgrade, matching the catalog gate. */
	implementation?: string;
}

export interface FilterLabCoverageRecord {
	resourceId: string;
	version?: string;
	status: "unverified" | "close" | "verified";
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
}): { status: FilterLabCoverageRecord["status"]; rgbRmse?: number } {
	const candidates = records.filter(
		(record) => record.resourceId === card.resourceId
	);
	const selected = selectVerificationForCard({
		candidates,
		...(card.version ? { version: card.version } : {}),
		...(card.implementation ? { implementation: card.implementation } : {}),
	});
	return {
		status: selected.status,
		...(selected.rgbRmse !== undefined ? { rgbRmse: selected.rgbRmse } : {}),
	};
}

export function buildFilterLabCoverageReport<
	Card extends FilterLabCoverageCard,
>({
	cards,
	records,
	strataOf,
}: {
	cards: Card[];
	records: FilterLabCoverageRecord[];
	strataOf: (card: Card) => string;
}): FilterLabCoverageReport {
	const strata = new Map<string, FilterLabCoverageStratum>();
	const totals = {
		cards: cards.length,
		verified: 0,
		close: 0,
		unverified: 0,
		recordedRuns: records.length,
	};
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
		stratum[status] += 1;
		totals[status] += 1;
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
		strata.set(key, stratum);
	}
	return {
		totals,
		strata: [...strata.values()].sort((left, right) =>
			left.key.localeCompare(right.key)
		),
	};
}
