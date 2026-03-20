import { describe, it, expect } from "vitest";
import { exportAssKaraoke } from "../caption-export";
import type { TranscriptionSegment } from "@/types/captions";
import type { WordItem } from "@/types/word-timeline";

function word(id: string, text: string, start: number, end: number): WordItem {
	return { id, text, start, end, type: "word", filterState: "none" };
}

function segment(
	id: number,
	text: string,
	start: number,
	end: number
): TranscriptionSegment {
	return {
		id,
		seek: start * 1000,
		start,
		end,
		text,
		tokens: [],
		temperature: 0,
		avg_logprob: -0.5,
		compression_ratio: 1,
		no_speech_prob: 0.1,
	};
}

describe("exportAssKaraoke", () => {
	const segments: TranscriptionSegment[] = [
		segment(1, "Hello world", 1.0, 3.0),
		segment(2, "Good morning", 4.0, 6.0),
	];

	const words: WordItem[] = [
		word("w1", "Hello", 1.0, 1.5),
		word("w2", "world", 2.0, 2.8),
		word("w3", "Good", 4.0, 4.5),
		word("w4", "morning", 4.6, 5.8),
	];

	it("generates valid ASS header", () => {
		const result = exportAssKaraoke(segments, words);
		expect(result).toContain("[Script Info]");
		expect(result).toContain("[V4+ Styles]");
		expect(result).toContain("[Events]");
		expect(result).toContain("QCut Karaoke Subtitles");
	});

	it("generates \\k tags with correct centisecond durations", () => {
		const result = exportAssKaraoke(segments, words);
		// "Hello" is 1.0-1.5 = 0.5s = 50cs
		expect(result).toContain("{\\k50}Hello");
		// "world" is 2.0-2.8 = 0.8s = 80cs
		expect(result).toContain("{\\k80}world");
		// "Good" is 4.0-4.5 = 0.5s = 50cs
		expect(result).toContain("{\\k50}Good");
		// "morning" is 4.6-5.8 = 1.2s = 120cs
		expect(result).toContain("{\\k120}morning");
	});

	it("supports \\kf tag type for progressive fill", () => {
		const result = exportAssKaraoke(segments, words, {}, "kf");
		expect(result).toContain("{\\kf50}Hello");
		expect(result).toContain("{\\kf80}world");
	});

	it("falls back to plain text for segments without words", () => {
		const noWords: WordItem[] = [];
		const result = exportAssKaraoke(segments, noWords);
		expect(result).toContain("Hello world");
		expect(result).not.toContain("\\k");
	});

	it("handles empty segments array", () => {
		const result = exportAssKaraoke([], []);
		expect(result).toContain("[Events]");
		expect(result).not.toContain("Dialogue:");
	});

	it("contains Dialogue lines for each segment", () => {
		const result = exportAssKaraoke(segments, words);
		const dialogueLines = result
			.split("\n")
			.filter((l) => l.startsWith("Dialogue:"));
		expect(dialogueLines).toHaveLength(2);
	});

	it("respects custom font options", () => {
		const result = exportAssKaraoke(segments, words, {
			fontFamily: "Roboto",
			fontSize: 24,
		});
		expect(result).toContain("Roboto");
		expect(result).toContain(",24,");
	});
});
