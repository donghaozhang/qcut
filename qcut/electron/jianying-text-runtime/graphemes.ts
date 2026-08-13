/// <reference lib="es2022.intl" />

const COMBINING_MARK_PATTERN = /^\p{Mark}$/u;

function codePoint({ value }: { value: string }) {
	return value.codePointAt(0) ?? 0;
}

function isVariationSelector({ value }: { value: string }) {
	const point = codePoint({ value });
	return (
		(point >= 0xfe00 && point <= 0xfe0f) ||
		(point >= 0xe0100 && point <= 0xe01ef)
	);
}

function isEmojiModifier({ value }: { value: string }) {
	const point = codePoint({ value });
	return point >= 0x1f3fb && point <= 0x1f3ff;
}

function isRegionalIndicator({ value }: { value: string }) {
	const point = codePoint({ value });
	return point >= 0x1f1e6 && point <= 0x1f1ff;
}

function regionalIndicatorCount({ value }: { value: string }) {
	let count = 0;
	for (const character of Array.from(value)) {
		if (isRegionalIndicator({ value: character })) count += 1;
	}
	return count;
}

function shouldJoinFallbackGrapheme({
	current,
	next,
}: {
	current: string;
	next: string;
}) {
	if (current === "\r" && next === "\n") return true;
	if (next === "\u200d" || current.endsWith("\u200d")) return true;
	if (COMBINING_MARK_PATTERN.test(next)) return true;
	if (isVariationSelector({ value: next })) return true;
	if (isEmojiModifier({ value: next })) return true;
	if (next === "\u20e3") return true;
	return (
		isRegionalIndicator({ value: next }) &&
		regionalIndicatorCount({ value: current }) % 2 === 1
	);
}

function splitFallbackGraphemes({ text }: { text: string }) {
	const graphemes: string[] = [];
	for (const character of Array.from(text)) {
		const current = graphemes[graphemes.length - 1];
		if (current && shouldJoinFallbackGrapheme({ current, next: character })) {
			graphemes[graphemes.length - 1] = `${current}${character}`;
			continue;
		}
		graphemes.push(character);
	}
	return graphemes;
}

export function splitJianyingTextGraphemes({
	text,
	forceFallback = false,
}: {
	text: string;
	forceFallback?: boolean;
}) {
	if (!forceFallback && typeof Intl.Segmenter === "function") {
		try {
			const segmenter = new Intl.Segmenter(undefined, {
				granularity: "grapheme",
			});
			return Array.from(segmenter.segment(text), ({ segment }) => segment);
		} catch {
			// ICU availability varies with the bundled Electron runtime.
		}
	}
	return splitFallbackGraphemes({ text });
}
