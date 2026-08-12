/**
 * Coverage aggregation over verification records (FLP-004): turns the
 * per-run parity records into a stratified report, so "how much of the
 * catalog is actually verified" is a number instead of a feeling.
 *
 * Pure functions only — callers supply catalog cards and store records.
 */

export interface FilterLabCoverageCard {
	resourceId: string;
	version?: string;
}

export interface FilterLabCoverageRecord {
	resourceId: string;
	version?: string;
	status: "unverified" | "close" | "verified";
	rgbRmse?: number;
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
 * The latest record that counts for a card. Mirrors the catalog join's
 * version gate: a record only counts when its version matches the card's
 * (or either side has no version to compare).
 */
function effectiveRecordFor<Card extends FilterLabCoverageCard>({
	card,
	records,
}: {
	card: Card;
	records: FilterLabCoverageRecord[];
}): FilterLabCoverageRecord | undefined {
	let latest: FilterLabCoverageRecord | undefined;
	for (const record of records) {
		if (record.resourceId !== card.resourceId) continue;
		if (record.version && card.version && record.version !== card.version) {
			continue;
		}
		if (!latest || latest.verifiedAt <= record.verifiedAt) latest = record;
	}
	return latest;
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
		const status = record?.status ?? "unverified";
		stratum[status] += 1;
		totals[status] += 1;
		if (record?.rgbRmse !== undefined && status !== "unverified") {
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
