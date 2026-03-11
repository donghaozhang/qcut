import { describe, it, expect } from "vitest";
import { searchTranscriptions } from "../search/search-engine.js";
import type { PersistedTranscription } from "../types/transcription.js";
import type { SearchOptions } from "../search/search-engine.js";

function makeTranscription(
	overrides: Partial<PersistedTranscription> = {}
): PersistedTranscription {
	return {
		version: 1,
		mediaId: "m1",
		mediaName: "video.mp4",
		language: "en",
		duration: 60,
		provider: "elevenlabs",
		createdAt: Date.now(),
		text: "Hello world. How are you today?",
		words: [
			{ text: "Hello", start: 0.5, end: 0.8, type: "word" },
			{ text: "world", start: 0.9, end: 1.2, type: "word" },
			{ text: "How", start: 2.0, end: 2.2, type: "word" },
			{ text: "are", start: 2.3, end: 2.5, type: "word" },
			{ text: "you", start: 2.6, end: 2.8, type: "word" },
			{ text: "today", start: 2.9, end: 3.3, type: "word" },
		],
		segments: [
			{ text: "Hello world.", start: 0.5, end: 1.5 },
			{ text: "How are you today?", start: 2.0, end: 3.5 },
		],
		...overrides,
	};
}

describe("searchTranscriptions", () => {
	it("returns empty for empty query", () => {
		const t = makeTranscription();
		expect(searchTranscriptions([t], { query: "" })).toEqual([]);
		expect(searchTranscriptions([t], { query: "  " })).toEqual([]);
	});

	it("returns empty for no match", () => {
		const t = makeTranscription();
		expect(searchTranscriptions([t], { query: "xyzzy" })).toEqual([]);
	});

	it("basic substring match", () => {
		const t = makeTranscription();
		const results = searchTranscriptions([t], { query: "world" });
		expect(results).toHaveLength(1);
		expect(results[0].mediaId).toBe("m1");
		expect(results[0].segmentText).toBe("Hello world.");
		expect(results[0].matchStart).toBe(6);
		expect(results[0].matchEnd).toBe(11);
		expect(results[0].timestamp).toBe(0.5);
		expect(results[0].timestampEnd).toBe(1.5);
	});

	it("case-insensitive by default", () => {
		const t = makeTranscription();
		const results = searchTranscriptions([t], { query: "HELLO" });
		expect(results).toHaveLength(1);
		expect(results[0].segmentText).toBe("Hello world.");
	});

	it("case-sensitive when specified", () => {
		const t = makeTranscription();
		const noMatch = searchTranscriptions([t], {
			query: "hello",
			caseSensitive: true,
		});
		expect(noMatch).toHaveLength(0);

		const hasMatch = searchTranscriptions([t], {
			query: "Hello",
			caseSensitive: true,
		});
		expect(hasMatch).toHaveLength(1);
	});

	it("whole-word matching", () => {
		const t = makeTranscription({
			segments: [{ text: "Hello world worldwide", start: 0, end: 2 }],
		});

		const partial = searchTranscriptions([t], { query: "world" });
		expect(partial).toHaveLength(2); // "world" and "worldwide"

		const whole = searchTranscriptions([t], {
			query: "world",
			wholeWord: true,
		});
		expect(whole).toHaveLength(1);
		expect(whole[0].matchStart).toBe(6);
	});

	it("multiple matches within one segment", () => {
		const t = makeTranscription({
			segments: [{ text: "go go go", start: 0, end: 2 }],
			words: [],
		});
		const results = searchTranscriptions([t], { query: "go" });
		expect(results).toHaveLength(3);
		expect(results.map((r) => r.matchStart)).toEqual([0, 3, 6]);
	});

	it("multi-segment matches within one transcription", () => {
		const t = makeTranscription();
		const results = searchTranscriptions([t], { query: "o" });
		// "Hello world." has o at indices 4, 7 → 2 matches
		// "How are you today?" has o at indices 1, 10, 13 → 3 matches
		expect(results.length).toBeGreaterThanOrEqual(4);
	});

	it("cross-transcription (multi-video) search", () => {
		const t1 = makeTranscription({ mediaId: "m1", mediaName: "a.mp4" });
		const t2 = makeTranscription({
			mediaId: "m2",
			mediaName: "b.mp4",
			segments: [{ text: "Hello again", start: 5, end: 7 }],
		});

		const results = searchTranscriptions([t1, t2], { query: "Hello" });
		expect(results).toHaveLength(2);
		expect(results[0].mediaId).toBe("m1");
		expect(results[1].mediaId).toBe("m2");
	});

	it("respects maxResults limit", () => {
		const t = makeTranscription({
			segments: [{ text: "a a a a a a a a", start: 0, end: 5 }],
			words: [],
		});
		const results = searchTranscriptions([t], { query: "a", maxResults: 3 });
		expect(results).toHaveLength(3);
	});

	it("word-level timestamp precision", () => {
		const t = makeTranscription();
		const results = searchTranscriptions([t], { query: "world" });
		expect(results).toHaveLength(1);
		expect(results[0].wordTimestamp).toBe(0.9);
	});

	it("scopes to specific mediaId", () => {
		const t1 = makeTranscription({ mediaId: "m1" });
		const t2 = makeTranscription({
			mediaId: "m2",
			segments: [{ text: "Hello there", start: 0, end: 1 }],
		});

		const results = searchTranscriptions([t1, t2], {
			query: "Hello",
			mediaId: "m2",
		});
		expect(results).toHaveLength(1);
		expect(results[0].mediaId).toBe("m2");
	});

	it("handles special regex characters in query", () => {
		const t = makeTranscription({
			segments: [{ text: "price is $100 (USD)", start: 0, end: 2 }],
			words: [],
		});
		const results = searchTranscriptions([t], { query: "$100" });
		expect(results).toHaveLength(1);
		expect(results[0].matchStart).toBe(9);
	});

	it("handles empty segments gracefully", () => {
		const t = makeTranscription({
			segments: [
				{ text: "", start: 0, end: 1 },
				{ text: "Hello", start: 1, end: 2 },
			],
			words: [],
		});
		const results = searchTranscriptions([t], { query: "Hello" });
		expect(results).toHaveLength(1);
	});

	it("CJK text matching", () => {
		const t = makeTranscription({
			segments: [{ text: "你好世界，欢迎使用", start: 0, end: 3 }],
			words: [],
		});
		const results = searchTranscriptions([t], { query: "世界" });
		expect(results).toHaveLength(1);
		expect(results[0].matchStart).toBe(2);
		expect(results[0].matchEnd).toBe(4);
	});

	it("returns results sorted by media order then timestamp", () => {
		const t1 = makeTranscription({
			mediaId: "m1",
			segments: [
				{ text: "test one", start: 5, end: 6 },
				{ text: "test two", start: 1, end: 2 },
			],
		});
		const t2 = makeTranscription({
			mediaId: "m2",
			segments: [{ text: "test three", start: 0, end: 1 }],
		});

		const results = searchTranscriptions([t1, t2], { query: "test" });
		expect(results).toHaveLength(3);
		// Results follow segment order within transcription, then transcription order
		expect(results[0].mediaId).toBe("m1");
		expect(results[0].timestamp).toBe(5); // first segment in m1
		expect(results[1].mediaId).toBe("m1");
		expect(results[1].timestamp).toBe(1); // second segment in m1
		expect(results[2].mediaId).toBe("m2");
	});
});
