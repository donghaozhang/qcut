import { describe, expect, it } from "vitest";
import { generateSrt, type WordTimestamp } from "../srt-generator.js";

function w(word: string, start: number, end: number): WordTimestamp {
	return { word, start, end };
}

function entryTexts(srt: string): string[] {
	return srt
		.split("\n\n")
		.filter((block) => block.trim())
		.map((block) => block.trim().split("\n")[2]);
}

describe("generateSrt", () => {
	it("joins Latin words with spaces", () => {
		const srt = generateSrt([
			w("Hello", 0, 0.5),
			w("world", 0.5, 1),
			w("again", 1, 1.5),
		]);
		expect(entryTexts(srt)).toEqual(["Hello world again"]);
	});

	it("joins CJK tokens without inserting spaces", () => {
		const srt = generateSrt([
			w("很", 0, 0.2),
			w("开", 0.2, 0.4),
			w("心", 0.4, 0.6),
			w("见", 0.6, 0.8),
			w("到", 0.8, 1),
			w("大", 1, 1.2),
			w("家", 1.2, 1.4),
		]);
		expect(entryTexts(srt)).toEqual(["很开心见到大家"]);
	});

	it("keeps mixed CJK/Latin spacing consistent with the source", () => {
		const srt = generateSrt([
			w("首", 0, 0.2),
			w("先", 0.2, 0.4),
			w("是", 0.4, 0.6),
			w("ChatGPT", 0.6, 1),
			w("五", 1, 1.2),
		]);
		expect(entryTexts(srt)).toEqual(["首先是ChatGPT五"]);
	});

	it("never starts a subtitle line with punctuation", () => {
		const words: WordTimestamp[] = [];
		for (let i = 0; i < 8; i++) {
			words.push(w(String.fromCharCode(0x4e00 + i), i * 0.2, (i + 1) * 0.2));
		}
		// Punctuation lands exactly at the maxWords boundary.
		words.push(w("。", 1.6, 1.7));
		words.push(w("新", 1.7, 1.9));
		const srt = generateSrt(words, { maxWords: 8 });
		const texts = entryTexts(srt);
		expect(texts).toHaveLength(2);
		expect(texts[0].endsWith("。")).toBe(true);
		expect(texts[1]).toBe("新");
	});

	it("moves a token's leading punctuation onto the previous line", () => {
		const words: WordTimestamp[] = [];
		for (let i = 0; i < 8; i++) {
			words.push(w(String.fromCharCode(0x4e00 + i), i * 0.2, (i + 1) * 0.2));
		}
		// STT glued the previous clause's comma onto the next token.
		words.push(w("，Sol，", 1.6, 2.0));
		const srt = generateSrt(words, { maxWords: 8 });
		const texts = entryTexts(srt);
		expect(texts).toHaveLength(2);
		expect(texts[0].endsWith("，")).toBe(true);
		expect(texts[1]).toBe("Sol，");
	});

	it("splits on maxDuration", () => {
		const srt = generateSrt(
			[w("one", 0, 3), w("two", 3, 5), w("three", 5, 6)],
			{ maxDuration: 4 }
		);
		expect(entryTexts(srt)).toEqual(["one", "two three"]);
	});

	it("drops whitespace-only groups instead of emitting empty entries", () => {
		const srt = generateSrt([w(" ", 0, 5), w("hi", 5, 5.5)], {
			maxDuration: 4,
		});
		expect(entryTexts(srt)).toEqual(["hi"]);
	});
});
