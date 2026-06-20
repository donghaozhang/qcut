import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeImageConsistencyArtifacts } from "../image-consistency-artifacts.js";
import type { ImageConsistencyResult } from "../types.js";

function makeResult({
	findings,
}: {
	findings: ImageConsistencyResult["findings"];
}): ImageConsistencyResult {
	return {
		model: "openrouter_gemini_3_5_flash_video",
		language: "zh",
		referenceImages: ["ref.png"],
		candidateImages: ["gen0.png", "gen1.png"],
		ruleApplied: true,
		minSeverity: "high",
		findings,
	};
}

describe("writeImageConsistencyArtifacts", () => {
	it("writes all four artifacts with matching CSV rows", () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-image-art-"));
		const result = makeResult({
			findings: [
				{
					imageIndex: 1,
					imagePath: "gen1.png",
					category: "prop/material",
					severity: "high",
					comment: "plastic look",
					fix: "add texture",
				},
			],
		});

		const artifacts = writeImageConsistencyArtifacts({ outputDir, result });

		expect(existsSync(artifacts.jsonPath)).toBe(true);
		expect(existsSync(artifacts.csvPath)).toBe(true);
		expect(existsSync(artifacts.htmlPath)).toBe(true);
		expect(existsSync(artifacts.reportPath)).toBe(true);

		const csv = readFileSync(artifacts.csvPath, "utf-8").trim().split("\n");
		expect(csv[0]).toBe("imageIndex,imagePath,category,severity,comment,fix");
		expect(csv).toHaveLength(2);
		expect(csv[1]).toContain("gen1.png");

		expect(readFileSync(artifacts.reportPath, "utf-8")).toContain(
			"Findings: 1"
		);
	});

	it("renders an empty-findings report", () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-image-art-"));
		const artifacts = writeImageConsistencyArtifacts({
			outputDir,
			result: makeResult({ findings: [] }),
		});
		const report = readFileSync(artifacts.reportPath, "utf-8");
		expect(report).toContain("Findings: 0");
		expect(report).toContain("No obvious image consistency issues.");
	});
});
