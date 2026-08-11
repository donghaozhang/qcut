import { describe, expect, it } from "vitest";
import {
	JIANYING_MULTI_PASS_CASES,
	parseMultiPassRunArgs,
} from "../jianying-filter-parity/run-multi-pass";

describe("Jianying multi-pass evidence runner", () => {
	it("keeps package identities unique and payload-free", () => {
		expect(JIANYING_MULTI_PASS_CASES).toHaveLength(3);
		expect(
			new Set(JIANYING_MULTI_PASS_CASES.map(({ resourceId }) => resourceId))
				.size
		).toBe(3);
		for (const caseItem of JIANYING_MULTI_PASS_CASES) {
			expect(caseItem.resourceId).toMatch(/^\d+$/);
			expect(caseItem.version).toMatch(/^[a-f0-9]+$/);
			expect(caseItem).not.toHaveProperty("filePath");
		}
	});

	it("requires explicit source and run directories", () => {
		expect(
			parseMultiPassRunArgs({
				argv: ["--source", "source.png", "--run-dir", "evidence"],
			})
		).toMatchObject({
			sourcePath: expect.stringContaining("source.png"),
			runDirectory: expect.stringContaining("evidence"),
		});
		expect(() => parseMultiPassRunArgs({ argv: [] })).toThrow(
			"requires --source and --run-dir"
		);
	});
});
