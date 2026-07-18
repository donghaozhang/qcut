/**
 * libass (used by the bundled FFmpeg for burned-in text and captions)
 * resolves fonts by name but performs no per-glyph fallback: a Latin-only
 * family such as Arial renders CJK content as notdef "tofu" boxes. When the
 * content needs CJK coverage, substitute a platform font that has it — CJK
 * fonts render Latin glyphs acceptably, the reverse does not hold.
 */
const CJK_CONTENT_PATTERN = /[⺀-鿿぀-ヿㇰ-ㇿ가-힯豈-﫿]/;

const CJK_FONT_BY_PLATFORM: Record<string, string> = {
	darwin: "Arial Unicode MS",
	win32: "Microsoft YaHei",
	linux: "Noto Sans CJK SC",
};

function runtimePlatform(): string {
	if (typeof window !== "undefined" && window.electronAPI?.platform) {
		return window.electronAPI.platform;
	}
	// Node contexts (CLI, main process) have no window; use process.platform.
	// biome-ignore lint/style/noRestrictedGlobals: Node-only fallback reads process.platform, never process.env; renderer path returns above
	return typeof process !== "undefined" ? process.platform : "darwin";
}

export function assCompatibleFontFamily({
	family,
	content,
}: {
	family: string;
	content: string;
}): string {
	if (!CJK_CONTENT_PATTERN.test(content)) return family;
	return CJK_FONT_BY_PLATFORM[runtimePlatform()] ?? "Noto Sans CJK SC";
}
