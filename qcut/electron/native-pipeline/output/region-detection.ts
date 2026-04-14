/**
 * Detect a novel's dominant cultural region from its text.
 *
 * Used at Stage 1 (`flow characters`) to pick a default ethnicity for
 * every character that the LLM extractor leaves blank. Keeps the cast
 * nationally coherent — no more Chinese sister + European brother in
 * the same drama — while still allowing per-character overrides by
 * editing `characters.json` before Stage 2 runs.
 *
 * Detection is deliberately deterministic (no LLM call). Signals:
 *   - Unicode script mix of the source text.
 *   - The `**Visual Style:**` / `**视频风格：**` header if present.
 *
 * Falls back to `undefined` when signals are weak — the CLI then leaves
 * each character's ethnicity empty rather than guess wrong.
 *
 * @module electron/native-pipeline/output/region-detection
 */

/** Coarse regional bucket. Kept small so detection stays reliable. */
export type Region =
	| "east-asian"
	| "southeast-asian"
	| "south-asian"
	| "middle-eastern"
	| "african"
	| "european"
	| "latin"
	| "mixed";

/** Region → default ethnicity descriptor slotted into portrait prompts. */
const REGION_ETHNICITY: Record<Region, string> = {
	"east-asian": "East Asian",
	"southeast-asian": "Southeast Asian",
	"south-asian": "South Asian",
	"middle-eastern": "Middle Eastern",
	african: "African",
	european: "European",
	latin: "Latin American",
	mixed: "",
};

/**
 * Map a region to the ethnicity string we inject into portrait prompts
 * when the character's own `ethnicity` field is empty. Returns empty
 * string for `mixed` since there's no single default to pick.
 */
export function regionDefaultEthnicity(region: Region): string {
	return REGION_ETHNICITY[region] ?? "";
}

/** Accepts string inputs like "east-asian" and narrows to the union. */
export function parseRegion(input: string | undefined): Region | undefined {
	if (!input) return undefined;
	const normalized = input.trim().toLowerCase();
	if (normalized in REGION_ETHNICITY) return normalized as Region;
	return undefined;
}

const CJK_RANGE = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const HIRAGANA_KATAKANA_RANGE = /[\u3040-\u30FF\u31F0-\u31FF]/;
const HANGUL_RANGE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const DEVANAGARI_RANGE = /[\u0900-\u097F]/;
const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F]/;
const CYRILLIC_RANGE = /[\u0400-\u04FF]/;
const THAI_RANGE = /[\u0E00-\u0E7F]/;

/**
 * Count characters in a text that match a given script range.
 *
 * Used as a cheap script-mix heuristic — the dominant non-Latin script
 * usually pins down the cast's origin within one or two buckets.
 */
function scriptRatio(text: string, range: RegExp): number {
	if (text.length === 0) return 0;
	let hits = 0;
	for (const ch of text) {
		if (range.test(ch)) hits++;
	}
	return hits / text.length;
}

/**
 * Detect the dominant cultural region of a novel.
 *
 * Returns `undefined` when no script clearly dominates — callers should
 * treat that as "don't guess, leave per-character ethnicity blank".
 *
 * Heuristic: pick the script bucket with the highest ratio above the
 * noise floor (3% of total chars). Japanese/Korean/Chinese all map to
 * `east-asian`; each bucket beyond that is a narrower script signature.
 */
export function detectRegion(
	novelText: string,
	styleHeader?: string
): Region | undefined {
	const body = novelText ?? "";
	const header = styleHeader ?? "";
	if (body.trim().length === 0 && header.trim().length === 0) return undefined;

	const regionScores = (text: string): Array<[Region, number]> => [
		["east-asian", scriptRatio(text, CJK_RANGE)],
		// Kana/hangul imply east-asian; don't double-count with CJK since
		// the max() step below already picks the stronger signal.
		[
			"east-asian",
			Math.max(
				scriptRatio(text, HIRAGANA_KATAKANA_RANGE),
				scriptRatio(text, HANGUL_RANGE)
			),
		],
		["south-asian", scriptRatio(text, DEVANAGARI_RANGE)],
		["middle-eastern", scriptRatio(text, ARABIC_RANGE)],
		["european", scriptRatio(text, CYRILLIC_RANGE)],
		["southeast-asian", scriptRatio(text, THAI_RANGE)],
	];

	const pickBest = (
		scores: Array<[Region, number]>
	): [Region | undefined, number] =>
		scores.reduce<[Region | undefined, number]>(
			(acc, [region, score]) => (score > acc[1] ? [region, score] : acc),
			[undefined, 0]
		);

	// ── Score the style header separately first. ────────────────
	// Header is the author's explicit cast direction (e.g.
	// "anime, 日式美学"); diluting it into a multi-KB novel would
	// bury the signal below the 3% body-level noise floor. A single
	// clear script hit in the header (≥20%) is enough to override.
	if (header.length > 0) {
		const [headerRegion, headerScore] = pickBest(regionScores(header));
		if (headerRegion && headerScore >= 0.2) return headerRegion;
	}

	// ── Fall back to body scoring with the noise floor. ──────────
	const [bestRegion, bestScore] = pickBest(regionScores(body));
	// 3% noise floor — below this, script hits are likely from names or
	// isolated borrowings and don't indicate a cast-level origin.
	if (!bestRegion || bestScore < 0.03) return undefined;
	return bestRegion;
}
