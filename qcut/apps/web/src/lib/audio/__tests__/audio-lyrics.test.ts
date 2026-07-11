import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";
import {
	buildKaraokeCaptionElements,
	retimeLyricsWords,
} from "../audio-lyrics";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "audio-1",
		type: "media",
		mediaId: "media-1",
		name: "Song",
		startTime: 10,
		duration: 20,
		trimStart: 2,
		trimEnd: 3,
		playbackRate: 2,
		...overrides,
	};
}

function word({
	id,
	text,
	start,
	end,
	filterState = WORD_FILTER_STATE.NONE,
}: {
	id: string;
	text: string;
	start: number;
	end: number;
	filterState?: WordItem["filterState"];
}): WordItem {
	return { id, text, start, end, type: "word", filterState };
}

describe("audio lyrics", () => {
	it("maps trimmed source words through clip speed onto karaoke captions", () => {
		const captions = buildKaraokeCaptionElements({
			element: mediaElement(),
			language: "eng",
			words: [
				word({ id: "trimmed", text: "before", start: 0, end: 1 }),
				word({ id: "one", text: "hello", start: 2, end: 3 }),
				word({ id: "two", text: "world", start: 3.2, end: 4 }),
			],
		});
		expect(captions).toHaveLength(1);
		expect(captions[0]).toMatchObject({
			startTime: 10,
			duration: 1,
			text: "hello world",
			style: { karaokeMode: "karaoke" },
		});
		expect(captions[0].words).toEqual([
			expect.objectContaining({ text: "hello", start: 10, end: 10.5 }),
			expect.objectContaining({ text: "world", start: 10.6, end: 11 }),
		]);
	});

	it("omits removed words and splits long lyric lines", () => {
		const words = Array.from({ length: 9 }, (_, index) =>
			word({
				id: String(index),
				text: `word${index}`,
				start: 2 + index * 0.4,
				end: 2.3 + index * 0.4,
				filterState:
					index === 3 ? WORD_FILTER_STATE.USER_REMOVE : WORD_FILTER_STATE.NONE,
			})
		);
		const captions = buildKaraokeCaptionElements({
			element: mediaElement({ playbackRate: 1 }),
			language: "eng",
			words,
		});
		expect(captions).toHaveLength(2);
		expect(captions.map((caption) => caption.text).join(" ")).not.toContain(
			"word3"
		);
	});

	it("preserves timing for corrections and retimes changed word counts", () => {
		const words = [
			word({ id: "one", text: "old", start: 2, end: 3 }),
			word({ id: "two", text: "words", start: 4, end: 6 }),
		];
		expect(
			retimeLyricsWords({ text: "new lyrics", words }).map(
				({ text, start, end }) => ({ text, start, end })
			)
		).toEqual([
			{ text: "new", start: 2, end: 3 },
			{ text: "lyrics", start: 4, end: 6 },
		]);
		const expanded = retimeLyricsWords({ text: "one two three four", words });
		expect(expanded).toHaveLength(4);
		expect(expanded[0].start).toBe(2);
		expect(expanded.at(-1)?.end).toBe(6);
	});
});
