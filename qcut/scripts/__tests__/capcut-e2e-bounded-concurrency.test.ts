import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../capcut-e2e/bounded-concurrency.js";

describe("CapCut E2E bounded concurrency", () => {
	it("preserves input order while limiting active work", async () => {
		let active = 0;
		let maximumActive = 0;
		const results = await mapWithConcurrency({
			concurrency: 2,
			items: [30, 5, 20, 1],
			mapper: async ({ item }) => {
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				await new Promise((resolve) => setTimeout(resolve, item));
				active -= 1;
				return item * 2;
			},
		});

		expect(results).toEqual([60, 10, 40, 2]);
		expect(maximumActive).toBe(2);
	});

	it("processes defined array positions whose value is undefined", async () => {
		const results = await mapWithConcurrency({
			concurrency: 1,
			items: [undefined, "after"] as Array<string | undefined>,
			mapper: async ({ item }) => item ?? "missing",
		});

		expect(results).toEqual(["missing", "after"]);
	});

	it("supports empty input and rejects invalid concurrency", async () => {
		await expect(
			mapWithConcurrency({
				concurrency: 3,
				items: [],
				mapper: async ({ item }: { item: number }) => item,
			})
		).resolves.toEqual([]);
		await expect(
			mapWithConcurrency({
				concurrency: 0,
				items: [1],
				mapper: async ({ item }) => item,
			})
		).rejects.toThrow("positive integer");
	});
});
