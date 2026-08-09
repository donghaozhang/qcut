import { describe, expect, test } from "bun:test";

import manifest from "./twenty-transition-manifest.json";

describe("twenty transition recovery manifest", () => {
	test("contains exactly twenty unique recovered transitions", () => {
		expect(manifest.catalog.selectedCount).toBe(20);
		expect(manifest.transitions).toHaveLength(20);
		expect(
			new Set(manifest.transitions.map(({ resourceId }) => resourceId)).size
		).toBe(20);
		expect(
			new Set(manifest.transitions.map(({ metadataMd5 }) => metadataMd5)).size
		).toBe(20);
	});

	test("records reproducible evidence and runtime validation for every item", () => {
		for (const transition of manifest.transitions) {
			expect(transition.durationSeconds).toBeGreaterThan(0);
			expect(transition.algorithmStatus).toBe("recovered");
			expect(transition.runtimeStatus).toBe("rendered-five-stop");
			expect(transition.algorithm.length).toBeGreaterThan(40);
			expect(transition.evidenceFiles.length).toBeGreaterThan(0);
			for (const evidenceFile of transition.evidenceFiles) {
				expect(evidenceFile.startsWith("/")).toBe(false);
				expect(evidenceFile.includes("..")).toBe(false);
			}
		}
	});

	test("pins the full-video and five-stop verification contract", () => {
		expect(manifest.runtimeValidation).toMatchObject({
			frameRate: 30,
			outputFrameCount: 240,
			progressStops: [0, 0.25, 0.5, 0.75, 1],
			renderHeight: 360,
			renderWidth: 640,
		});
	});
});
