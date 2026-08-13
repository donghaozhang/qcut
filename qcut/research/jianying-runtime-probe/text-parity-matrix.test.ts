import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
	parseTextParityArgs,
	qualifyTextParityStatus,
} from "./text-parity-matrix";

describe("parseTextParityArgs", () => {
	test("defaults to a private ignored output directory", () => {
		const repositoryRoot = "/repo";
		const options = parseTextParityArgs({
			args: ["--matrix", "evidence/matrix.json"],
			repositoryRoot,
		});

		expect(options?.matrixPath).toBe(path.resolve("evidence/matrix.json"));
		expect(options?.outputDirectory).toBe(
			"/repo/.local/jianying-runtime/text-parity"
		);
		expect(options?.mode).toBe("run");
		expect(options?.highConfidenceRmse).toBe(4);
		expect(options?.foregroundRmse).toBe(8);
		expect(options?.maskIou).toBe(0.98);
		expect(options?.geometryPixels).toBe(2);
	});

	test("supports render-only and a stricter threshold", () => {
		const options = parseTextParityArgs({
			args: [
				"--matrix",
				"matrix.json",
				"--mode",
				"render",
				"--rmse-threshold",
				"2.5",
			],
			repositoryRoot: "/repo",
		});

		expect(options?.mode).toBe("render");
		expect(options?.highConfidenceRmse).toBe(2.5);
	});
});

describe("qualifyTextParityStatus", () => {
	test("does not count a successful QCut self-comparison as Jianying parity", () => {
		expect(
			qualifyTextParityStatus({
				metricStatus: "pass",
				referenceOrigin: "qcut-private-runtime-control",
			})
		).toBe("control");
	});

	test("fails a control whose comparison pipeline is not exact enough", () => {
		expect(
			qualifyTextParityStatus({
				metricStatus: "near",
				referenceOrigin: "qcut-private-runtime-control",
			})
		).toBe("fail");
	});

	test("preserves a Jianying App comparison result", () => {
		expect(
			qualifyTextParityStatus({
				metricStatus: "near",
				referenceOrigin: "jianying-app-export",
			})
		).toBe("near");
	});
});
