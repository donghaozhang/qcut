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

export function canvasFontFamily(family?: string): string {
	const cleaned = (family ?? "").replaceAll('"', "").trim();
	return cleaned
		? `"${cleaned}", ${CANVAS_FONT_FALLBACKS}`
		: CANVAS_FONT_FALLBACKS;
}
