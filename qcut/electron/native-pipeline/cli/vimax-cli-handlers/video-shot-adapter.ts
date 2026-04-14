/**
 * Pure adapter from one shot + portrait catalogue → Seedance payload.
 *
 * Chooses the right Seedance 2.0 variant (ref2v / i2v / t2v) and
 * builds the exact payload we ship to the provider, without touching
 * fs or the network. Keeps the orchestrator (`video-handler.ts`) a
 * thin loop and makes variant-selection logic trivially unit-testable.
 *
 * Variant selection:
 *   - `firstFrameUrl` present       → i2v
 *   - any catalogued character      → ref2v
 *   - otherwise                     → t2v
 *
 * Family selection (`gmi` default, `fal` fallback when GMI is down):
 *   - GMI → endpoint `seedance-2-0-260128`, payload uses
 *     `reference_images` / `first_frame`, integer `duration`
 *   - FAL → endpoint `bytedance/seedance-2.0/<variant>`, payload uses
 *     `image_urls` / `image_url`, **string** `duration` (FAL schema
 *     validates duration as a string literal enum, not a number)
 *
 * Prompt sanitization strips stage-direction markers (`△`) and
 * dialogue speaker tags but keeps the text after them. Prompts
 * longer than 500 chars are truncated on a word boundary.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter
 */

/**
 * Which video family to target.
 *
 * - `gmi`  → GMI Seedance 2.0 260128 (single endpoint, internal variant dispatch).
 * - `fal`  → FAL Seedance 2.0 (one endpoint per variant).
 * - `vidu` → FAL Vidu Q3 ref2v mix. Only has a ref2v endpoint — shots
 *   with no catalogued characters or with a `firstFrameUrl` degrade
 *   cross-family to FAL Seedance 2.0 (same provider, adjacent model).
 */
export type SeedanceFamily = "gmi" | "fal" | "vidu";

/** Provider backend the adapter resolves to. */
export type SeedanceProvider = "gmi" | "fal";

/**
 * Concrete model variant produced by the adapter. The first three are
 * the GMI 260128 family (single endpoint, multiple variants); the
 * middle three are the FAL Seedance 2.0 family (one endpoint per
 * variant); `vidu_q3_ref2v_mix` is the FAL Vidu Q3 mix variant.
 */
export type SeedanceVariant =
	| "gmi_seedance_2_0_260128_ref2v"
	| "gmi_seedance_2_0_260128_i2v"
	| "gmi_seedance_2_0_260128_t2v"
	| "seedance_2_0_ref2v"
	| "seedance_2_0_i2v"
	| "seedance_2_0"
	| "vidu_q3_ref2v_mix";

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
	/** Provider-specific endpoint path (no leading slash, no host). */
	endpoint: string;
	/** Which provider backend `callModelApi` should use. */
	provider: SeedanceProvider;
	payload: Record<string, unknown>;
	referenceUrls: string[];
	skippedCharacters: string[];
	reason: string;
}

/**
 * Model key → GMI endpoint. Single source of truth for GMI Seedance 260128.
 *
 * Kept exported for backward compatibility — handler code that needs the
 * GMI endpoint directly (e.g. legacy callers) can still import it.
 * Prefer reading `adapted.endpoint` from `adaptShotForSeedance` output.
 */
export const SEEDANCE_ENDPOINT = "seedance-2-0-260128";

/** Default family when the caller doesn't pass one (matches old behavior). */
export const DEFAULT_SEEDANCE_FAMILY: SeedanceFamily = "gmi";

