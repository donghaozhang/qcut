import { describe, expect, it } from "vitest";
import { resolveReviewProjectDuration } from "../review-project";

describe("resolveReviewProjectDuration", () => {
	it("keeps a remote duration when the local timeline is empty", () => {
		expect(
			resolveReviewProjectDuration({
				remoteDuration: 5,
				timelineDuration: 0,
			})
		).toBe(5);
	});

	it("uses the longer local content duration", () => {
		expect(
			resolveReviewProjectDuration({
				remoteDuration: 5,
				timelineDuration: 12.5,
			})
		).toBe(12.5);
	});

	it("ignores invalid duration values", () => {
		expect(
			resolveReviewProjectDuration({
				remoteDuration: Number.NaN,
				timelineDuration: -1,
			})
		).toBe(0);
	});
});
