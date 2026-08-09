import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

describe("mapWithConcurrency", () => {
	it("preserves result order while enforcing the concurrency limit", async () => {
		let activeCount = 0;
		let maximumActiveCount = 0;
		const results = await mapWithConcurrency({
			items: [30, 5, 20, 10],
			limit: 2,
			task: async ({ item }) => {
				activeCount += 1;
				maximumActiveCount = Math.max(maximumActiveCount, activeCount);
				await new Promise((resolve) => setTimeout(resolve, item));
				activeCount -= 1;
				return item * 2;
			},
		});

		expect(results).toEqual([60, 10, 40, 20]);
		expect(maximumActiveCount).toBe(2);
	});

	it("rejects invalid limits and task failures", async () => {
		await expect(
			mapWithConcurrency({
				items: [1],
				limit: 0,
				task: async ({ item }) => item,
			})
		).rejects.toThrow("positive integer");
		await expect(
			mapWithConcurrency({
				items: [1, 2],
				limit: 1,
				task: async ({ item }) => {
					if (item === 2) throw new Error("task failed");
					return item;
				},
			})
		).rejects.toThrow("task failed");
	});
});
