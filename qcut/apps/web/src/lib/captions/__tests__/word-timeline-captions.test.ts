import { describe, expect, it } from "vitest";
import {
	WORD_FILTER_STATE,
	type WordTimelineData,
} from "@/types/word-timeline";
import { CAPTION_STYLE_PRESETS } from "../caption-style-presets";
import { buildWordTimelineCaptionElements } from "../word-timeline-captions";

function data({
	words,
	languageCode = "eng",
}: {
	words: WordTimelineData["words"];
	languageCode?: string;
}): WordTimelineData {
	return {
		text: words.map((word) => word.text).join(" "),
		language_code: languageCode,
		language_probability: 1,
		words,
	};
}

describe("buildWordTimelineCaptionElements", () => {
	it("builds styled captions from non-deleted word timeline words", () => {
		const style = CAPTION_STYLE_PRESETS[0].style;
		const captions = buildWordTimelineCaptionElements({
			data: data({
				words: [
					{
						id: "word-0",
						text: "Um",
						start: 0,
						end: 0.2,
						type: "word",
						filterState: WORD_FILTER_STATE.AI,
					},
					{
						id: "word-1",
						text: "today",
						start: 0.3,
						end: 0.7,
						type: "word",
						filterState: WORD_FILTER_STATE.NONE,
					},
					{
						id: "word-2",
						text: "works",
						start: 0.8,
						end: 1.2,
						type: "word",
						filterState: WORD_FILTER_STATE.USER_KEEP,
					},
				],
			}),
			style,
		});

		expect(captions).toHaveLength(1);
		expect(captions[0]).toMatchObject({
			type: "captions",
			text: "today works",
			language: "eng",
			source: "transcription",
			style: expect.objectContaining({
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
			}),
		});
		expect(captions[0].words?.map((word) => word.id)).toEqual([
			"word-1",
			"word-2",
		]);
	});

	it("splits captions on long gaps and joins CJK text without spaces", () => {
		const captions = buildWordTimelineCaptionElements({
			data: data({
				languageCode: "zh",
				words: [
					{
						id: "word-0",
						text: "我们",
						start: 0,
						end: 0.3,
						type: "word",
						filterState: WORD_FILTER_STATE.NONE,
					},
					{
						id: "word-1",
						text: "开始",
						start: 0.35,
						end: 0.7,
						type: "word",
						filterState: WORD_FILTER_STATE.NONE,
					},
					{
						id: "word-2",
						text: "下一句",
						start: 2,
						end: 2.4,
						type: "word",
						filterState: WORD_FILTER_STATE.NONE,
					},
				],
			}),
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"我们开始",
			"下一句",
		]);
		expect(captions[1].startTime).toBe(2);
	});
});
