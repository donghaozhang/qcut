import { describe, expect, it } from "vitest";
import { JIANYING_FILTER_PARITY_CASES } from "../jianying-filter-parity/cases.js";
import { parseJianyingFilterParityArgs } from "../jianying-filter-parity/run.js";

describe("Jianying pure LUT parity suite", () => {
	it("selects one unique exact LUT for every panel category", () => {
		expect(JIANYING_FILTER_PARITY_CASES).toHaveLength(15);
		expect(
			new Set(JIANYING_FILTER_PARITY_CASES.map(({ category }) => category)).size
		).toBe(15);
		expect(
			new Set(JIANYING_FILTER_PARITY_CASES.map(({ lutId }) => lutId)).size
		).toBe(15);
		expect(JIANYING_FILTER_PARITY_CASES.map(({ order }) => order)).toEqual(
			Array.from({ length: 15 }, (_, index) => index + 1)
		);
	});

	it("stores identities rather than proprietary payload paths", () => {
		for (const caseItem of JIANYING_FILTER_PARITY_CASES) {
			expect(caseItem.lutId).toMatch(
				new RegExp(`^${caseItem.resourceId}/${caseItem.version}/`)
			);
			expect(caseItem.lutId.startsWith("/")).toBe(false);
			expect(caseItem.lutId).not.toContain("..");
		}
	});

	it("parses a bounded reproducible run", () => {
		const options = parseJianyingFilterParityArgs({
			argv: [
				"--source",
				"source.png",
				"--reference-dir",
				"jianying",
				"--run-dir",
				"run",
				"--concurrency",
				"6",
				"--no-persist",
			],
		});
		expect(options.concurrency).toBe(6);
		expect(options.persist).toBe(false);
		expect(options.sourcePath).toMatch(/source\.png$/);
	});

	it("rejects unsafe concurrency and incomplete input", () => {
		expect(() =>
			parseJianyingFilterParityArgs({
				argv: [
					"--source",
					"source.png",
					"--reference-dir",
					"jianying",
					"--run-dir",
					"run",
					"--concurrency",
					"7",
				],
			})
		).toThrow("1 to 6");
		expect(() =>
			parseJianyingFilterParityArgs({ argv: ["--source", "source.png"] })
		).toThrow("requires --source");
	});
});
