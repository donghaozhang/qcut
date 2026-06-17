import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeConsistencyArtifacts } from "../consistency-artifacts.js";
import type { ConsistencyResult } from "../types.js";

function makeResult(): ConsistencyResult {
	return {
		video: "scene.mp4",
		model: "openrouter_gemini_3_5_flash_video",
		videoFps: 30,
		totalFrames: 90,
		referenceImages: ["ref.jpg"],
		samplingFps: 1,
		minSeverity: "high",
		findings: [
			{
				startFrame: 30,
				endFrame: 59,
				startTime: "00:00:01.000",
				endTime: "00:00:01.967",
				category: "proportion/height",
				severity: "high",
				comment: "Too short",
				fix: "Regenerate",
			},
		],
	};
}

describe("writeConsistencyArtifacts", () => {
	it("writes JSON, CSV, HTML, and Markdown reports", () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-consistency-"));

		const artifacts = writeConsistencyArtifacts({
			outputDir,
			result: makeResult(),
		});

		expect(existsSync(artifacts.jsonPath)).toBe(true);
		expect(existsSync(artifacts.csvPath)).toBe(true);
		expect(existsSync(artifacts.htmlPath)).toBe(true);
		expect(existsSync(artifacts.reportPath)).toBe(true);
		expect(readFileSync(artifacts.csvPath, "utf-8")).toContain(
			"startFrame,endFrame,startTime,endTime,category,severity,comment,fix"
		);
		expect(readFileSync(artifacts.htmlPath, "utf-8")).toContain("Too short");
		expect(readFileSync(artifacts.reportPath, "utf-8")).toContain(
			"Findings: 1"
		);
	});
});
