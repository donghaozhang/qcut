import { DEFAULT_SUBTITLE_STYLE } from "@/lib/captions/subtitle-style";
import { mapMediaSourceTime } from "@/lib/video/video-timing";
import type { CreateCaptionElement, MediaElement } from "@/types/timeline";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";

interface TimelineLyricWord {
	text: string;
	start: number;
	end: number;
}

const MAX_WORDS_PER_CAPTION = 7;
const MAX_CAPTION_DURATION = 4;
const MAX_WORD_GAP = 0.9;

export function retimeLyricsWords({
	text,
	words,
}: {
	text: string;
	words: WordItem[];
}): WordItem[] {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	const sourceWords = words.filter((word) => word.type === "word");
	if (tokens.length === 0 || sourceWords.length === 0) return [];
	if (tokens.length === sourceWords.length) {
		return sourceWords.map((word, index) => ({
			...word,
			text: tokens[index],
		}));
	}
	const start = sourceWords[0].start;
	const end = Math.max(start + 0.1, sourceWords.at(-1)?.end ?? start);
	const step = (end - start) / tokens.length;
	return tokens.map((token, index) => {
		const sourceIndex = Math.min(
			sourceWords.length - 1,
			Math.floor((index / tokens.length) * sourceWords.length)
		);
		const source = sourceWords[sourceIndex];
		return {
			...source,
			id: sourceWords[index]?.id ?? `lyrics-word-${index}`,
			text: token,
			start: start + index * step,
			end: start + (index + 1) * step,
			type: "word",
			filterState: WORD_FILTER_STATE.NONE,
			filterReason: undefined,
		};
	});
}

function visibleLyricWords({
	element,
	words,
	fps,
}: {
	element: MediaElement;
	words: WordItem[];
	fps: number;
}): TimelineLyricWord[] {
	const sourceEnd = element.duration - element.trimEnd;
	return words
		.filter(
			(word) =>
				word.type === "word" &&
				word.filterState !== WORD_FILTER_STATE.AI &&
				word.filterState !== WORD_FILTER_STATE.USER_REMOVE &&
				word.end > element.trimStart &&
				word.start < sourceEnd
		)
		.map((word) => {
			const mappedStart = mapMediaSourceTime({
				element,
				sourceTime: Math.max(element.trimStart, word.start),
				fps,
			});
			const mappedEnd = mapMediaSourceTime({
				element,
				sourceTime: Math.min(sourceEnd, word.end),
				fps,
			});
			return {
				text: word.text.trim(),
				start: element.startTime + Math.min(mappedStart, mappedEnd),
				end: element.startTime + Math.max(mappedStart, mappedEnd),
			};
		})
		.filter((word) => word.text.length > 0)
		.sort((left, right) => left.start - right.start);
}

function shouldStartCaption({
	group,
	word,
}: {
	group: TimelineLyricWord[];
	word: TimelineLyricWord;
}): boolean {
	const first = group[0];
	const previous = group.at(-1);
	if (!first || !previous) return false;
	return (
		group.length >= MAX_WORDS_PER_CAPTION ||
		word.end - first.start > MAX_CAPTION_DURATION ||
		word.start - previous.end > MAX_WORD_GAP
	);
}

export function buildKaraokeCaptionElements({
	element,
	words,
	language,
	fps = 30,
}: {
	element: MediaElement;
	words: WordItem[];
	language: string;
	fps?: number;
}): CreateCaptionElement[] {
	const timelineWords = visibleLyricWords({ element, words, fps });
	const groups: TimelineLyricWord[][] = [];
	for (const word of timelineWords) {
		const current = groups.at(-1);
		if (!current || shouldStartCaption({ group: current, word })) {
			groups.push([word]);
			continue;
		}
		current.push(word);
	}
	return groups.map((group, index) => {
		const startTime = group[0].start;
		const endTime = Math.max(startTime + 0.1, group.at(-1)?.end ?? startTime);
		return {
			type: "captions",
			name: `Lyrics ${index + 1}`,
			startTime,
			duration: endTime - startTime,
			trimStart: 0,
			trimEnd: 0,
			text: group.map((word) => word.text).join(" "),
			language,
			source: "transcription",
			style: {
				...structuredClone(DEFAULT_SUBTITLE_STYLE),
				karaokeMode: "karaoke",
				highlightColor: "#22d3ee",
				upcomingColor: "#d4d4d8",
			},
		};
	});
}
