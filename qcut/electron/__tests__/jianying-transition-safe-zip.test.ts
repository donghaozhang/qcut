import { describe, expect, it } from "vitest";
import { validateZipListings } from "../../research/jianying-runtime-probe/safe-zip.js";

describe("Jianying package ZIP validation", () => {
	it("accepts regular files and directories", () => {
		expect(() =>
			validateZipListings({
				entryNames: "package/\npackage/config.json\n",
				entryDetails:
					"drwxr-xr-x  3.0 unx 0 bx stor package/\n-rw-r--r--  3.0 unx 12 tx defN package/config.json\n",
			})
		).not.toThrow();
	});

	it("rejects path traversal and symbolic links", () => {
		expect(() =>
			validateZipListings({
				entryNames: "../config.json\n",
				entryDetails: "-rw-r--r--  3.0 unx 12 tx defN ../config.json\n",
			})
		).toThrow("Unsafe package archive entry");
		expect(() =>
			validateZipListings({
				entryNames: "config.json\n",
				entryDetails: "lrwxr-xr-x  3.0 unx 12 bx stor config.json\n",
			})
		).toThrow("Unsafe package archive entry type");
	});
});
