import type { CreateCaptionElement, SubtitleStyle } from "@/types/timeline";
import {
	WORD_FILTER_STATE,
	type WordFilterState,
	type WordItem,
	type WordTimelineData,
} from "@/types/word-timeline";

const MAX_CAPTION_WORDS = 14;
const MAX_CAPTION_DURATION = 5;
const MAX_WORD_GAP = 0.8;
const MIN_CAPTION_DURATION = 0.1;
const SENTENCE_END_PATTERN = /[。.!?!?…]["')」』】]?\s*$/u;
const CJK_PATTERN = /[㐀-鿿぀-ヿ가-힯]/u;
const REMOVED_FILTER_STATES = new Set<WordFilterState>([
	WORD_FILTER_STATE.AI,
	WORD_FILTER_STATE.USER_REMOVE,
]);

function isCaptionWord({ word }: { word: WordItem }): boolean {
	return (
		word.type === "word" &&
		!REMOVED_FILTER_STATES.has(word.filterState) &&
		Number.isFinite(word.start) &&
		Number.isFinite(word.end) &&
		word.end > word.start &&
		word.text.trim().length > 0
	);
}

function joinCaptionText({ words }: { words: WordItem[] }): string {
	const texts = words.map((word) => word.text.trim()).filter(Boolean);
	const joined = texts.join(" ");
	return CJK_PATTERN.test(joined) ? texts.join("") : joined;
}

function cloneStyle({
	style,
}: {
	style?: SubtitleStyle;
}): SubtitleStyle | undefined {
	return style ? structuredClone(style) : undefined;
}

function buildCaption({
	index,
	language,
	style,
	words,
}: {
	index: number;
	language: string;
	style?: SubtitleStyle;
	words: WordItem[];
}): CreateCaptionElement | null {
	const firstWord = words[0];
	const lastWord = words.at(-1);
	if (!firstWord || !lastWord) return null;

	return {
		type: "captions",
		name: `Smart Speech Caption ${index + 1}`,
		startTime: firstWord.start,
		duration: Math.max(MIN_CAPTION_DURATION, lastWord.end - firstWord.start),
		trimStart: 0,
		trimEnd: 0,
		text: joinCaptionText({ words }),
		language,
		confidence: 1,
		source: "transcription",
		words: words.map((word) => ({
			id: word.id,
			text: word.text,
			start: word.start,
			end: word.end,
			type: "word",
		})),
		...(style ? { style: cloneStyle({ style }) } : {}),
	};
}

export function buildWordTimelineCaptionElements({
	data,
	style,
}: {
	data: WordTimelineData;
	style?: SubtitleStyle;
}): CreateCaptionElement[] {
	const captions: CreateCaptionElement[] = [];
	let currentWords: WordItem[] = [];

	const closeCaption = () => {
		const caption = buildCaption({
			index: captions.length,
			language: data.language_code || "unknown",
			style,
			words: currentWords,
		});
		if (caption) captions.push(caption);
		currentWords = [];
	};

	for (const word of data.words) {
		if (!isCaptionWord({ word })) continue;

		const lastWord = currentWords.at(-1);
		if (
			lastWord &&
			(word.start - lastWord.end > MAX_WORD_GAP ||
				currentWords.length >= MAX_CAPTION_WORDS ||
				lastWord.end - currentWords[0].start >= MAX_CAPTION_DURATION)
		) {
			closeCaption();
		}

		currentWords.push(word);

		if (SENTENCE_END_PATTERN.test(word.text)) {
			closeCaption();
		}
	}

	closeCaption();
	return captions;
}
