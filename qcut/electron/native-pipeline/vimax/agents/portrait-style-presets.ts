/**
 * Portrait style presets + resolver.
 *
 * `--style` on `flow characters` / `flow portraits` / `flow novel2movie`
 * accepts either:
 *   - a preset slug (e.g. "anime", "photorealistic") which expands to a
 *     tight ≤10-word / ≤5-phrase style prompt tuned for GMI's flash-image
 *     model, or
 *   - a free-form style string, which is passed through unchanged.
 *
 * The slug set is intentionally small (8 entries) so the visual gap
 * between presets stays large — finer nuance lives in free-form text.
 *
 * Prompt-language policy:
 *   - Styles that originate in Chinese media stay in Chinese
 *     (`photorealistic` → 中国电视剧质感, `chinese-ink` → 水墨).
 *   - Western-origin concepts use English so the tokens align with the
 *     image model's stronger training signal ("anime", "Ghibli",
 *     "Pixar", "cyberpunk", "film noir").
 *
 * @module electron/native-pipeline/vimax/agents/portrait-style-presets
 */

/** Canonical preset slug. ASCII lowercase kebab-case. */
export type PortraitStyleSlug =
	| "photorealistic"
	| "anime"
	| "ghibli"
	| "3d-animation"
	| "chinese-ink"
	| "watercolor"
	| "cyberpunk"
	| "noir";

/** Descriptor for one preset entry. */
export interface PortraitStylePreset {
	slug: PortraitStyleSlug;
	label_en: string;
	label_zh: string;
	/**
	 * The style prompt that gets prepended to character descriptions.
	 * Kept under ~10 words/phrases, with the style anchor first.
	 */
	prompt: string;
}

/** Full preset registry. Order is display order for help output. */
export const PORTRAIT_STYLE_PRESETS: readonly PortraitStylePreset[] = [
	{
		slug: "photorealistic",
		label_en: "Photorealistic (live-action TV drama)",
		label_zh: "真人写实",
		prompt: "真人写实，电视剧质感，自然光，肤质细腻，暖色调",
	},
	{
		slug: "anime",
		label_en: "Anime (modern anime film)",
		label_zh: "动漫",
		// Picked over the alternative
		// "Anime portrait, cel-shaded, large glossy eyes, crisp linework"
		// after a 2026-04-13 side-by-side review on `drama-example.md`.
		// Four independent axes, no redundancy:
		//   medium (modern anime film) + technique (soft cel-shading)
		//   + expression (eyes) + lighting (cinematic).
		prompt: "Modern anime film, soft cel-shading, expressive eyes, cinematic light",
	},
	{
		slug: "ghibli",
		label_en: "Studio Ghibli",
		label_zh: "吉卜力",
		prompt: "Ghibli hand-drawn, soft pastel, nostalgic, pastoral warmth",
	},
	{
		slug: "3d-animation",
		label_en: "3D animation (Pixar/DreamWorks)",
		label_zh: "三维动画",
		prompt: "Pixar-style 3D render, stylized, soft rim light",
	},
	{
		slug: "chinese-ink",
		label_en: "Chinese ink painting",
		label_zh: "水墨",
		prompt: "水墨画风，留白意境，墨色浓淡，笔锋飘逸",
	},
	{
		slug: "watercolor",
		label_en: "Watercolor painting",
		label_zh: "水彩",
		prompt: "Watercolor painting, soft edges, paper texture, translucent",
	},
	{
		slug: "cyberpunk",
		label_en: "Cyberpunk",
		label_zh: "赛博朋克",
		prompt: "Cyberpunk neon, chromatic glow, rain-slick street, dystopian",
	},
	{
		slug: "noir",
		label_en: "Film noir",
		label_zh: "黑白电影",
		prompt: "Film noir, high-contrast black-and-white, deep shadows, smoky",
	},
] as const;

/** Look up a preset by its slug, case-insensitive. */
export function findPortraitStylePreset(
	value: string | undefined
): PortraitStylePreset | undefined {
	if (!value) return undefined;
	const normalised = value.trim().toLowerCase();
	return PORTRAIT_STYLE_PRESETS.find((p) => p.slug === normalised);
}

/**
 * Resolve the effective style string used at portrait / storyboard time.
 *
 * Precedence:
 *   1. `styleInput` (from `--style`) when it is a non-empty string:
 *      - If it matches a preset slug → expand to the preset prompt.
 *      - Otherwise → pass through as free-form text.
 *   2. `fallback` (e.g. the novel's `**Visual Style:**` header).
 *   3. `undefined` so the caller keeps whatever default it has.
 *
 * Never throws; never emits network calls.
 */
export function resolvePortraitStyle(
	styleInput: string | undefined,
	fallback?: string
): string | undefined {
	const trimmed = styleInput?.trim();
	if (trimmed && trimmed.length > 0) {
		const preset = findPortraitStylePreset(trimmed);
		return preset ? preset.prompt : trimmed;
	}
	const trimmedFallback = fallback?.trim();
	return trimmedFallback && trimmedFallback.length > 0
		? trimmedFallback
		: undefined;
}

/** Comma-separated list of slugs, handy for help text. */
export function listPortraitStyleSlugs(): string {
	return PORTRAIT_STYLE_PRESETS.map((p) => p.slug).join("|");
}

/**
 * Swap the leading style prefix on a baked portrait prompt.
 *
 * Stage 1 (`flow characters`) bakes the visual style into each
 * character's `portrait_prompt` via `composePortraitPrompt(...)`,
 * producing strings like:
 *
 *     "真人写实, 电视风格, 暖色调, early 20s female, long dark hair, ..."
 *
 * When Stage 2 is invoked with a different `--style`, the baked
 * prefix needs to be replaced or the new style is silently ignored.
 *
 * Behaviour:
 *   - When `oldStyle` and `newStyle` are equal (or one is missing),
 *     the prompt is returned unchanged.
 *   - When `prompt` starts with `${oldStyle}, `, that prefix is
 *     replaced with `${newStyle}, `.
 *   - When the prompt does not start with `oldStyle`, the helper
 *     prepends `${newStyle}, ` so the new style still takes effect
 *     even if Stage 1's bake used a different exact string.
 *
 * Pure / no I/O.
 */
export function rewritePortraitPromptStyle(
	prompt: string,
	oldStyle: string | undefined,
	newStyle: string | undefined
): string {
	if (!newStyle || !newStyle.trim()) return prompt;
	if (oldStyle && oldStyle.trim() === newStyle.trim()) return prompt;

	const newPrefix = newStyle.trim();
	if (oldStyle && oldStyle.trim().length > 0) {
		const oldPrefix = oldStyle.trim();
		// Trailing comma+space matches what composePortraitPrompt joins on.
		const literal = `${oldPrefix}, `;
		if (prompt.startsWith(literal)) {
			return `${newPrefix}, ${prompt.slice(literal.length)}`;
		}
	}

	// Old style not at the front (or unknown) — prepend the new one
	// so the model still sees it before the character description.
	return `${newPrefix}, ${prompt}`;
}
