import { join } from "node:path";

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

export type FontCoverageAssertion = ({
	fontPath,
	postscriptName,
	text,
}: {
	fontPath: string;
	postscriptName?: string;
	text: string;
}) => Promise<FontGlyphCoverageReport>;

interface FontCoverageModule {
	assertFontCoversText: FontCoverageAssertion;
}

function isFontCoverageModule({ value }: { value: unknown }): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"assertFontCoversText" in value &&
		typeof value.assertFontCoversText === "function"
	);
}

export async function loadJianyingFontCoverageAssertion({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<FontCoverageAssertion> {
	const modulePath = join(
		projectRoot,
		"packages",
		"jianying-draft-export",
		"src",
		"font-glyph-coverage.ts"
	);
	const moduleValue: unknown = await import(modulePath);
	if (!isFontCoverageModule({ value: moduleValue })) {
		throw new Error(
			`@qcut/jianying-draft-export does not expose assertFontCoversText at ${modulePath}.`
		);
	}
	return (moduleValue as FontCoverageModule).assertFontCoversText;
}
