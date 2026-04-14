/**
 * Cast quality presets — attractiveness descriptors prepended to
 * portrait prompts without over-prompting.
 *
 * Three levels with gender-aware snippets. `natural` is a no-op
 * (keeps current behaviour). `photogenic` is the default — a short,
 * neutral descriptor that nudges the model toward cleaner, better-lit
 * faces without the uncanny/plastic look that "supermodel" spam
 * produces on flash-image models. `model-grade` is explicitly opt-in
 * for drama leads.
 *
 * Snippet vocabulary is deliberately small; adjective spam narrows
 * the face distribution and makes every character look the same.
 *
 * @module electron/native-pipeline/vimax/agents/cast-quality-presets
 */

/** Canonical cast-quality level slug. ASCII lowercase kebab-case. */
export type CastQualityLevel = "natural" | "photogenic" | "model-grade";

/** Gender hint used to pick snippet variants. */
export type CastGender = "male" | "female" | "unknown";

export const DEFAULT_CAST_QUALITY: CastQualityLevel = "natural";

/**
 * Snippet table: level × gender → prompt fragment.
 *
 * `unknown` gender intentionally uses the more neutral phrasing from
 * the female side; the "editorial beauty" note is gender-neutral while
 * "male-model features" would misread on a scene with an extra whose
 * gender the extractor didn't capture.
 */
const SNIPPETS: Record<CastQualityLevel, Record<CastGender, string>> = {
	natural: { male: "", female: "", unknown: "" },
	photogenic: {
		male: "photogenic, sharp features, clean complexion",
		female: "photogenic, refined features, clean complexion",
		unknown: "photogenic, refined features, clean complexion",
	},
	"model-grade": {
		// `editorial` dropped — nano-banana-pro / Gemini Image treats
		// it as "editorial publication context" and wraps the subject
		// in magazine-page / Instagram-post UI chrome. Anchor with
		// `cinematic portrait` instead (says "single portrait shot",
		// same quality signal, no publication association). Verified
		// on 周助理 2026-04-15 — Instagram UI disappeared.
		male: "male-model features, sculpted jawline, clean complexion, cinematic portrait",
		female:
			"K-pop idol styling, refined features, clean complexion, cinematic portrait",
		unknown: "refined features, clean complexion, cinematic portrait",
	},
};

/** Parse a CLI `--cast-quality` value into the union. Returns undefined on unknown keys. */
export function parseCastQuality(
	input: string | undefined
): CastQualityLevel | undefined {
	if (!input) return undefined;
	const normalized = input.trim().toLowerCase();
	if (normalized in SNIPPETS) return normalized as CastQualityLevel;
	return undefined;
}

/** Normalize any free-form gender string from `characters.json` into our union. */
export function normalizeCastGender(gender: string | undefined): CastGender {
	if (!gender) return "unknown";
	const lower = gender.trim().toLowerCase();
	if (lower.startsWith("m") || lower.includes("男") || lower === "man") {
		return "male";
	}
	if (
		lower.startsWith("f") ||
		lower.startsWith("w") ||
		lower.includes("女") ||
		lower === "woman"
	) {
		return "female";
	}
	return "unknown";
}

/**
 * Look up the snippet for a given level + gender. Returns empty string
 * for `natural` (so callers can safely concat without conditionals).
 */
export function castQualitySnippet(
	level: CastQualityLevel,
	gender: CastGender
): string {
	return SNIPPETS[level][gender] ?? "";
}

/** Available slugs, useful for help text / error messages. */
export function listCastQualityLevels(): string {
	return (Object.keys(SNIPPETS) as CastQualityLevel[]).join("|");
}
