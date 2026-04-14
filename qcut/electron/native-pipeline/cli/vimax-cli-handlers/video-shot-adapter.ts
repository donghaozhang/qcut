/**
 * Pure adapter from one shot + portrait catalogue → Seedance payload.
 *
 * Chooses the right GMI Seedance 2.0 variant (ref2v / i2v / t2v) and
 * builds the exact payload we ship to the provider, without touching
 * fs or the network. Keeps the orchestrator (`video-handler.ts`) a
 * thin loop and makes variant-selection logic trivially unit-testable.
 *
 * Variant selection:
 *   - `firstFrameUrl` present       → i2v
 *   - any catalogued character      → ref2v
 *   - otherwise                     → t2v
 *
 * Prompt sanitization strips stage-direction markers (`△`) and
 * dialogue speaker tags but keeps the text after them. Prompts
 * longer than 500 chars are truncated on a word boundary.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter
 */

export type SeedanceVariant =
	| "gmi_seedance_2_0_260128_ref2v"
	| "gmi_seedance_2_0_260128_i2v"
	| "gmi_seedance_2_0_260128_t2v";

export interface ShotInput {
	shotId: string;
	description: string;
	characters: string[];
	durationSeconds?: number;
	firstFrameUrl?: string;
	aspectRatio?: string;
	resolution?: string;
	generateAudio?: boolean;
	seed?: number;
}

export interface AdaptedShot {
	variant: SeedanceVariant;
	payload: Record<string, unknown>;
	referenceUrls: string[];
	skippedCharacters: string[];
	reason: string;
}

/** Model key → GMI endpoint. Single source of truth for the adapter. */
export const SEEDANCE_ENDPOINT = "seedance-2-0-260128";

const MIN_DURATION = 4;
const MAX_DURATION = 15;
const MAX_REFERENCES = 4;
const MAX_PROMPT_CHARS = 500;

/** Clamp a duration to the 4-15 integer range Seedance accepts. */
export function clampDuration(value: number | undefined): number {
	const n = Number.isFinite(value) ? Math.round(Number(value)) : 5;
	if (n < MIN_DURATION) return MIN_DURATION;
	if (n > MAX_DURATION) return MAX_DURATION;
	return n;
}

/**
 * Sanitize a shot description into a Seedance-friendly prompt.
 *
 * Rules (deterministic, no LLM):
 *   - Strip leading `△` from each line (stage-direction marker).
 *   - Strip short speaker tags like `<name>:` or `<name>（<note>）:`.
 *   - Collapse whitespace runs.
 *   - Truncate to 500 chars on a word boundary.
 */
export function sanitizeShotPrompt(raw: string): string {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => {
			// Remove leading stage-direction markers; they're punctuation, not content.
			let text = line.replace(/^△+\s*/u, "");
			// Strip speaker tags of the form "Name:" or "Name（note）：" at the start.
			// Allow 1-30 chars of name (CJK or Latin) followed by optional
			// parenthetical, then a colon (ASCII or fullwidth).
			text = text.replace(
				/^([\p{L}\p{N}·\-_ ]{1,30})(?:（[^）]{0,30}）)?\s*[：:]\s*/u,
				""
			);
			return text.trim();
		})
		.filter((line) => line.length > 0);

	let combined = lines.join(" ");
	combined = combined.replace(/\s+/g, " ").trim();

	if (combined.length <= MAX_PROMPT_CHARS) return combined;

	// Truncate on the last whitespace boundary within the window.
	const slice = combined.slice(0, MAX_PROMPT_CHARS);
	const lastSpace = slice.lastIndexOf(" ");
	if (lastSpace > MAX_PROMPT_CHARS * 0.7) return slice.slice(0, lastSpace);
	return slice;
}

/** Turn a `ShotInput` + a `name → url` map into a payload-ready AdaptedShot. */
export function adaptShotForSeedance(
	shot: ShotInput,
	portraits: Record<string, string>
): AdaptedShot {
	const duration = clampDuration(shot.durationSeconds);
	const prompt = sanitizeShotPrompt(shot.description || "");

	// Partition referenced characters into catalogued vs. skipped.
	const referenceUrls: string[] = [];
	const skippedCharacters: string[] = [];
	const seen = new Set<string>();
	for (const name of shot.characters ?? []) {
		if (typeof name !== "string" || name.length === 0) continue;
		const url = portraits[name];
		if (url && !seen.has(url)) {
			referenceUrls.push(url);
			seen.add(url);
		} else if (!url) {
			skippedCharacters.push(name);
		}
	}

	const payload: Record<string, unknown> = {
		prompt,
		duration,
	};
	if (shot.resolution) payload.resolution = shot.resolution;
	if (shot.aspectRatio) payload.ratio = shot.aspectRatio;
	if (shot.generateAudio != null) payload.generate_audio = shot.generateAudio;
	if (shot.seed != null) payload.seed = shot.seed;

	// ── Variant selection ────────────────────────────────────────
	if (shot.firstFrameUrl) {
		payload.first_frame = shot.firstFrameUrl;
		return {
			variant: "gmi_seedance_2_0_260128_i2v",
			payload,
			referenceUrls: [],
			skippedCharacters,
			reason: "i2v: firstFrameUrl provided (overrides ref2v)",
		};
	}
	if (referenceUrls.length > 0) {
		// Seedance accepts up to 4 reference images; truncate in a stable order.
		const refs = referenceUrls.slice(0, MAX_REFERENCES);
		payload.reference_images = refs;
		return {
			variant: "gmi_seedance_2_0_260128_ref2v",
			payload,
			referenceUrls: refs,
			skippedCharacters,
			reason: `ref2v: ${refs.length} catalogued character${refs.length === 1 ? "" : "s"}`,
		};
	}

	return {
		variant: "gmi_seedance_2_0_260128_t2v",
		payload,
		referenceUrls: [],
		skippedCharacters,
		reason:
			skippedCharacters.length > 0
				? `t2v: ${skippedCharacters.length} character${skippedCharacters.length === 1 ? "" : "s"} not catalogued, degrading`
				: "t2v: no characters referenced",
	};
}
