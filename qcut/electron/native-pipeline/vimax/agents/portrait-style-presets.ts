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
		label_en: "Anime (Japanese animation)",
		label_zh: "动漫",
		// Validated against `drama-example.md` 2026-04-13: produces a
		// mature, drama-appropriate face on adult characters — the
		// "large glossy eyes + crisp linework" combo did NOT push toward
		// moé as initially feared. Picked as canonical after side-by-side
		// review with a "Modern anime film, ..." alternative.
		prompt: "Anime portrait, cel-shaded, large glossy eyes, crisp linework",
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
