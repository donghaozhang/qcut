import { describe, expect, it } from "vitest";
import type { TranscriptionSegment } from "@/types/captions";
import {
	applyCaptionPostProcess,
	applyCaptionRewrites,
	applyBatchReplace,
	createPlainTextExport,
	getCaptionTextHighlights,
	getQualityFlags,
	mergeAdjacentSegments,
	parseCaptionRewriteResponse,
	splitSegment,
	transformSegments,
} from "../workbench";

function segment({
	id,
	start,
	end,
	text,
	noSpeechProb = 0.1,
}: {
	id: number;
	start: number;
	end: number;
	text: string;
	noSpeechProb?: number;
}): TranscriptionSegment {
	return {
		id,
		seek: start * 1000,
		start,
		end,
		text,
		tokens: [],
		temperature: 0,
		avg_logprob: -0.2,
		compression_ratio: 1,
		no_speech_prob: noSpeechProb,
	};
}

describe("caption workbench utilities", () => {
	it("applies batch replacement without mutating timing", () => {
		const segments = [
			segment({ id: 1, start: 0, end: 1, text: "hello Qcut" }),
			segment({ id: 2, start: 1, end: 2, text: "qcut captions" }),
		];

		const replaced = applyBatchReplace({
			segments,
			rule: {
				find: "qcut",
				replace: "QCut",
				caseSensitive: false,
			},
		});

		expect(replaced.map((item) => item.text)).toEqual([
			"hello QCut",
			"QCut captions",
		]);
		expect(replaced[1]?.start).toBe(1);
	});

	it("normalizes punctuation, fillers, line length, and caption density", () => {
		const segments = [
			segment({
				id: 1,
				start: 0,
				end: 2,
				text: "um this is a very long caption sentence",
			}),
		];

		const transformed = transformSegments({
			segments,
			options: {
				punctuationMode: "add-periods",
				maxCharsPerLine: 12,
				compressToChars: 24,
				removeFillers: true,
			},
		});

		expect(transformed[0]?.text).toBe("this is a\nvery long\ncap…");
	});

	it("splits and merges adjacent segments while keeping chronological ids", () => {
		const segments = [
			segment({ id: 1, start: 0, end: 2, text: "first half second half" }),
			segment({ id: 2, start: 2, end: 3, text: "tail" }),
		];

		const split = splitSegment({ segments, segmentId: 1 });
		expect(split).toHaveLength(3);
		expect(split.map((item) => item.id)).toEqual([1, 2, 3]);
		expect(split[0]?.end).toBe(1);
		expect(split[1]?.start).toBe(1);

		const merged = mergeAdjacentSegments({ segments: split, segmentId: 1 });
		expect(merged).toHaveLength(2);
		expect(merged[0]?.text).toContain("second half");
		expect(merged.map((item) => item.id)).toEqual([1, 2]);
	});

	it("exports timecoded plain text for review workflows", () => {
		const segments = [
			segment({ id: 1, start: 1.2, end: 2.4, text: "Caption one" }),
			segment({ id: 2, start: 65, end: 66.5, text: "Caption two" }),
		];

		expect(
			createPlainTextExport({ segments, includeTimestamps: true })
		).toContain("[00:01.1 - 00:02.3] Caption one");
		expect(createPlainTextExport({ segments, includeTimestamps: false })).toBe(
			"Caption one\nCaption two"
		);
	});

	it("flags risky low-confidence and dense segments", () => {
		const flags = getQualityFlags({
			segment: segment({
				id: 1,
				start: 0,
				end: 0.5,
				text: "This caption is too dense and probably needs review",
				noSpeechProb: 0.6,
			}),
			hotWords: ["QCut"],
		});

		expect(flags.map((flag) => flag.id)).toEqual(
			expect.arrayContaining(["low-confidence", "too-dense", "no-hotword"])
		);
	});

	it("runs local AI-assist post processing actions", () => {
		const segments = [
			segment({
				id: 1,
				start: 0,
				end: 4,
				text: "um this is the core secret because it matters!",
			}),
		];

		const polished = applyCaptionPostProcess({
			action: "polish",
			segments,
		});
		expect(polished.segments[0]?.text).toBe(
			"Um this is the core secret because it matters"
		);
		expect(polished.changedCount).toBe(1);

		const resegmented = applyCaptionPostProcess({
			action: "resegment",
			segments,
		});
		expect(resegmented.segments).toHaveLength(2);
		expect(resegmented.changedCount).toBe(1);

		const localized = applyCaptionPostProcess({
			action: "localize",
			segments,
			targetLanguage: "English",
		});
		expect(localized.segments[0]?.text).toContain("[English]");

		const highlighted = applyCaptionPostProcess({
			action: "highlight-quotes",
			segments,
		});
		expect(highlighted.segments[0]?.text).toMatch(/^【.*】$/u);
	});

	it("highlights hot words, filler words, and suspicious tokens", () => {
		const highlights = getCaptionTextHighlights({
			text: "um QCut ??? works",
			hotWords: ["QCut"],
		});

		expect(highlights).toEqual(
			expect.arrayContaining([
				{ text: "um", kind: "filler" },
				{ text: "QCut", kind: "hotword" },
				{ text: "???", kind: "suspicious" },
			])
		);
	});

	it("parses and applies AI rewrite responses", () => {
		const segments = [
			segment({ id: 1, start: 0, end: 1, text: "old one" }),
			segment({ id: 2, start: 1, end: 2, text: "old two" }),
		];
		const rewrites = parseCaptionRewriteResponse({
			content: '```json\n[{"id":1,"text":"new one"}]\n```',
		});

		const result = applyCaptionRewrites({ segments, rewrites });

		expect(result.changedCount).toBe(1);
		expect(result.segments.map((item) => item.text)).toEqual([
			"new one",
			"old two",
		]);
	});
});
