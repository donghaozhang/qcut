/**
 * CJK-safe font stack for canvas text rendering.
 *
 * OffscreenCanvas (used by the frame cache and export renderers) does not get
 * the automatic per-glyph system font fallback that DOM text enjoys: a family
 * without CJK coverage (e.g. Arial) renders Chinese characters as .notdef
 * "tofu" boxes. Every canvas font string must therefore list CJK-capable
 * families explicitly.
 */
const CANVAS_FONT_FALLBACKS =
	'"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';

/** Quoting a CSS generic keyword turns it into a literal family name. */
const GENERIC_FONT_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
]);

export function canvasFontFamily(family?: string): string {
	const cleaned = (family ?? "").replaceAll('"', "").trim();
	if (!cleaned) return CANVAS_FONT_FALLBACKS;
	if (GENERIC_FONT_FAMILIES.has(cleaned.toLowerCase())) {
		return `${cleaned.toLowerCase()}, ${CANVAS_FONT_FALLBACKS}`;
	}
	return `"${cleaned}", ${CANVAS_FONT_FALLBACKS}`;
}
