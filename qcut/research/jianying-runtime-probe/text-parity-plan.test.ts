import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	buildTextParityFrameWindow,
	readTextParityMatrix,
} from "./text-parity-plan";

function withMatrix({
	overrides = {},
	entryOverrides = {},
	assertion,
}: {
	overrides?: Record<string, unknown>;
	entryOverrides?: Record<string, unknown>;
	assertion: (matrixPath: string) => void;
}) {
	const directory = mkdtempSync(path.join(tmpdir(), "qcut-text-parity-"));
	const matrixPath = path.join(directory, "matrix.json");
	writeFileSync(
		matrixPath,
		JSON.stringify({
			frameRate: 30,
			canvas: { width: 1280, height: 720 },
			entries: [
				{
					title: "Static word art",
					resourceId: "7623376604814904638",
					packageHash: "99d51368afceae9b105af34b8403a79f",
					packageKind: "TextStyle",
					referenceVideo: "reference.mov",
					referenceOrigin: "jianying-app-export",
					referenceAppVersion: "11.3.0-beta3",
					content: "剪映花字验证ABC123",
					fontSize: 72,
					templateDuration: 3,
					elementDurationSeconds: 3,
					...entryOverrides,
				},
			],
			...overrides,
		})
	);
	try {
		assertion(matrixPath);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe("readTextParityMatrix", () => {
	test("defaults to a full-canvas centered render on black", () => {
		withMatrix({
			assertion: (matrixPath) => {
				const matrix = readTextParityMatrix({ matrixPath });
				expect(matrix.canvas.backgroundColor).toBe("#000000");
				expect(matrix.entries[0]?.transform).toEqual({
					x: 0,
					y: 0,
					width: 1280,
					height: 720,
					rotation: 0,
					opacity: 1,
				});
				expect(matrix.entries[0]?.captureDurationSeconds).toBe(3);
			},
		});
	});

	test("resolves references relative to the matrix", () => {
		withMatrix({
			assertion: (matrixPath) => {
				const matrix = readTextParityMatrix({ matrixPath });
				expect(matrix.entries[0]?.referenceVideo).toBe(
					path.join(path.dirname(matrixPath), "reference.mov")
				);
			},
		});
	});

	test("rejects a capture extending beyond the text element", () => {
		withMatrix({
			entryOverrides: {
				sourceStartSeconds: 2.5,
				captureDurationSeconds: 1,
			},
			assertion: (matrixPath) => {
				expect(() => readTextParityMatrix({ matrixPath })).toThrow(
					"capture exceeds the text element duration"
				);
			},
		});
	});

	test("requires an App version for a Jianying export", () => {
		withMatrix({
			entryOverrides: { referenceAppVersion: undefined },
			assertion: (matrixPath) => {
				expect(() => readTextParityMatrix({ matrixPath })).toThrow(
					"referenceAppVersion is required"
				);
			},
		});
	});

	test("accepts a QCut control without claiming an App version", () => {
		withMatrix({
			entryOverrides: {
				referenceOrigin: "qcut-private-runtime-control",
				referenceAppVersion: undefined,
			},
			assertion: (matrixPath) => {
				const matrix = readTextParityMatrix({ matrixPath });
				expect(matrix.entries[0]?.referenceOrigin).toBe(
					"qcut-private-runtime-control"
				);
				expect(matrix.entries[0]?.referenceAppVersion).toBeUndefined();
			},
		});
	});

	test("rejects duplicate package identities", () => {
		withMatrix({
			overrides: {
				entries: [
					{
						title: "A",
						resourceId: "same",
						packageHash: "99d51368afceae9b105af34b8403a79f",
						packageKind: "TextStyle",
						referenceVideo: "a.mov",
						referenceOrigin: "jianying-app-export",
						referenceAppVersion: "11.3.0-beta3",
						content: "A",
						fontSize: 72,
						templateDuration: 3,
						elementDurationSeconds: 3,
					},
					{
						title: "B",
						resourceId: "same",
						packageHash: "99d51368afceae9b105af34b8403a79f",
						packageKind: "TextStyle",
						referenceVideo: "b.mov",
						referenceOrigin: "jianying-app-export",
						referenceAppVersion: "11.3.0-beta3",
						content: "B",
						fontSize: 72,
						templateDuration: 3,
						elementDurationSeconds: 3,
					},
				],
			},
			assertion: (matrixPath) => {
				expect(() => readTextParityMatrix({ matrixPath })).toThrow(
					"Duplicate text parity identity"
				);
			},
		});
	});
});

describe("buildTextParityFrameWindow", () => {
	test("samples the complete 90-frame text interval", () => {
		withMatrix({
			assertion: (matrixPath) => {
				const matrix = readTextParityMatrix({ matrixPath });
				const entry = matrix.entries[0];
				if (!entry) throw new Error("Missing test entry");
				const window = buildTextParityFrameWindow({
					entry,
					frameRate: matrix.frameRate,
				});
				expect(window.endFrameExclusive).toBe(90);
				expect(window.samples.map((sample) => sample.frameIndex)).toEqual([
					0, 22, 45, 67, 89,
				]);
			},
		});
	});
});
