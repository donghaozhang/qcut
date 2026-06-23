import { describe, expect, it } from "vitest";
import { parseImageConsistencyResponse } from "../image-consistency-normalize.js";
import type { ImageCandidate } from "../types.js";

const batchCandidates: ImageCandidate[] = [
	{ index: 0, path: "gen0.png" },
	{ index: 1, path: "gen1.png" },
];

describe("parseImageConsistencyResponse", () => {
	it("parses clean JSON and maps imageIndex to path", () => {
		const findings = parseImageConsistencyResponse({
			response: JSON.stringify([
				{
					imageIndex: 1,
					category: "prop/material",
					severity: "high",
					comment: "plastic look",
					fix: "add texture",
				},
			]),
			batchCandidates,
		});
		expect(findings).toEqual([
			{
				imageIndex: 1,
				imagePath: "gen1.png",
				category: "prop/material",
				severity: "high",
				comment: "plastic look",
				fix: "add texture",
			},
		]);
	});

	it("strips markdown fences", () => {
		const findings = parseImageConsistencyResponse({
			response:
				'```json\n[{"imageIndex":0,"category":"identity/face","severity":"medium","comment":"face drift","fix":"check"}]\n```',
			batchCandidates,
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.imagePath).toBe("gen0.png");
	});

	it("salvages complete objects from truncated JSON", () => {
		const findings = parseImageConsistencyResponse({
			response:
				'[{"imageIndex":0,"category":"other","severity":"high","comment":"bad","fix":"fix"},{"imageIndex":1,"categ',
			batchCandidates,
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.imageIndex).toBe(0);
	});

	it("maps Chinese severity and keeps custom category", () => {
		const findings = parseImageConsistencyResponse({
			response: JSON.stringify([
				{
					imageIndex: 0,
					category: "红纸飞机材质/roof",
					severity: "严重",
					comment: "屋顶不一致",
					fix: "对齐参考",
				},
			]),
			batchCandidates,
		});
		expect(findings[0]?.severity).toBe("high");
		expect(findings[0]?.category).toBe("红纸飞机材质/roof");
	});

	it("rejects non-integer image indexes instead of rounding", () => {
		const findings = parseImageConsistencyResponse({
			response: JSON.stringify([
				{
					imageIndex: 0.6,
					category: "other",
					severity: "high",
					comment: "would round to candidate 1",
					fix: "reject",
				},
				{
					imageIndex: "1.6",
					category: "other",
					severity: "high",
					comment: "would parse to candidate 1.6",
					fix: "reject",
				},
				{
					imageIndex: "1",
					category: "other",
					severity: "high",
					comment: "valid string integer",
					fix: "keep",
				},
			]),
			batchCandidates,
		});

		expect(findings).toHaveLength(1);
		expect(findings[0]?.imageIndex).toBe(1);
	});

	it("drops out-of-range index and items missing comment", () => {
		const findings = parseImageConsistencyResponse({
			response: JSON.stringify([
				{ imageIndex: 9, category: "other", severity: "high", comment: "x" },
				{ imageIndex: 0, category: "other", severity: "high" },
			]),
			batchCandidates,
		});
		expect(findings).toHaveLength(0);
	});

	it("returns empty array for []", () => {
		expect(
			parseImageConsistencyResponse({ response: "[]", batchCandidates })
		).toEqual([]);
	});
});
