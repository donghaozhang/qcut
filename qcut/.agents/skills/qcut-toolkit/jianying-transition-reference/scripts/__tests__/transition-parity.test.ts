import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import path from "node:path";
import {
	buildTransitionParityReport,
	compareCaptureImages,
	compareParityManifest,
} from "../transition-parity";
import {
	createTempRoot,
	writeJsonFile,
	writePpm,
} from "./test-helpers";

const tempRoots: string[] = [];

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

describe("transition parity", () => {
	test("computes deterministic RGB metrics", async () => {
		const tempRoot = createTempRoot({ prefix: "jy-transition-parity-" });
		tempRoots.push(tempRoot);
		const referencePath = path.join(tempRoot, "reference.ppm");
		const candidatePath = path.join(tempRoot, "candidate.ppm");
		writePpm({
			filePath: referencePath,
			width: 2,
			height: 1,
			pixels: [10, 20, 30, 40, 50, 60],
		});
		writePpm({
			filePath: candidatePath,
			width: 2,
			height: 1,
			pixels: [14, 24, 34, 44, 54, 64],
		});

		const metrics = await compareCaptureImages({
			referencePath,
			candidatePath,
		});

		expect(metrics).toMatchObject({
			width: 2,
			height: 1,
			channelCount: 3,
			sampleCount: 6,
			mae: 4,
			rmse: 4,
			maxAbsoluteError: 4,
			p95AbsoluteError: 4,
		});
	});

	test("requires five preview and export stops for high confidence", async () => {
		const tempRoot = createTempRoot({ prefix: "jy-transition-manifest-" });
		tempRoots.push(tempRoot);
		const referencePath = path.join(tempRoot, "reference.ppm");
		const candidatePath = path.join(tempRoot, "candidate.ppm");
		writePpm({
			filePath: referencePath,
			width: 2,
			height: 1,
			pixels: [10, 20, 30, 40, 50, 60],
		});
		writePpm({
			filePath: candidatePath,
			width: 2,
			height: 1,
			pixels: [14, 24, 34, 44, 54, 64],
		});
		const manifestPath = path.join(tempRoot, "manifest.json");
		writeJsonFile({
			filePath: manifestPath,
			value: {
				transitionTitle: "叠化",
				formula: "C(p) = (1 - p) A + p B",
				samples: [0, 0.25, 0.5, 0.75, 1].map((progress) => ({
					progress,
					jianying: "reference.ppm",
					qcutPreview: "candidate.ppm",
					qcutExport: "candidate.ppm",
				})),
			},
		});

		const capture = await compareParityManifest({ manifestPath });
		const report = buildTransitionParityReport({
			transitionTitle: "叠化",
			catalogVersionCount: 1,
			draftInstanceCount: 1,
			packageCount: 1,
			packageFamilies: ["simple-glsl"],
			capture,
		});

		expect(capture.complete).toBe(true);
		expect(capture.comparisons).toHaveLength(10);
		expect(capture.preview.worstRmse).toBe(4);
		expect(capture.export.worstRmse).toBe(4);
		expect(report.confidence).toBe("high");
	});

	test("keeps a structural-only report unverified", () => {
		const report = buildTransitionParityReport({
			transitionTitle: "立方旋转",
			catalogVersionCount: 1,
			draftInstanceCount: 1,
			packageCount: 1,
			packageFamilies: ["lumi-ae"],
			formula: "manual derivation pending",
		});

		expect(report.confidence).toBe("unverified");
		expect(report.reasons).toContain("no comparable frame captures were provided");
	});
});
