import { describe, expect, it } from "vitest";

import { takeNewCompleteLinesFromChunk } from "./streaming.js";

describe("takeNewCompleteLinesFromChunk", () => {
	it("emits complete lines while keeping partial chunks", () => {
		const cursor = { partial: "", size: 0 };

		expect(
			takeNewCompleteLinesFromChunk({
				chunk: "first\nsec",
				cursor,
				size: 9,
				truncated: false,
			})
		).toBe("first");
		expect(cursor).toEqual({ partial: "sec", size: 9 });

		expect(
			takeNewCompleteLinesFromChunk({
				chunk: "ond\n",
				cursor,
				size: 13,
				truncated: false,
			})
		).toBe("second");
		expect(cursor).toEqual({ partial: "", size: 13 });
	});

	it("drops stale partial text after remote file truncation", () => {
		const cursor = { partial: "old-partial", size: 42 };

		expect(
			takeNewCompleteLinesFromChunk({
				chunk: "fresh\n",
				cursor,
				size: 6,
				truncated: true,
			})
		).toBe("fresh");
		expect(cursor).toEqual({ partial: "", size: 6 });
	});
});