/** Map a CLI `--model` value to a SeedanceFamily. Throws on unknown keys. */
export function resolveSeedanceFamily(model: string | undefined): SeedanceFamily {
	if (!model) return DEFAULT_SEEDANCE_FAMILY;
	if (model === "gmi_seedance_2_0_260128" || model.startsWith("gmi_seedance_2_0_260128_")) {
		return "gmi";
	}
	if (model === "seedance_2_0" || model.startsWith("seedance_2_0_")) {
		return "fal";
	}
	if (model === "vidu_q3_ref2v_mix" || model.startsWith("vidu_q3")) {
		return "vidu";
	}
	throw new Error(
		`Unknown video model "${model}". Use "gmi_seedance_2_0_260128" (default), "seedance_2_0", or "vidu_q3_ref2v_mix".`
	);
}

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

/**
 * Provider-specific shape mappers. Each takes the family-neutral inputs
 * (prompt, duration, refs, etc.) and returns the `{variant, endpoint,
 * provider, payload}` triple the orchestrator hands to `callModelApi`.
 *
 * Why split: GMI 260128 uses one endpoint with internal variant
 * dispatch; FAL Seedance 2.0 uses three endpoints. Field names also
 * differ (reference_images vs image_urls; first_frame vs image_url).
 */

interface CommonShape {
	prompt: string;
	duration: number;
	resolution?: string;
	aspectRatio?: string;
	generateAudio?: boolean;
	seed?: number;
}

type VariantPayload = Pick<
	AdaptedShot,
	"variant" | "endpoint" | "provider" | "payload"
>;

function buildGmiI2V(common: CommonShape, firstFrameUrl: string): VariantPayload {
	const payload = baseGmiPayload(common);
	payload.first_frame = firstFrameUrl;
	return {
		variant: "gmi_seedance_2_0_260128_i2v",
		endpoint: SEEDANCE_ENDPOINT,
		provider: "gmi",
		payload,
	};
}

function buildGmiRef2V(common: CommonShape, refs: string[]): VariantPayload {
	const payload = baseGmiPayload(common);
	payload.reference_images = refs;
	return {
		variant: "gmi_seedance_2_0_260128_ref2v",
		endpoint: SEEDANCE_ENDPOINT,
		provider: "gmi",
		payload,
	};
}

function buildGmiT2V(common: CommonShape): VariantPayload {
	return {
		variant: "gmi_seedance_2_0_260128_t2v",
		endpoint: SEEDANCE_ENDPOINT,
		provider: "gmi",
		payload: baseGmiPayload(common),
	};
}

function baseGmiPayload(common: CommonShape): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		prompt: common.prompt,
		duration: common.duration, // GMI accepts integer
	};
	if (common.resolution) payload.resolution = common.resolution;
	if (common.aspectRatio) payload.ratio = common.aspectRatio;
	if (common.generateAudio != null) payload.generate_audio = common.generateAudio;
	if (common.seed != null) payload.seed = common.seed;
	return payload;
}

function buildFalI2V(common: CommonShape, firstFrameUrl: string): VariantPayload {
	const payload = baseFalPayload(common);
	payload.image_url = firstFrameUrl;
	return {
		variant: "seedance_2_0_i2v",
		endpoint: "bytedance/seedance-2.0/image-to-video",
		provider: "fal",
		payload,
	};
}

function buildFalRef2V(common: CommonShape, refs: string[]): VariantPayload {
	const payload = baseFalPayload(common);
	// FAL Seedance 2.0 ref2v field is `image_urls` (array, up to 9).
	payload.image_urls = refs;
	return {
		variant: "seedance_2_0_ref2v",
		endpoint: "bytedance/seedance-2.0/reference-to-video",
		provider: "fal",
		payload,
	};
}

function buildFalT2V(common: CommonShape): VariantPayload {
	return {
		variant: "seedance_2_0",
		endpoint: "bytedance/seedance-2.0/text-to-video",
		provider: "fal",
		payload: baseFalPayload(common),
	};
}

function baseFalPayload(common: CommonShape): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		prompt: common.prompt,
		// FAL schema validates duration as a string-literal enum
		// ('4'|'5'|...|'15'|'auto'). Coerce to string.
		duration: String(common.duration),
	};
	if (common.resolution) payload.resolution = common.resolution;
	// FAL uses `aspect_ratio`, not `ratio` (GMI's name).
	if (common.aspectRatio) payload.aspect_ratio = common.aspectRatio;
	if (common.generateAudio != null) payload.generate_audio = common.generateAudio;
	if (common.seed != null) payload.seed = common.seed;
	return payload;
}

