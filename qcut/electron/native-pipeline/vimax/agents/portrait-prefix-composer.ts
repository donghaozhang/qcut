/**
 * Compose the effective style prefix for portrait prompts.
 *
 * The prefix that lives at the front of every `portrait_prompt` has
 * two layers: the base **style** (e.g. `Modern anime film, soft
 * cel-shading, …`) and an optional **cast-quality snippet** that nudges
 * the model toward cleaner faces (`photogenic, sharp features, …`).
 *
 * Both layers are kept separately in `project.json` so a Stage 2
 * override of one doesn't accidentally wipe the other. The composer
 * joins them at prompt build / rewrite time.
 *
 * Region does **not** live in the prefix — it's applied per-character
 * via the `ethnicity` field on the subject descriptor, so the prefix
 * stays gender-aware while region stays character-granular.
 *
 * @module electron/native-pipeline/vimax/agents/portrait-prefix-composer
 */

import {
	castQualitySnippet,
	type CastGender,
	type CastQualityLevel,
} from "./cast-quality-presets.js";

export interface ComposeStylePrefixOptions {
	/** Base style string — preset-expanded or free-form. */
	style?: string;
	/** Cast-quality level for the project (gender-aware). */
	castQuality?: CastQualityLevel;
	/** Gender for the character we're composing for. */
	gender?: CastGender;
}

/**
 * Produce the `<castQualitySnippet>, <style>` string that precedes the
 * subject descriptor inside a portrait prompt. Returns the style as-is
 * when the level is `natural` (the snippet would be empty and we don't
 * want a dangling comma).
 */
export function composeStylePrefix(
	options: ComposeStylePrefixOptions
): string {
	const style = options.style?.trim();
	const level = options.castQuality ?? "natural";
	const gender: CastGender = options.gender ?? "unknown";
	const snippet = castQualitySnippet(level, gender).trim();

	if (!style && !snippet) return "";
	if (!style) return snippet;
	if (!snippet) return style;
	return `${snippet}, ${style}`;
}
