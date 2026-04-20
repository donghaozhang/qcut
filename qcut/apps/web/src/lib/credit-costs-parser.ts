/**
 * Parser for human-readable `price` strings on AI model registry entries.
 *
 * Turns things like:
 *   - `"$0.052/s"`          → { amountUsd: 0.052, unit: "per-second" }
 *   - `"$0.05-0.08/s"`      → { amountUsd: 0.08, unit: "per-second" }  (upper bound)
 *   - `"$0.30-0.50"`        → { amountUsd: 0.50, unit: "fixed" }
 *   - `"$0.336"`            → { amountUsd: 0.336, unit: "fixed" }
 *   - `"$0.025/1k chars"`   → { amountUsd: 0.025, unit: "per-1k-chars" }
 *   - `"$0.06/MP"`          → { amountUsd: 0.06, unit: "per-megapixel" }
 *   - `"TBD"` | `""` | `undefined` → null
 *
 * Range policy: always take the **upper bound** so users never get
 * surprise-billed on a premium tier (1080p, pro mode, audio, etc.).
 * The renderer UI can later surface a per-tier estimate, but the
 * charged amount is always the worst-case.
 */

export type PriceUnit =
	| "per-second"
	| "per-1k-chars"
	| "per-megapixel"
	| "fixed";

export interface ParsedPrice {
	/** Upper-bound USD amount per unit. */
	amountUsd: number;
	unit: PriceUnit;
}

/** `1 credit = $0.01` — inverse of CREDIT_USD_MULTIPLIER. */
export const CREDIT_USD_MULTIPLIER = 100;

/**
 * Parse a free-form price string into a structured amount + unit.
 * Returns `null` for "TBD", empty, or unparseable inputs — callers
 * should treat `null` as "unknown price, fall back to safe default".
 */
export function parsePriceString(raw: string | undefined): ParsedPrice | null {
	if (!raw || typeof raw !== "string") return null;
	const s = raw.trim();
	if (s.length === 0) return null;
	if (/^tbd$/i.test(s)) return null;

	// Unit detection — suffix-based. Order matters: check more specific
	// suffixes ("1k chars", "MP") before the generic "/s".
	let unit: PriceUnit = "fixed";
	if (/\/\s*1k\s*chars?/i.test(s)) {
		unit = "per-1k-chars";
	} else if (/\/\s*MP\b/i.test(s)) {
		unit = "per-megapixel";
	} else if (/\/s\b/i.test(s)) {
		unit = "per-second";
	}

	// Extract all numeric substrings (e.g., "0.05", "0.08" from "$0.05-0.08/s").
	const matches = [...s.matchAll(/(\d+(?:\.\d+)?)/g)];
	if (matches.length === 0) return null;

	const numbers = matches.map((m) => Number.parseFloat(m[1]));
	const valid = numbers.filter((n) => Number.isFinite(n));
	if (valid.length === 0) return null;

	// Upper bound — Math.max across whatever we extracted.
	const amountUsd = Math.max(...valid);
	if (amountUsd < 0) return null;

	return { amountUsd, unit };
}

export interface CreditComputeParams {
	durationSeconds?: number;
	characterCount?: number;
	/** Image resolution in megapixels — only used for `/MP` models. */
	megapixels?: number;
}

/**
 * Convert a parsed price into an integer credit amount. Uses the
 * worst-case tier (parsed amount is already the upper bound) and rounds
 * the final credit count — never the per-unit rate — so 0.052/s × 4s
 * × 100 = 20.8 → 21 credits, rather than round(5.2/s) × 4s = 20.
 *
 * Returns `null` when the price unit requires a param the caller
 * didn't supply (e.g. per-second without `durationSeconds`). The
 * renderer treats `null` as "don't deduct" rather than defaulting to
 * a wild guess — safer than over-charging for a model with no known
 * duration.
 */
export function creditsFromParsedPrice(
	price: ParsedPrice,
	params?: CreditComputeParams
): number | null {
	const { amountUsd, unit } = price;
	let rawCredits: number | null = null;
	switch (unit) {
		case "fixed":
			rawCredits = amountUsd * CREDIT_USD_MULTIPLIER;
			break;
		case "per-second":
			if (typeof params?.durationSeconds !== "number") return null;
			rawCredits = amountUsd * params.durationSeconds * CREDIT_USD_MULTIPLIER;
			break;
		case "per-1k-chars":
			if (typeof params?.characterCount !== "number") return null;
			rawCredits =
				(amountUsd * params.characterCount) / 1000 * CREDIT_USD_MULTIPLIER;
			break;
		case "per-megapixel":
			if (typeof params?.megapixels !== "number") return null;
			rawCredits = amountUsd * params.megapixels * CREDIT_USD_MULTIPLIER;
			break;
	}
	if (rawCredits == null || !Number.isFinite(rawCredits)) return null;
	if (rawCredits <= 0) return 0;
	return Math.max(1, Math.round(rawCredits));
}