/**
 * Build the Vidu Q3 Ref2V (mix) payload.
 *
 * Differs from both Seedance families — Vidu's quirks are:
 *   - field is `reference_image_urls` (plural, up to 4)
 *   - `duration` is a **number** (not string like FAL Seedance)
 *   - audio toggle is `audio: boolean` (not `generate_audio`)
 * See `electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts`
 * for the regression guards we mirror here.
 */
function buildViduRef2V(common: CommonShape, refs: string[]): VariantPayload {
	const payload: Record<string, unknown> = {
		prompt: common.prompt,
		duration: common.duration, // Vidu accepts integer — do NOT stringify
		reference_image_urls: refs,
	};
	if (common.resolution) payload.resolution = common.resolution;
	if (common.aspectRatio) payload.aspect_ratio = common.aspectRatio;
	if (common.generateAudio != null) payload.audio = common.generateAudio;
	if (common.seed != null) payload.seed = common.seed;
	return {
		variant: "vidu_q3_ref2v_mix",
		endpoint: "fal-ai/vidu/q3/reference-to-video/mix",
		provider: "fal",
		payload,
	};
}

/** Turn a `ShotInput` + a `name → url` map into a payload-ready AdaptedShot. */
export function adaptShotForSeedance(
	shot: ShotInput,
	portraits: Record<string, string>,
	family: SeedanceFamily = DEFAULT_SEEDANCE_FAMILY
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

	const common: CommonShape = {
		prompt,
		duration,
		resolution: shot.resolution,
		aspectRatio: shot.aspectRatio,
		generateAudio: shot.generateAudio,
		seed: shot.seed,
	};

	// ── Variant selection ────────────────────────────────────────
	// Vidu has only a ref2v endpoint — i2v and t2v shots degrade to the
	// adjacent FAL Seedance 2.0 variant (same provider, similar quality).
	// Callers see the cross-family degradation in `reason`.
	if (shot.firstFrameUrl) {
		const built =
			family === "fal" || family === "vidu"
				? buildFalI2V(common, shot.firstFrameUrl)
				: buildGmiI2V(common, shot.firstFrameUrl);
		return {
			...built,
			referenceUrls: [],
			skippedCharacters,
			reason:
				family === "vidu"
					? "i2v: firstFrameUrl provided, degrading to FAL Seedance 2.0 i2v (Vidu has no i2v endpoint)"
					: "i2v: firstFrameUrl provided (overrides ref2v)",
		};
	}
	if (referenceUrls.length > 0) {
		// Seedance accepts up to 4 reference images; truncate in a stable order.
		const refs = referenceUrls.slice(0, MAX_REFERENCES);
		const built =
			family === "vidu"
				? buildViduRef2V(common, refs)
				: family === "fal"
					? buildFalRef2V(common, refs)
					: buildGmiRef2V(common, refs);
		return {
			...built,
			referenceUrls: refs,
			skippedCharacters,
			reason: `ref2v: ${refs.length} catalogued character${refs.length === 1 ? "" : "s"}`,
		};
	}

	const built =
		family === "fal" || family === "vidu"
			? buildFalT2V(common)
			: buildGmiT2V(common);
	const baseReason =
		skippedCharacters.length > 0
			? `t2v: ${skippedCharacters.length} character${skippedCharacters.length === 1 ? "" : "s"} not catalogued, degrading`
			: "t2v: no characters referenced";
	return {
		...built,
		referenceUrls: [],
		skippedCharacters,
		reason:
			family === "vidu"
				? `${baseReason} (FAL Seedance 2.0 t2v — Vidu has no t2v endpoint)`
				: baseReason,
	};
}
