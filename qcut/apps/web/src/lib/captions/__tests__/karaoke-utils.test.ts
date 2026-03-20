import { describe, it, expect } from "vitest";
import { getKaraokeSegments, clamp, easeOutBounce } from "../karaoke-utils";
import type { KaraokeMode } from "../karaoke-types";
import type { WordItem } from "@/types/word-timeline";

/** Helper: create a WordItem */
function word(id: string, text: string, start: number, end: number): WordItem {
	return {
		id,
		text,
		start,
		end,
		type: "word",
		filterState: "none",
	};
}

const sampleWords: WordItem[] = [
	word("w1", "Hello", 1.0, 1.5),
	word("w2", "beautiful", 1.6, 2.2),
	word("w3", "world", 2.3, 2.8),
];

describe("clamp", () => {
	it("clamps value within range", () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(15, 0, 10)).toBe(10);
	});
});

describe("easeOutBounce", () => {
	it("returns 0 at t=0 and ~1 at t=1", () => {
		expect(easeOutBounce(0)).toBeCloseTo(0, 2);
		expect(easeOutBounce(1)).toBeCloseTo(1, 2);
	});
});

describe("getKaraokeSegments", () => {
	it("returns empty array for empty words", () => {
		const result = getKaraokeSegments([], 1.0, "word-highlight");
		expect(result).toHaveLength(0);
	});

	describe("mode: none", () => {
		it("returns all words as completed with full opacity", () => {
			const result = getKaraokeSegments(sampleWords, 1.0, "none");
			expect(result).toHaveLength(3);
			for (const seg of result) {
				expect(seg.state).toBe("completed");
				expect(seg.opacity).toBe(1);
				expect(seg.scale).toBe(1);
			}
		});
	});

	describe("mode: word-highlight", () => {
		it("marks the current word as active with highlight color", () => {
			const result = getKaraokeSegments(
				sampleWords,
				1.2,
				"word-highlight",
				"#ff0000"
			);
			expect(result[0].state).toBe("active");
			expect(result[0].color).toBe("#ff0000");
			expect(result[0].scale).toBe(1.15);
			expect(result[0].offsetY).toBe(-2);
		});

		it("marks past words as completed", () => {
			const result = getKaraokeSegments(
				sampleWords,
				2.5,
				"word-highlight",
				"#ff0000"
			);
			expect(result[0].state).toBe("completed");
			expect(result[1].state).toBe("completed");
			expect(result[2].state).toBe("active");
		});

		it("marks future words as upcoming without color override", () => {
			const result = getKaraokeSegments(sampleWords, 0.5, "word-highlight");
			for (const seg of result) {
				expect(seg.state).toBe("upcoming");
				expect(seg.color).toBeUndefined();
			}
		});
	});

	describe("mode: karaoke (progressive fill)", () => {
		it("uses gradient for active word", () => {
			const result = getKaraokeSegments(
				sampleWords,
				1.25,
				"karaoke",
				"#ffff00",
				"rgba(255,255,255,0.5)"
			);
			// Word 1: start=1.0, end=1.5, time=1.25 → 50% progress
			expect(result[0].state).toBe("active");
			expect(result[0].color).toContain("linear-gradient");
			expect(result[0].color).toContain("50%");
		});

		it("uses upcoming color for future words", () => {
			const result = getKaraokeSegments(
				sampleWords,
				1.2,
				"karaoke",
				"#ffff00",
				"gray"
			);
			expect(result[1].color).toBe("gray");
			expect(result[2].color).toBe("gray");
		});

		it("uses highlight color for completed words", () => {
			const result = getKaraokeSegments(sampleWords, 3.0, "karaoke", "#ffff00");
			for (const seg of result) {
				expect(seg.state).toBe("completed");
				expect(seg.color).toBe("#ffff00");
			}
		});
	});

	describe("mode: word-by-word", () => {
		it("returns only the active word", () => {
			const result = getKaraokeSegments(sampleWords, 1.7, "word-by-word");
			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("beautiful");
			expect(result[0].state).toBe("active");
		});

		it("returns last word after all words end", () => {
			const result = getKaraokeSegments(sampleWords, 5.0, "word-by-word");
			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("world");
			expect(result[0].state).toBe("completed");
		});

		it("returns empty before any word starts", () => {
			const result = getKaraokeSegments(sampleWords, 0.5, "word-by-word");
			expect(result).toHaveLength(0);
		});
	});

	describe("mode: bounce", () => {
		it("hides future words", () => {
			const result = getKaraokeSegments(sampleWords, 0.5, "bounce");
			for (const seg of result) {
				expect(seg.state).toBe("hidden");
				expect(seg.opacity).toBe(0);
				expect(seg.scale).toBe(0);
			}
		});

		it("animates words that have started", () => {
			const result = getKaraokeSegments(sampleWords, 1.3, "bounce");
			// Word 1 started at 1.0, so it should be visible
			expect(result[0].opacity).toBeGreaterThan(0);
			expect(result[0].scale).toBeGreaterThan(0);
			// Word 2 hasn't started yet
			expect(result[1].state).toBe("hidden");
		});
	});

	describe("mode: typewriter", () => {
		it("shows only words that have started", () => {
			const result = getKaraokeSegments(sampleWords, 1.7, "typewriter");
			// Words 1 and 2 have started (1.0 and 1.6)
			expect(result).toHaveLength(2);
			expect(result[0].text).toBe("Hello");
			expect(result[1].text).toBe("beautiful");
		});

		it("fades in the last visible word", () => {
			// Word 2 starts at 1.6, test at 1.605 — should be fading in
			const result = getKaraokeSegments(sampleWords, 1.605, "typewriter");
			const lastSeg = result[result.length - 1];
			expect(lastSeg.text).toBe("beautiful");
			expect(lastSeg.opacity).toBeGreaterThan(0);
			expect(lastSeg.opacity).toBeLessThanOrEqual(1);
		});

		it("returns empty before any word", () => {
			const result = getKaraokeSegments(sampleWords, 0.5, "typewriter");
			expect(result).toHaveLength(0);
		});
	});

	it("preserves wordId from source", () => {
		const modes: KaraokeMode[] = [
			"none",
			"word-highlight",
			"karaoke",
			"bounce",
			"typewriter",
		];
		for (const mode of modes) {
			const result = getKaraokeSegments(sampleWords, 2.0, mode);
			for (const seg of result) {
				expect(seg.wordId).toBeTruthy();
			}
		}
	});
});
