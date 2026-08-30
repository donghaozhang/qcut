import type { WordItem } from "@/types/word-timeline";

export interface WordDisplayGroup extends WordItem {
	wordIds: string[];
}

const DEFAULT_MAX_CJK_CHARS = 6;
const MAX_JOIN_GAP_SECONDS = 0.35;
const CJK_TEXT_PATTERN = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u;
const CJK_JOINABLE_PATTERN =
	/^[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af0-9０-９一二三四五六七八九十百千万亿两点]+$/u;
const ATTACHED_PUNCTUATION_PATTERN = /^[，。！？；：、,.!?…]+$/u;

function isCjkJoinable({ text }: { text: string }): boolean {
	return CJK_JOINABLE_PATTERN.test(text) && CJK_TEXT_PATTERN.test(text);
}

function isAttachedPunctuation({ text }: { text: string }): boolean {
	return ATTACHED_PUNCTUATION_PATTERN.test(text);
}

function countDisplayChars({ text }: { text: string }): number {
	return Array.from(text).filter(
		(char) => !ATTACHED_PUNCTUATION_PATTERN.test(char)
	).length;
}

function getGroupFilterReason({
	words,
}: {
	words: WordItem[];
}): string | undefined {
	const reasons = words
		.map((word) => word.filterReason)
		.filter((reason): reason is string => Boolean(reason));
	if (reasons.length === 0) return undefined;
	return [...new Set(reasons)].join("; ");
}

function createDisplayGroup({
	words,
}: {
	words: WordItem[];
}): WordDisplayGroup {
	const firstWord = words[0];
	const lastWord = words.at(-1);
	if (!firstWord || !lastWord) {
		throw new Error("Cannot create a display group without words");
	}

	return {
		id: firstWord.id,
		text: words.map((word) => word.text.trim()).join(""),
		start: firstWord.start,
		end: lastWord.end,
		type: "word",
		speaker_id: firstWord.speaker_id,
		filterState: firstWord.filterState,
		filterReason: getGroupFilterReason({ words }),
		wordIds: words.map((word) => word.id),
	};
}

function canAppendToGroup({
	candidate,
	currentWords,
	maxCjkChars,
}: {
	candidate: WordItem;
	currentWords: WordItem[];
	maxCjkChars: number;
}): boolean {
	const lastWord = currentWords.at(-1);
	if (!lastWord) return false;
	if (candidate.filterState !== currentWords[0].filterState) return false;
	if (candidate.start - lastWord.end > MAX_JOIN_GAP_SECONDS) return false;

	const text = candidate.text.trim();
	if (isAttachedPunctuation({ text })) return true;
	if (!isCjkJoinable({ text })) return false;

	const nextText = `${currentWords.map((word) => word.text.trim()).join("")}${text}`;
	return countDisplayChars({ text: nextText }) <= maxCjkChars;
}

export function buildWordDisplayGroups({
	maxCjkChars = DEFAULT_MAX_CJK_CHARS,
	words,
}: {
	maxCjkChars?: number;
	words: WordItem[];
}): WordDisplayGroup[] {
	const groups: WordDisplayGroup[] = [];
	let currentWords: WordItem[] = [];

	const closeGroup = () => {
		if (currentWords.length === 0) return;
		groups.push(createDisplayGroup({ words: currentWords }));
		currentWords = [];
	};

	for (const word of words) {
		const text = word.text.trim();
		if (!text) continue;

		if (
			currentWords.length > 0 &&
			canAppendToGroup({ candidate: word, currentWords, maxCjkChars })
		) {
			currentWords.push(word);
			if (isAttachedPunctuation({ text })) {
				closeGroup();
			}
			continue;
		}

		closeGroup();
		currentWords = [word];
		if (!isCjkJoinable({ text }) || isAttachedPunctuation({ text })) {
			closeGroup();
		}
	}

	closeGroup();
	return groups;
}

export function getDisplayGroupWordIds({
	word,
}: {
	word: WordItem | WordDisplayGroup;
}): string[] {
	if ("wordIds" in word) return word.wordIds;
	return [word.id];
}
