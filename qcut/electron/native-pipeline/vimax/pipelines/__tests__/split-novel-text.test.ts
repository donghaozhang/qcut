import { describe, it, expect } from "vitest";
import { splitNovelText } from "../novel2movie";

describe("splitNovelText", () => {
	it("throws when overlap is greater than or equal to chunk_size", () => {
		expect(() =>
			splitNovelText("short text", { chunk_size: 100, overlap: 100 })
		).toThrow(/overlap/);
	});

	it("throws when overlap exceeds 70% of chunk_size (prevents infinite loop)", () => {
		// Regression: the paragraph-snap branch can reduce the stride to
		// (0.7 * chunk_size + 2 - overlap); if overlap > 70% of chunk_size
		// the stride goes ≤ 0 and `start` walks backwards forever.
		expect(() =>
			splitNovelText("paragraph one.\n\nparagraph two.", {
				chunk_size: 100,
				overlap: 80,
			})
		).toThrow(/70%|forward progress/);
	});

	it("returns a single chunk when text fits in one chunk_size", () => {
		const text = "Hello world";
		const chunks = splitNovelText(text, { chunk_size: 100, overlap: 10 });
		expect(chunks).toEqual([text]);
	});

	it("splits text into overlapping chunks", () => {
		const text = "a".repeat(250);
		const chunks = splitNovelText(text, { chunk_size: 100, overlap: 20 });
		// Stride 80 produces chunks starting at 0, 80, 160, 240 — the
		// final iteration still emits a tiny tail chunk (matches the
		// original novel2movie behaviour we're preserving).
		expect(chunks.length).toBe(4);
		expect(chunks[0].length).toBe(100);
	});

	it("prefers paragraph boundary when one is close to the end", () => {
		const first = "First paragraph text.".padEnd(90, " ");
		const second = "Second paragraph text.".padEnd(90, " ");
		const text = `${first}\n\n${second}`;
		const chunks = splitNovelText(text, { chunk_size: 100, overlap: 10 });
		// First chunk should end on paragraph break (not mid-word).
		expect(chunks[0].endsWith("\n\n")).toBe(true);
	});
});
