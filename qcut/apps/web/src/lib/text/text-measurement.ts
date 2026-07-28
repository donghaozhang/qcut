import { segmentText } from "@qcut/editor-core/text-animation";

export type TextWidthMeasurer = ({
	font,
	text,
}: {
	font: string;
	text: string;
}) => number;

export type TextLineWidthMeasurer = ({ text }: { text: string }) => number;

function getFallbackCharacterAdvance({
	character,
	fontSize,
}: {
	character: string;
	fontSize: number;
}): number {
	if (/\p{Mark}/u.test(character)) return 0;
	if (/\s/u.test(character)) return fontSize * 0.33;
	if (
		/\p{Extended_Pictographic}|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(
			character
		)
	) {
		return fontSize;
	}
	if (/[A-Z]/u.test(character)) return fontSize * 0.68;
	if (/[a-z]/u.test(character)) return fontSize * 0.44;
	if (/[0-9]/u.test(character)) return fontSize * 0.52;
	if (/\p{Punctuation}/u.test(character)) return fontSize * 0.36;
	return fontSize * 0.62;
}

function estimateTextWidth({
	fontSize,
	text,
}: {
	fontSize: number;
	text: string;
}): number {
	return segmentText({ content: text, unit: "grapheme" }).reduce(
		(width, character) =>
			width +
			getFallbackCharacterAdvance({ character: character.text, fontSize }),
		0
	);
}

export function createTextWidthMeasurer({
	fontSize,
}: {
	fontSize: number;
}): TextWidthMeasurer {
	if (
		typeof document !== "undefined" &&
		typeof CanvasRenderingContext2D !== "undefined"
	) {
		try {
			const context = document.createElement("canvas").getContext("2d");
			if (context) {
				return ({ font, text }) => {
					context.font = font;
					return context.measureText(text).width;
				};
			}
		} catch {
			// Non-browser renderers use the deterministic Unicode fallback below.
		}
	}

	return ({ text }) => estimateTextWidth({ fontSize, text });
}

export function buildTextFont({
	fontFamily,
	fontSize,
	fontStyle,
	fontWeight,
}: {
	fontFamily: string;
	fontSize: number;
	fontStyle: string;
	fontWeight: string;
}): string {
	return `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily.replaceAll('"', "")}"`;
}

export function measureTextLineWidth({
	font,
	letterSpacing,
	measureTextWidth,
	text,
}: {
	font: string;
	letterSpacing: number;
	measureTextWidth: TextWidthMeasurer;
	text: string;
}): number {
	const measuredWidth = measureTextWidth({ font, text });
	const glyphWidth = Number.isFinite(measuredWidth) ? measuredWidth : 0;
	return Math.max(
		0,
		glyphWidth +
			Math.max(0, segmentText({ content: text, unit: "grapheme" }).length - 1) *
				letterSpacing
	);
}

function splitOversizedToken({
	maxWidth,
	measureLineWidth,
	token,
}: {
	maxWidth: number;
	measureLineWidth: TextLineWidthMeasurer;
	token: string;
}): string[] {
	const chunks: string[] = [];
	let chunk = "";
	for (const grapheme of segmentText({
		content: token,
		unit: "grapheme",
	})) {
		const candidate = `${chunk}${grapheme.text}`;
		if (chunk && measureLineWidth({ text: candidate }) > maxWidth) {
			chunks.push(chunk);
			chunk = grapheme.text;
			continue;
		}
		chunk = candidate;
	}
	if (chunk) chunks.push(chunk);
	return chunks;
}

export function wrapTextToWidth({
	maxWidth,
	measureLineWidth,
	text,
}: {
	maxWidth: number;
	measureLineWidth: TextLineWidthMeasurer;
	text: string;
}): string[] {
	const lines: string[] = [];
	for (const paragraph of text.replace(/\r/g, "").split("\n")) {
		if (!paragraph) {
			lines.push("");
			continue;
		}

		let line = "";
		for (const token of paragraph.match(/\S+\s*|\s+/g) ?? [paragraph]) {
			const candidate = `${line}${token}`;
			if (measureLineWidth({ text: candidate.trimEnd() }) <= maxWidth) {
				line = candidate;
				continue;
			}

			if (line) lines.push(line.trimEnd());
			line = "";
			if (measureLineWidth({ text: token.trimEnd() }) <= maxWidth) {
				line = token.trimStart();
				continue;
			}

			const chunks = splitOversizedToken({
				maxWidth,
				measureLineWidth,
				token: token.trim(),
			});
			lines.push(...chunks.slice(0, -1));
			line = chunks.at(-1) ?? "";
		}
		lines.push(line.trimEnd());
	}
	return lines.length > 0 ? lines : [""];
}
