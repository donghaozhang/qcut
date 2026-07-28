import type { TextAnimationSegment, TextAnimationUnit } from "./model.js";

const COMBINING_MARK = /^\p{Mark}$/u;
const WORD_CHARACTER = /[\p{Letter}\p{Mark}\p{Number}]/u;

function isVariationSelector({ value }: { value: string }): boolean {
	const codePoint = value.codePointAt(0) ?? 0;
	return (
		(codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
		(codePoint >= 0xe0100 && codePoint <= 0xe01ef)
	);
}

function isEmojiModifier({ value }: { value: string }): boolean {
	const codePoint = value.codePointAt(0) ?? 0;
	return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}

function isRegionalIndicator({ value }: { value: string }): boolean {
	const codePoint = value.codePointAt(0) ?? 0;
	return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function regionalIndicatorCount({ value }: { value: string }): number {
	let count = 0;
	for (const character of Array.from(value)) {
		if (isRegionalIndicator({ value: character })) count++;
	}
	return count;
}

function shouldJoinFallbackGrapheme({
	current,
	next,
}: {
	current: string;
	next: string;
}): boolean {
	if (current === "\r" && next === "\n") return true;
	if (next === "\u200d" || current.endsWith("\u200d")) return true;
	if (COMBINING_MARK.test(next)) return true;
	if (isVariationSelector({ value: next })) return true;
	if (isEmojiModifier({ value: next })) return true;
	if (next === "\u20e3") return true;
	return (
		isRegionalIndicator({ value: next }) &&
		regionalIndicatorCount({ value: current }) % 2 === 1
	);
}

export function segmentGraphemesFallback({
	content,
}: {
	content: string;
}): TextAnimationSegment[] {
	const clusters: string[] = [];
	for (const character of Array.from(content)) {
		const current = clusters.at(-1);
		if (current && shouldJoinFallbackGrapheme({ current, next: character })) {
			clusters[clusters.length - 1] = `${current}${character}`;
			continue;
		}
		clusters.push(character);
	}

	let offset = 0;
	return clusters.map((text) => {
		const start = offset;
		offset += text.length;
		return { start, end: offset, text };
	});
}

function segmentGraphemesWithIntl({
	content,
	locale,
}: {
	content: string;
	locale?: string;
}): TextAnimationSegment[] | null {
	if (typeof Intl.Segmenter !== "function") return null;
	try {
		const segmenter = new Intl.Segmenter(locale, {
			granularity: "grapheme",
		});
		return Array.from(segmenter.segment(content), (segment) => ({
			start: segment.index,
			end: segment.index + segment.segment.length,
			text: segment.segment,
		}));
	} catch {
		return null;
	}
}

function getFallbackWordRanges({
	content,
	graphemes,
}: {
	content: string;
	graphemes: TextAnimationSegment[];
}): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];
	let active: { start: number; end: number } | null = null;
	for (const grapheme of graphemes) {
		if (WORD_CHARACTER.test(grapheme.text)) {
			if (active) {
				active.end = grapheme.end;
			} else {
				active = { start: grapheme.start, end: grapheme.end };
			}
			continue;
		}
		if (active) {
			ranges.push(active);
			active = null;
		}
	}
	if (active) ranges.push(active);
	if (ranges.length === 0 && content.length > 0) {
		return [{ start: 0, end: content.length }];
	}
	return ranges;
}

function getIntlWordRanges({
	content,
	locale,
}: {
	content: string;
	locale?: string;
}): Array<{ start: number; end: number }> | null {
	if (typeof Intl.Segmenter !== "function") return null;
	try {
		const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
		const ranges: Array<{ start: number; end: number }> = [];
		for (const segment of segmenter.segment(content)) {
			if (!segment.isWordLike) continue;
			ranges.push({
				start: segment.index,
				end: segment.index + segment.segment.length,
			});
		}
		return ranges;
	} catch {
		return null;
	}
}

function attachSeparatorsToWordRanges({
	content,
	ranges,
}: {
	content: string;
	ranges: Array<{ start: number; end: number }>;
}): TextAnimationSegment[] {
	if (content.length === 0) return [];
	if (ranges.length === 0) {
		return [{ start: 0, end: content.length, text: content }];
	}
	return ranges.map((range, index) => {
		const start = index === 0 ? 0 : range.start;
		const next = ranges[index + 1];
		const end = next ? next.start : content.length;
		return { start, end, text: content.slice(start, end) };
	});
}

export function segmentText({
	content,
	unit,
	locale,
	forceFallback = false,
}: {
	content: string;
	unit: TextAnimationUnit;
	locale?: string;
	forceFallback?: boolean;
}): TextAnimationSegment[] {
	if (content.length === 0) return [];
	if (unit === "all") {
		return [{ start: 0, end: content.length, text: content }];
	}

	const graphemes =
		(forceFallback ? null : segmentGraphemesWithIntl({ content, locale })) ??
		segmentGraphemesFallback({ content });
	if (unit === "grapheme") return graphemes;

	const wordRanges =
		(forceFallback ? null : getIntlWordRanges({ content, locale })) ??
		getFallbackWordRanges({ content, graphemes });
	return attachSeparatorsToWordRanges({ content, ranges: wordRanges });
}
