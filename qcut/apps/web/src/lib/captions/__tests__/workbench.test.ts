import { describe, expect, it } from "vitest";
import type { TranscriptionSegment } from "@/types/captions";
import { exportCaptions } from "../caption-export";
import {
	createPlainTextExport,
	getQualityFlags,
	transformCaptionText,
} from "../workbench";

function segment(overrides: Partial<TranscriptionSegment> = {}): TranscriptionSegment {
	return {
		id: 1,
		seek: 0,
		start: 1.2,
		end: 3.8,
		text: " um hello world ",
		tokens: [],
		temperature: 0,
		avg_logprob: -0.2,
		compression_ratio: 1,
		no_speech_prob: 0.05,
		...overrides,
	};
}

describe("caption workbench helpers", () => {
	it("exports plain and timecoded text captions", () => {
		const segments = [
			segment({ text: "First line", start: 1.2, end: 3.8 }),
			segment({ id: 2, text: "Second line", start: 64.05, end: 65.1 }),
		];

		expect(createPlainTextExport({ segments, includeTimestamps: false })).toBe(
			"First line\nSecond line"
		);
		expect(exportCaptions(segments, "timecoded")).toBe(
			"[00:01.1 - 00:03.7] First line\n[01:04.0 - 01:05.0] Second line"
		);
	});

	it("applies text cleanup options before line splitting", () => {
		expect(
			transformCaptionText({
				text: "um this is a very long caption",
				options: {
					punctuationMode: "add-periods",
					maxCharsPerLine: 10,
					compressToChars: 0,
					removeFillers: true,
				},
			})
		).toBe("this is a\nvery long\ncaption.");
	});

	it("flags low confidence and dense caption segments", () => {
		const flags = getQualityFlags({
			segment: segment({
				text: "This line is too dense for its tiny timing window",
				start: 0,
				end: 0.5,
				avg_logprob: -1.5,
				compression_ratio: 3,
				no_speech_prob: 0.4,
			}),
			hotWords: ["QCut"],
		});

		expect(flags.map((flag) => flag.id)).toEqual(
			expect.arrayContaining([
				"low-confidence",
				"too-dense",
				"too-long",
				"repetition",
				"no-hotword",
			])
		);
	});
});
