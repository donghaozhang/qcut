/**
 * Search Feature — Integration Test
 *
 * Tests the full pipeline: transcription data → search engine → results.
 * Uses in-memory data (no disk/Electron dependencies).
 */

import { describe, it, expect } from "vitest";
import { searchTranscriptions } from "../../packages/editor-core/src/search/search-engine.js";
import type { PersistedTranscription } from "../../packages/editor-core/src/types/transcription.js";

// ── Test Data ────────────────────────────────────────────────────────

function makeTranscription(
	overrides: Partial<PersistedTranscription> = {}
): PersistedTranscription {
	return {
		version: 1,
		mediaId: "default-media",
		mediaName: "default.mp4",
		language: "en",
		duration: 60,
		provider: "elevenlabs",
		createdAt: Date.now(),
		text: "",
		words: [],
		segments: [],
		...overrides,
	};
}

// ── Integration Tests ────────────────────────────────────────────────

describe("search integration — full pipeline", () => {
	const interview = makeTranscription({
		mediaId: "interview-001",
		mediaName: "interview.mp4",
		language: "en",
		duration: 300,
		text: "Welcome to the show. Today we discuss artificial intelligence and its impact on creative workflows.",
		words: [
			{ text: "Welcome", start: 0.5, end: 1.0, type: "word" },
			{ text: "to", start: 1.0, end: 1.1, type: "word" },
			{ text: "the", start: 1.1, end: 1.2, type: "word" },
			{ text: "show", start: 1.2, end: 1.5, type: "word" },
			{ text: "Today", start: 2.0, end: 2.3, type: "word" },
			{ text: "we", start: 2.3, end: 2.4, type: "word" },
			{ text: "discuss", start: 2.4, end: 2.8, type: "word" },
			{ text: "artificial", start: 2.9, end: 3.4, type: "word" },
			{ text: "intelligence", start: 3.4, end: 4.0, type: "word" },
			{ text: "and", start: 4.1, end: 4.2, type: "word" },
			{ text: "its", start: 4.2, end: 4.4, type: "word" },
			{ text: "impact", start: 4.4, end: 4.8, type: "word" },
			{ text: "on", start: 4.8, end: 4.9, type: "word" },
			{ text: "creative", start: 5.0, end: 5.4, type: "word" },
			{ text: "workflows", start: 5.4, end: 5.9, type: "word" },
		],
		segments: [
			{ text: "Welcome to the show.", start: 0.5, end: 1.8 },
			{
				text: "Today we discuss artificial intelligence and its impact on creative workflows.",
				start: 2.0,
				end: 6.0,
			},
		],
	});

	const tutorial = makeTranscription({
		mediaId: "tutorial-001",
		mediaName: "tutorial-zh.mp4",
		language: "zh",
		duration: 180,
		text: "今天我们来学习人工智能。这是一个非常有趣的话题。",
		words: [
			{ text: "今天", start: 0.0, end: 0.5, type: "word" },
			{ text: "我们", start: 0.5, end: 0.8, type: "word" },
			{ text: "来", start: 0.8, end: 1.0, type: "word" },
			{ text: "学习", start: 1.0, end: 1.5, type: "word" },
			{ text: "人工智能", start: 1.5, end: 2.5, type: "word" },
		],
		segments: [
			{ text: "今天我们来学习人工智能。", start: 0.0, end: 3.0 },
			{ text: "这是一个非常有趣的话题。", start: 3.5, end: 6.0 },
		],
	});

	const transcriptions = [interview, tutorial];

	it("searches across multiple media files", () => {
		const results = searchTranscriptions(transcriptions, {
			query: "intelligence",
		});
		expect(results).toHaveLength(1);
		expect(results[0].mediaId).toBe("interview-001");
		expect(results[0].mediaName).toBe("interview.mp4");
	});

	it("returns correct timestamp for match", () => {
		const results = searchTranscriptions(transcriptions, {
			query: "artificial",
		});
		expect(results).toHaveLength(1);
		expect(results[0].timestamp).toBe(2.0); // segment start
		expect(results[0].wordTimestamp).toBe(2.9); // precise word start
	});

	it("handles CJK search", () => {
		const results = searchTranscriptions(transcriptions, {
			query: "人工智能",
		});
		expect(results).toHaveLength(1);
		expect(results[0].mediaId).toBe("tutorial-001");
		expect(results[0].timestamp).toBe(0.0);
	});

	it("scopes search to single media", () => {
		const results = searchTranscriptions(transcriptions, {
			query: "the",
			mediaId: "interview-001",
		});
		// Only matches from interview, not tutorial
		expect(results.every((r) => r.mediaId === "interview-001")).toBe(true);
	});

	it("provides highlight offsets for UI rendering", () => {
		const results = searchTranscriptions(transcriptions, {
			query: "creative",
		});
		expect(results).toHaveLength(1);
		const r = results[0];
		const highlighted = r.segmentText.slice(r.matchStart, r.matchEnd);
		expect(highlighted).toBe("creative");
	});

	it("handles special characters safely", () => {
		const special = makeTranscription({
			mediaId: "special",
			segments: [
				{ text: "The price is $100 (USD).", start: 0, end: 2 },
				{ text: "Use regex like /^test$/", start: 3, end: 5 },
			],
		});
		const results = searchTranscriptions([special], { query: "$100" });
		expect(results).toHaveLength(1);

		const regexResults = searchTranscriptions([special], {
			query: "/^test$/",
		});
		expect(regexResults).toHaveLength(1);
	});

	it("returns empty results for empty transcription list", () => {
		const results = searchTranscriptions([], { query: "anything" });
		expect(results).toEqual([]);
	});

	it("handles very long segments efficiently", () => {
		const longText = "word ".repeat(1000); // 5000 chars
		const longTranscription = makeTranscription({
			mediaId: "long",
			segments: [{ text: longText, start: 0, end: 600 }],
		});

		const start = performance.now();
		const results = searchTranscriptions([longTranscription], {
			query: "word",
		});
		const elapsed = performance.now() - start;

		expect(results.length).toBe(1000);
		expect(elapsed).toBeLessThan(100); // Should be fast
	});

	it("maxResults limits output", () => {
		const results = searchTranscriptions(transcriptions, {
			query: "the",
			maxResults: 1,
		});
		expect(results).toHaveLength(1);
	});

	it("results maintain media order", () => {
		// Search for a term that appears in both
		const t1 = makeTranscription({
			mediaId: "first",
			segments: [{ text: "the test", start: 0, end: 1 }],
		});
		const t2 = makeTranscription({
			mediaId: "second",
			segments: [{ text: "the test", start: 0, end: 1 }],
		});
		const results = searchTranscriptions([t1, t2], { query: "the" });
		expect(results[0].mediaId).toBe("first");
		expect(results[1].mediaId).toBe("second");
	});
});
