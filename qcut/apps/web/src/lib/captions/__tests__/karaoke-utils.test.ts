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

describe("caption-pool mechanism modes", () => {
	it("slam: the active word shrinks from large toward rest", () => {
		const early = getKaraokeSegments(sampleWords, 1.05, "slam");
		const late = getKaraokeSegments(sampleWords, 1.45, "slam");
		expect(early[0].scale).toBeGreaterThan(late[0].scale);
		expect(early[0].scale).toBeLessThanOrEqual(3);
		expect(late[0].scale).toBeCloseTo(1, 1);
		// Upcoming words stay hidden; spoken words rest at 1.
		expect(early[1].opacity).toBe(0);
		const after = getKaraokeSegments(sampleWords, 1.55, "slam");
		expect(after[0].scale).toBe(1);
		expect(after[0].opacity).toBe(1);
	});

	it("spring: the word overshoots past 1 before settling", () => {
		const peak = getKaraokeSegments(sampleWords, 1.0 + 0.5 * 0.2, "spring");
		expect(peak[0].scale).toBeGreaterThan(1.1);
		const settled = getKaraokeSegments(sampleWords, 1.49, "spring");
		expect(settled[0].scale).toBeCloseTo(1, 1);
	});

	it("overlap: the word drops from 1.35 to rest", () => {
		const start = getKaraokeSegments(sampleWords, 1.001, "overlap");
		expect(start[0].scale).toBeCloseTo(1.35, 1);
		const landed = getKaraokeSegments(sampleWords, 1.3, "overlap");
		expect(landed[0].scale).toBeCloseTo(1, 2);
	});

	it("expand: the word spreads up from 0.85", () => {
		const start = getKaraokeSegments(sampleWords, 1.001, "expand");
		expect(start[0].scale).toBeLessThan(0.9);
		const spread = getKaraokeSegments(sampleWords, 1.25, "expand");
		expect(spread[0].scale).toBeGreaterThan(1);
	});

	it("shine: the mid-word band highlights only the active word", () => {
		const mid = getKaraokeSegments(sampleWords, 1.25, "shine", "#ffffff");
		expect(mid[0].color).toBe("#ffffff");
		expect(mid[0].scale).toBeGreaterThan(1);
		expect(mid[1].color).toBeUndefined();
		expect(mid[1].opacity).toBe(1);
	});

	it("pulse: the active word bumps and everyone stays visible", () => {
		const bump = getKaraokeSegments(sampleWords, 1.12, "pulse");
		expect(bump[0].scale).toBeGreaterThan(1.05);
		expect(bump[1].scale).toBe(1);
		expect(bump[2].opacity).toBe(1);
	});
});

describe("second-batch mechanism modes", () => {
	it("fly-in: the active word rises with clearing blur", () => {
		const early = getKaraokeSegments(sampleWords, 1.05, "fly-in");
		expect(early[0].offsetY).toBeGreaterThan(0);
		expect(early[0].blurPx ?? 0).toBeGreaterThan(0);
		const landed = getKaraokeSegments(sampleWords, 1.49, "fly-in");
		expect(landed[0].offsetY).toBeCloseTo(0, 1);
	});

	it("gather: the word slides in from the right", () => {
		const early = getKaraokeSegments(sampleWords, 1.02, "gather");
		expect(early[0].offsetX ?? 0).toBeGreaterThan(10);
		const landed = getKaraokeSegments(sampleWords, 1.49, "gather");
		expect(landed[0].offsetX ?? 0).toBeCloseTo(0, 1);
	});

	it("flip: the word unwinds a full turn", () => {
		const early = getKaraokeSegments(sampleWords, 1.02, "flip");
		expect(early[0].rotationDeg ?? 0).toBeGreaterThan(180);
		const landed = getKaraokeSegments(sampleWords, 1.49, "flip");
		expect(Math.abs(landed[0].rotationDeg ?? 0)).toBeLessThan(15);
	});

	it("blur-roll: the pulse train peaks then settles", () => {
		const peak = getKaraokeSegments(sampleWords, 1.15, "blur-roll");
		expect(peak[0].scale).toBeGreaterThan(1.2);
		const settle = getKaraokeSegments(sampleWords, 1.49, "blur-roll");
		expect(settle[0].scale).toBeGreaterThan(0.85);
		expect(settle[0].scale).toBeLessThan(1.25);
	});

	it("glitch: flicker is deterministic and settles solid", () => {
		const a = getKaraokeSegments(sampleWords, 1.2, "glitch", "#00ff00");
		const b = getKaraokeSegments(sampleWords, 1.2, "glitch", "#00ff00");
		expect(a[0].opacity).toBe(b[0].opacity);
		const settled = getKaraokeSegments(sampleWords, 1.45, "glitch");
		expect(settled[0].opacity).toBe(1);
	});

	it("mischief: the word dips and rocks through its slot", () => {
		const rockIn = getKaraokeSegments(sampleWords, 1.05, "mischief");
		expect(rockIn[0].rotationDeg ?? 0).toBeLessThan(0);
		const rockOut = getKaraokeSegments(sampleWords, 1.35, "mischief");
		expect(rockOut[0].rotationDeg ?? 0).toBeGreaterThan(0);
	});
});
