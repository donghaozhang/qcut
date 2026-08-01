import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { create, type Font, type FontCollection } from "fontkit";

const MAXIMUM_FONT_BYTES = 128 * 1024 * 1024;

export interface MissingFontGlyph {
	character: string;
	codePoint: number;
	index: number;
	unicode: string;
}

export interface FontGlyphCoverageReport {
	familyName: string;
	fontPath: string;
	fullName: string;
	missing: MissingFontGlyph[];
	postscriptName: string;
	text: string;
}

export interface FontGlyphLookup {
	familyName: string;
	fullName: string;
	hasGlyphForCodePoint: (codePoint: number) => boolean;
	postscriptName: string;
}

function formatUnicode({ codePoint }: { codePoint: number }): string {
	return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function requireSingleFont({
	font,
	fontPath,
	postscriptName,
}: {
	font: Font | FontCollection | null;
	fontPath: string;
	postscriptName?: string;
}): Font {
	if (!font) {
		throw new Error(
			postscriptName
				? `Font ${fontPath} does not contain the requested PostScript name ${postscriptName}.`
				: `Font ${fontPath} could not be opened.`
		);
	}
	if (!("fonts" in font)) return font;
	if (!postscriptName) {
		const names = font.fonts
			.map((candidate) => candidate.postscriptName)
			.filter((name) => name.length > 0)
			.join(", ");
		throw new Error(
			`Font collection ${fontPath} requires a PostScript name. Available faces: ${names || "unknown"}.`
		);
	}
	const selectedFont = font.getFont(postscriptName);
	if (!selectedFont) {
		throw new Error(
			`Font collection ${fontPath} does not contain ${postscriptName}.`
		);
	}
	return selectedFont;
}

export function inspectLoadedFontGlyphCoverage({
	font,
	fontPath,
	text,
}: {
	font: FontGlyphLookup;
	fontPath: string;
	text: string;
}): FontGlyphCoverageReport {
	const missing = Array.from(text).flatMap((character, index) => {
		const codePoint = character.codePointAt(0);
		if (codePoint === undefined || font.hasGlyphForCodePoint(codePoint)) {
			return [];
		}
		return [
			{
				character,
				codePoint,
				index,
				unicode: formatUnicode({ codePoint }),
			},
		];
	});

	return {
		familyName: font.familyName,
		fontPath,
		fullName: font.fullName,
		missing,
		postscriptName: font.postscriptName,
		text,
	};
}

export function inspectFontBytesGlyphCoverage({
	fontBytes,
	fontPath,
	postscriptName,
	text,
}: {
	fontBytes: Buffer;
	fontPath: string;
	postscriptName?: string;
	text: string;
}): FontGlyphCoverageReport {
	if (fontBytes.length === 0 || fontBytes.length > MAXIMUM_FONT_BYTES) {
		throw new Error(
			`Font bytes must be between 1 and ${MAXIMUM_FONT_BYTES} bytes: ${fontPath}`
		);
	}
	const requestedPostscriptName = postscriptName?.trim() || undefined;
	const openedFont: Font | FontCollection | null = requestedPostscriptName
		? create(fontBytes, requestedPostscriptName)
		: create(fontBytes);
	const font = requireSingleFont({
		font: openedFont,
		fontPath,
		...(requestedPostscriptName
			? { postscriptName: requestedPostscriptName }
			: {}),
	});
	return inspectLoadedFontGlyphCoverage({ font, fontPath, text });
}

export async function inspectFontGlyphCoverage({
	fontPath,
	postscriptName,
	text,
}: {
	fontPath: string;
	postscriptName?: string;
	text: string;
}): Promise<FontGlyphCoverageReport> {
	const absoluteFontPath = resolve(fontPath);
	const fontStats = await stat(absoluteFontPath);
	if (!fontStats.isFile()) {
		throw new Error(`Font path is not a regular file: ${absoluteFontPath}`);
	}
	if (fontStats.size > MAXIMUM_FONT_BYTES) {
		throw new Error(
			`Font file exceeds ${MAXIMUM_FONT_BYTES} bytes: ${absoluteFontPath}`
		);
	}
	const fontBytes = await readFile(absoluteFontPath);
	return inspectFontBytesGlyphCoverage({
		fontBytes,
		fontPath: absoluteFontPath,
		...(postscriptName ? { postscriptName } : {}),
		text,
	});
}

export async function assertFontCoversText({
	fontPath,
	postscriptName,
	text,
}: {
	fontPath: string;
	postscriptName?: string;
	text: string;
}): Promise<FontGlyphCoverageReport> {
	const report = await inspectFontGlyphCoverage({
		fontPath,
		...(postscriptName ? { postscriptName } : {}),
		text,
	});
	if (report.missing.length === 0) return report;
	const missing = report.missing
		.map(({ character, unicode }) => `${character} (${unicode})`)
		.join(", ");
	throw new Error(
		`Font ${report.postscriptName || report.fullName} is missing glyphs: ${missing}.`
	);
}
