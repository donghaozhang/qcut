import { describe, expect, it } from "vitest";
import type { ElevenLabsTranscriptionWord } from "@/types/electron";
import {
	applyFillerRemoval,
	buildSegmentsFromWords,
	buildSmartCaptionElements,
	parseKeyterms,
} from "../smart-recognition";

function word({
	text,
	start,
	end,
	type = "word",
}: {
	text: string;
	start: number;
	end: number;
	type?: ElevenLabsTranscriptionWord["type"];
}): ElevenLabsTranscriptionWord {
	return { text, start, end, type, speaker_id: null };
}

describe("parseKeyterms", () => {
	it("splits on commas and newlines, deduplicates, and caps the list", () => {
		expect(
			parseKeyterms({ input: "QCut, 剪映、QCut\nElevenLabs;;  " })
		).toEqual(["QCut", "剪映", "ElevenLabs"]);
		expect(
			parseKeyterms({
				input: Array.from({ length: 60 }, (_, i) => `term${i}`).join(","),
			})
		).toHaveLength(40);
	});
});

describe("buildSegmentsFromWords", () => {
	it("breaks segments at sentence-final punctuation and keeps word timing", () => {
		const segmentation = buildSegmentsFromWords({
			words: [
				word({ text: "Hello", start: 0, end: 0.4 }),
				word({ text: " ", start: 0.4, end: 0.5, type: "spacing" }),
				word({ text: "world", start: 0.5, end: 0.9 }),
				word({ text: ".", start: 0.9, end: 0.95, type: "punctuation" }),
				word({ text: "Next", start: 1.1, end: 1.5 }),
				word({ text: "line", start: 1.6, end: 2.0 }),
			],
		});

		expect(segmentation.segments).toHaveLength(2);
		expect(segmentation.segments[0].text).toBe("Hello world.");
		expect(segmentation.segments[0].start).toBe(0);
		expect(segmentation.segments[1].text).toBe("Next line");
		expect(segmentation.segmentWords.get(0)).toHaveLength(2);
		expect(segmentation.segmentWords.get(0)?.[1].text).toBe("world.");
	});

	it("breaks segments on long silences and skips audio events", () => {
		const segmentation = buildSegmentsFromWords({
			words: [
				word({ text: "before", start: 0, end: 0.5 }),
				word({ text: "(laughter)", start: 0.5, end: 1, type: "audio_event" }),
				word({ text: "after", start: 3, end: 3.5 }),
			],
		});

		expect(segmentation.segments.map((segment) => segment.text)).toEqual([
			"before",
			"after",
		]);
	});
});

describe("applyFillerRemoval", () => {
	it("drops flagged words, rebuilds text, and removes emptied segments", () => {
		const segmentation = buildSegmentsFromWords({
			words: [
				word({ text: "嗯", start: 0, end: 0.2 }),
				word({ text: "我们", start: 0.3, end: 0.6 }),
				word({ text: "开始", start: 0.6, end: 1.0 }),
				word({ text: "。", start: 1.0, end: 1.05, type: "punctuation" }),
				word({ text: "呃", start: 1.2, end: 1.4 }),
			],
		});
		const wordIds = segmentation.segmentWords.get(0) ?? [];
		const fillerIds = new Set(
			[wordIds[0]?.id, segmentation.segmentWords.get(1)?.[0]?.id].filter(
				(id): id is string => Boolean(id)
			)
		);

		const cleaned = applyFillerRemoval({
			segmentation,
			removedWordIds: fillerIds,
		});

		expect(cleaned.removedCount).toBe(2);
		expect(cleaned.segments).toHaveLength(1);
		expect(cleaned.segments[0].text).toBe("我们开始。");
		expect(cleaned.segments[0].start).toBeCloseTo(0.3, 5);
	});
});

describe("buildSmartCaptionElements", () => {
	it("shifts captions into the timeline window of a trimmed clip", () => {
		const segmentation = buildSegmentsFromWords({
			words: [
				word({ text: "cut", start: 1, end: 2 }),
				word({ text: ".", start: 2, end: 2.05, type: "punctuation" }),
				word({ text: "kept", start: 6, end: 7 }),
			],
		});

		const elements = buildSmartCaptionElements({
			segmentation,
			language: "en",
			timelineOffset: 10,
			windowStart: 5,
			windowEnd: 9,
		});

		expect(elements).toHaveLength(1);
		expect(elements[0].text).toBe("kept");
		expect(elements[0].startTime).toBeCloseTo(11, 5);
		expect(elements[0].words?.[0].start).toBeCloseTo(11, 5);
		expect(elements[0].source).toBe("transcription");
	});

	it("applies the highlight preset style to selected segments only", () => {
		const segmentation = buildSegmentsFromWords({
			words: [
				word({ text: "plain", start: 0, end: 1 }),
				word({ text: ".", start: 1, end: 1.05, type: "punctuation" }),
				word({ text: "key", start: 2, end: 3 }),
			],
		});

		const elements = buildSmartCaptionElements({
			segmentation,
			language: "en",
			highlightIds: new Set([1]),
		});

		expect(elements[0].style).toBeUndefined();
		expect(elements[1].style?.karaokeMode).toBe("word-highlight");
	});
});
