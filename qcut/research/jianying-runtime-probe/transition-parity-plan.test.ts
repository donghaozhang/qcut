import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	buildTransitionFrameWindow,
	classifyParityResult,
	engineProgressForTransitionFrame,
	readTransitionParityMatrix,
} from "./transition-parity-plan";

function withMatrix({
	renderSize,
	holdExactEndpoints,
	assertion,
}: {
	renderSize?: unknown;
	holdExactEndpoints?: unknown;
	assertion: (matrixPath: string) => void;
}) {
	const directory = mkdtempSync(path.join(tmpdir(), "qcut-transition-matrix-"));
	const matrixPath = path.join(directory, "matrix.json");
	const matrix = {
		inputA: "input-a.mp4",
		inputB: "input-b.mp4",
		frameRate: 30,
		cutFrame: 120,
		...(renderSize === undefined ? {} : { renderSize }),
		entries: [
			{
				title: "Dissolve",
				resourceId: "resource-id",
				metadataMd5: "metadata-md5",
				packagePath: "package",
				referenceVideo: "reference.mp4",
				durationSeconds: 0.5,
				...(holdExactEndpoints === undefined ? {} : { holdExactEndpoints }),
			},
		],
	};
	writeFileSync(matrixPath, JSON.stringify(matrix));
	try {
		assertion(matrixPath);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe("readTransitionParityMatrix", () => {
	test("keeps the Jianying engine render size separate from comparison media", () => {
		withMatrix({
			renderSize: { width: 3840, height: 2160 },
			assertion: (matrixPath) => {
				expect(readTransitionParityMatrix({ matrixPath }).renderSize).toEqual({
					width: 3840,
					height: 2160,
				});
			},
		});
	});

	test("defaults to the comparison size when renderSize is omitted", () => {
		withMatrix({
			assertion: (matrixPath) => {
				const matrix = readTransitionParityMatrix({ matrixPath });
				expect(matrix.renderSize).toBeNull();
				expect(matrix.entries[0]?.holdExactEndpoints).toBe(false);
			},
		});
	});

	test("accepts an explicit endpoint hold policy", () => {
		withMatrix({
			holdExactEndpoints: true,
			assertion: (matrixPath) => {
				expect(
					readTransitionParityMatrix({ matrixPath }).entries[0]
						?.holdExactEndpoints
				).toBe(true);
			},
		});
	});

	test("rejects incomplete render dimensions", () => {
		withMatrix({
			renderSize: { width: 3840 },
			assertion: (matrixPath) => {
				expect(() => readTransitionParityMatrix({ matrixPath })).toThrow(
					"matrix.renderSize.height must be an even integer"
				);
			},
		});
	});

	test("rejects dimensions that the YUV420 pipeline would round", () => {
		withMatrix({
			renderSize: { width: 3839, height: 2160 },
			assertion: (matrixPath) => {
				expect(() => readTransitionParityMatrix({ matrixPath })).toThrow(
					"matrix.renderSize.width must be an even integer"
				);
			},
		});
	});

	test("rejects a non-boolean endpoint policy", () => {
		withMatrix({
			holdExactEndpoints: 1,
			assertion: (matrixPath) => {
				expect(() => readTransitionParityMatrix({ matrixPath })).toThrow(
					"entries[0].holdExactEndpoints must be a boolean"
				);
			},
		});
	});
});

describe("buildTransitionFrameWindow", () => {
	test("matches the observed 15-frame dissolve window", () => {
		const window = buildTransitionFrameWindow({
			frameRate: 30,
			durationSeconds: 0.5,
			cutFrame: 120,
		});

		expect(window.transitionFrames).toBe(15);
		expect(window.startFrame).toBe(113);
		expect(window.endFrameInclusive).toBe(127);
		expect(window.samples.map((sample) => sample.frameIndex)).toEqual([
			113, 117, 120, 124, 127,
		]);
	});

	test("centers an even 30-frame transition on the cut", () => {
		const window = buildTransitionFrameWindow({
			frameRate: 30,
			durationSeconds: 1,
			cutFrame: 120,
		});

		expect(window.startFrame).toBe(105);
		expect(window.endFrameInclusive).toBe(134);
		expect(window.samples.map((sample) => sample.frameIndex)).toEqual([
			105, 112, 120, 127, 134,
		]);
	});
});

describe("engineProgressForTransitionFrame", () => {
	test("puts the cut frame at exactly one half for odd windows", () => {
		expect(
			engineProgressForTransitionFrame({
				frameIndex: 7,
				transitionFrames: 15,
			})
		).toBe(0.5);
		expect(
			engineProgressForTransitionFrame({
				frameIndex: 14,
				transitionFrames: 15,
			})
		).toBe(1);
	});

	test("puts the cut frame at exactly one half for even windows", () => {
		expect(
			engineProgressForTransitionFrame({
				frameIndex: 15,
				transitionFrames: 30,
			})
		).toBe(0.5);
		expect(
			engineProgressForTransitionFrame({
				frameIndex: 29,
				transitionFrames: 30,
			})
		).toBe(29 / 30);
	});

	test("rejects frame indices outside the transition window", () => {
		expect(() =>
			engineProgressForTransitionFrame({
				frameIndex: 30,
				transitionFrames: 30,
			})
		).toThrow("frameIndex must belong to the transition window");
	});
});

describe("classifyParityResult", () => {
	test("requires both five-stop and full-interval RMSE to pass", () => {
		expect(
			classifyParityResult({
				fiveStopWorstRmse: 6,
				fullIntervalRmse: 7,
				highConfidenceRmse: 8,
			})
		).toBe("pass");
		expect(
			classifyParityResult({
				fiveStopWorstRmse: 9,
				fullIntervalRmse: 7,
				highConfidenceRmse: 8,
			})
		).toBe("near");
		expect(
			classifyParityResult({
				fiveStopWorstRmse: 17,
				fullIntervalRmse: 7,
				highConfidenceRmse: 8,
			})
		).toBe("fail");
	});
});
