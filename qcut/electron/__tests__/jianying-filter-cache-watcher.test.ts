// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldInvalidateJianyingFilterCache } from "../jianying-filter-cache-watcher";

describe("Jianying filter cache watcher", () => {
	it("reacts to downloaded filter package changes", () => {
		expect(
			shouldInvalidateJianyingFilterCache({
				directory: "artistEffect",
				fileName: "123/version/filter.cube.vf",
			})
		).toBe(true);
	});

	it.each([
		"rp.db-shm",
		"rp.db-wal",
		"rp.db-journal",
	])("ignores SQLite runtime file %s", (fileName) => {
		expect(
			shouldInvalidateJianyingFilterCache({
				directory: "ressdk_db",
				fileName: `catalog/${fileName}`,
			})
		).toBe(false);
	});

	it("still reacts to persistent metadata database changes", () => {
		expect(
			shouldInvalidateJianyingFilterCache({
				directory: "ressdk_db",
				fileName: "catalog/rp.db",
			})
		).toBe(true);
	});
});
