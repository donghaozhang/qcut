// @vitest-environment node

import { execFile } from "node:child_process";
import { cwd } from "node:process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

interface KernelCheckReport {
	blankFrameLost: boolean;
	perspectiveAverageErrorPx: number;
	perspectiveMaximumErrorPx: number;
	sequenceMaximumErrorPx: number;
	texturelessSeedRejected: boolean;
	translationInliers: number;
	translationMaximumErrorPx: number;
}

const execFileAsync = promisify(execFile);
let report: KernelCheckReport;

beforeAll(async () => {
	const result = await execFileAsync(
		"bun",
		["scripts/planar-tracking-kernel-check.ts"],
		{
			cwd: cwd(),
			maxBuffer: 1024 * 1024,
			timeout: 120_000,
		}
	);
	report = JSON.parse(result.stdout) as KernelCheckReport;
}, 120_000);

describe("OpenCV planar tracker kernel", () => {
	it("passes the real WASM synthetic accuracy suite", () => {
		expect(report.translationMaximumErrorPx).toBeLessThan(1);
		expect(report.translationInliers).toBeGreaterThanOrEqual(20);
		expect(report.perspectiveAverageErrorPx).toBeLessThan(2);
		expect(report.perspectiveMaximumErrorPx).toBeLessThan(5);
		expect(report.sequenceMaximumErrorPx).toBeLessThan(2);
		expect(report.blankFrameLost).toBe(true);
		expect(report.texturelessSeedRejected).toBe(true);
	});
});
