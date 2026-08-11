import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_FILTER_RECENTS_STORAGE_KEY,
	loadJianyingFilterRecents,
	rememberJianyingFilter,
} from "../jianying-filter-lab-preferences";

describe("Jianying filter lab preferences", () => {
	beforeEach(() => {
		const storage = new Map<string, string>();
		vi.mocked(window.localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(window.localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
		vi.mocked(window.localStorage.removeItem).mockImplementation((key) => {
			storage.delete(key);
		});
		vi.mocked(window.localStorage.clear).mockImplementation(() =>
			storage.clear()
		);
	});

	it("normalizes duplicate and invalid recent resource ids", () => {
		window.localStorage.setItem(
			JIANYING_FILTER_RECENTS_STORAGE_KEY,
			JSON.stringify([" first ", "", "first", 42, "second"])
		);

		expect(loadJianyingFilterRecents()).toEqual(["first", "second"]);
	});

	it("moves the latest filter to the front and caps the history", () => {
		const current = Array.from({ length: 20 }, (_, index) => `filter-${index}`);

		const recent = rememberJianyingFilter({
			resourceId: "filter-10",
			current,
		});

		expect(recent).toHaveLength(20);
		expect(recent.slice(0, 3)).toEqual(["filter-10", "filter-0", "filter-1"]);
		expect(loadJianyingFilterRecents()).toEqual(recent);
	});

	it("keeps the in-memory result when local storage rejects writes", () => {
		const setItem = vi.mocked(window.localStorage.setItem);
		setItem.mockImplementation(() => {
			throw new Error("quota exceeded");
		});

		expect(
			rememberJianyingFilter({ resourceId: "filter-1", current: [] })
		).toEqual(["filter-1"]);
	});
});
