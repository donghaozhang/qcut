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
	| "per-minute"
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
	// suffixes ("1k chars", "MP", "min") before the generic "/s".
	let unit: PriceUnit = "fixed";
	let numericPart = s;
	if (/\/\s*1k\s*chars?/i.test(s)) {
		unit = "per-1k-chars";
		// Strip the "/1k chars" suffix so the "1" inside "1k" doesn't leak
		// into number extraction below (regression fix).
		numericPart = s.replace(/\/\s*1k\s*chars?/i, "");
	} else if (/\/\s*MP\b/i.test(s)) {
		unit = "per-megapixel";
		numericPart = s.replace(/\/\s*MP\b/i, "");
	} else if (/\/\s*min\b/i.test(s)) {
		unit = "per-minute";
		numericPart = s.replace(/\/\s*min\b/i, "");
	} else if (/\/s\b/i.test(s)) {
		unit = "per-second";
		numericPart = s.replace(/\/s\b/i, "");
	}

	// Extract all numeric substrings (e.g., "0.05", "0.08" from "$0.05-0.08/s").
	const matches = [...numericPart.matchAll(/(\d+(?:\.\d+)?)/g)];
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
	/** Audio duration in minutes — used for `/min` models. */
	minutes?: number;
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
		case "per-minute":
			if (typeof params?.minutes === "number") {
				rawCredits = amountUsd * params.minutes * CREDIT_USD_MULTIPLIER;
			} else if (typeof params?.durationSeconds === "number") {
				// Accept durationSeconds as an alternative so callers that only
				// know about seconds (most video pipelines) don't need a second
				// param for audio-only per-minute models.
				rawCredits =
					((amountUsd * params.durationSeconds) / 60) * CREDIT_USD_MULTIPLIER;
			} else {
				return null;
			}
			break;
		case "per-1k-chars":
			if (typeof params?.characterCount !== "number") return null;
			rawCredits =
				((amountUsd * params.characterCount) / 1000) * CREDIT_USD_MULTIPLIER;
			break;
		case "per-megapixel":
			if (typeof params?.megapixels !== "number") return null;
			rawCredits = amountUsd * params.megapixels * CREDIT_USD_MULTIPLIER;
			break;
	}
	if (rawCredits == null || !Number.isFinite(rawCredits)) return null;
	if (rawCredits <= 0) return 0;
	// Snap to 6-decimal precision before rounding so floating-point noise
	// on inputs like 0.015 × 60 / 60 × 100 = 1.4999999… doesn't round DOWN
	// to 1 when the arithmetically-exact answer is 1.5.
	const snapped = Math.round(rawCredits * 1e6) / 1e6;
	return Math.max(1, Math.round(snapped));
}
