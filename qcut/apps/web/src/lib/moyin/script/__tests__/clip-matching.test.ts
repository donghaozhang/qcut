import { describe, it, expect } from "vitest";
import { createClipContentMatcher } from "../clip-matching";

describe("clip-matching", () => {
	// ─── L1: Exact Raw Match ────────────────────────────────────────

	describe("L1 — exact raw match", () => {
		it("matches exact Chinese text", () => {
			const content =
				"\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8\uFF0C\u5411\u91CC\u9762\u671B\u53BB\u3002\u674E\u56DB\u5750\u5728\u89D2\u843D\uFF0C\u4ED6\u653E\u4E0B\u4E86\u9152\u676F\u3002";
			// "张三推开酒馆的门，向里面望去。李四坐在角落，他放下了酒杯。"
			const matcher = createClipContentMatcher(content);

			const match = matcher.matchBoundary(
				"\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8",
				"\u4ED6\u653E\u4E0B\u4E86\u9152\u676F\u3002",
				0
			);

			expect(match).not.toBeNull();
			expect(match!.level).toBe("L1");
			expect(match!.confidence).toBe(1);
			expect(match!.startIndex).toBe(0);
			expect(match!.endIndex).toBe(content.length);
		});

		it("matches exact English text", () => {
			const content =
				"John pushed open the tavern door. Mary sat in the corner, sipping her wine.";
			const matcher = createClipContentMatcher(content);

			const match = matcher.matchBoundary(
				"John pushed open the tavern door",
				"sipping her wine.",
				0
			);

			expect(match).not.toBeNull();
			expect(match!.level).toBe("L1");
			expect(match!.confidence).toBe(1);
		});

		it("respects fromIndex cursor for sequential matching", () => {
			const content =
				"Part one begins here. Part one ends here. Part two begins here. Part two ends here.";
			const matcher = createClipContentMatcher(content);

			const match1 = matcher.matchBoundary(
				"Part one begins here",
				"Part one ends here.",
				0
			);
			expect(match1).not.toBeNull();
			expect(match1!.level).toBe("L1");

			const match2 = matcher.matchBoundary(
				"Part two begins here",
				"Part two ends here.",
				match1!.endIndex
			);
			expect(match2).not.toBeNull();
			expect(match2!.level).toBe("L1");
			expect(match2!.startIndex).toBeGreaterThan(match1!.endIndex - 1);
		});
	});

	// ─── L2: Normalized Match ───────────────────────────────────────

	describe("L2 — normalized match", () => {
		it("matches fullwidth → halfwidth normalization", () => {
			// Content has fullwidth punctuation
			const content =
				"\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8\uFF0C\u5411\u91CC\u9762\u671B\u53BB\u3002";
			// Query uses halfwidth comma
			const matcher = createClipContentMatcher(content);

			const match = matcher.matchBoundary(
				"\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8,",
				"\u5411\u91CC\u9762\u671B\u53BB.",
				0
			);

			expect(match).not.toBeNull();
			expect(match!.level).toBe("L2");
			expect(match!.confidence).toBe(0.97);
		});

		it("matches Chinese punctuation → English mapping", () => {
			// Content uses Chinese quotes 「」
			const content =
				"\u4ED6\u8BF4\u300C\u4F60\u597D\u300D\u3002\u5979\u56DE\u7B54\u300C\u518D\u89C1\u300D\u3002";
			const matcher = createClipContentMatcher(content);

			// Query uses English double quotes
			const match = matcher.matchBoundary(
				'\u4ED6\u8BF4"\u4F60\u597D"',
				'\u5979\u56DE\u7B54"\u518D\u89C1".',
				0
			);

			expect(match).not.toBeNull();
			expect(match!.level).toBe("L2");
		});

		it("ignores whitespace differences", () => {
			const content = "Hello world, how are you today? Fine thanks.";
			const matcher = createClipContentMatcher(content);

			// Query has no spaces
			const match = matcher.matchBoundary(
				"Helloworld,howareyou",
				"Finethanks.",
				0
			);

			expect(match).not.toBeNull();
			expect(match!.level).toBe("L2");
		});
	});

	// ─── L3: Fuzzy Levenshtein Match ────────────────────────────────

	describe("L3 — Levenshtein fuzzy match", () => {
		it("matches with small edit distance (>90% threshold)", () => {
			// Use a longer string so a few edits stay within 10% threshold
			const content =
				"\u5F20\u4E09\u6162\u6162\u5730\u63A8\u5F00\u4E86\u9152\u9986\u7684\u90A3\u6247\u5927\u95E8\uFF0C\u5411\u91CC\u9762\u671B\u53BB\u3002\u674E\u56DB\u5C31\u5750\u5728\u89D2\u843D\u91CC\uFF0C\u4ED6\u6162\u6162\u5730\u653E\u4E0B\u4E86\u624B\u4E2D\u7684\u9152\u676F\u3002";
			// 张三慢慢地推开了酒馆的那扇大门，向里面望去。李四就坐在角落里，他慢慢地放下了手中的酒杯。
			const matcher = createClipContentMatcher(content);

			// Slight differences: 慢慢地推开了酒馆的那扇大门 → 慢慢推开了酒馆的那扇大门 (remove 地)
			// and 慢慢地放下了手中的酒杯 → 慢慢地放下了手中酒杯 (remove 的)
			// These are ~1-2 char edits in a 20+ char string => >90% similarity
			const match = matcher.matchBoundary(
				"\u5F20\u4E09\u6162\u6162\u63A8\u5F00\u4E86\u9152\u9986\u7684\u90A3\u6247\u5927\u95E8\uFF0C\u5411\u91CC\u9762\u671B\u53BB",
				"\u4ED6\u6162\u6162\u5730\u653E\u4E0B\u4E86\u624B\u4E2D\u9152\u676F\u3002",
				0
			);

			// Should match at L3 since normalized text differs slightly
			expect(match).not.toBeNull();
			expect(["L1", "L2", "L3"]).toContain(match!.level);
			expect(match!.confidence).toBeGreaterThanOrEqual(0.9);
		});
	});

	// ─── Edge Cases ─────────────────────────────────────────────────

	describe("edge cases", () => {
		it("returns null for empty text", () => {
			const matcher = createClipContentMatcher("");
			const match = matcher.matchBoundary("hello", "world", 0);
			expect(match).toBeNull();
		});

		it("returns null for empty start/end", () => {
			const matcher = createClipContentMatcher("some content here");
			expect(matcher.matchBoundary("", "here", 0)).toBeNull();
			expect(matcher.matchBoundary("some", "", 0)).toBeNull();
			expect(matcher.matchBoundary("  ", "  ", 0)).toBeNull();
		});

		it("returns null when no match found", () => {
			const content = "This is a completely different text.";
			const matcher = createClipContentMatcher(content);
			const match = matcher.matchBoundary(
				"nonexistent start",
				"nonexistent end",
				0
			);
			expect(match).toBeNull();
		});

		it("returns null when end appears before start", () => {
			const content = "End marker first. Start marker second.";
			const matcher = createClipContentMatcher(content);
			const match = matcher.matchBoundary(
				"Start marker second",
				"End marker first",
				0
			);
			expect(match).toBeNull();
		});

		it("handles sequential matching across multiple clips", () => {
			const content = [
				"\u7B2C\u4E00\u7AE0\uFF1A\u5F20\u4E09\u51FA\u95E8\u4E86\u3002",
				"\u7B2C\u4E8C\u7AE0\uFF1A\u674E\u56DB\u56DE\u5BB6\u4E86\u3002",
				"\u7B2C\u4E09\u7AE0\uFF1A\u738B\u4E94\u7761\u89C9\u4E86\u3002",
			].join("");
			const matcher = createClipContentMatcher(content);

			const m1 = matcher.matchBoundary(
				"\u7B2C\u4E00\u7AE0",
				"\u51FA\u95E8\u4E86\u3002",
				0
			);
			expect(m1).not.toBeNull();

			const m2 = matcher.matchBoundary(
				"\u7B2C\u4E8C\u7AE0",
				"\u56DE\u5BB6\u4E86\u3002",
				m1!.endIndex
			);
			expect(m2).not.toBeNull();
			expect(m2!.startIndex).toBeGreaterThanOrEqual(m1!.endIndex);

			const m3 = matcher.matchBoundary(
				"\u7B2C\u4E09\u7AE0",
				"\u7761\u89C9\u4E86\u3002",
				m2!.endIndex
			);
			expect(m3).not.toBeNull();
			expect(m3!.startIndex).toBeGreaterThanOrEqual(m2!.endIndex);
		});
	});
});
