import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import path from "node:path";
import {
	matchingDraftTransitions,
	scanDraftTransitions,
} from "../draft-transitions";
import {
	createTempRoot,
	writeJsonFile,
	writeTextFile,
} from "./test-helpers";

const tempRoots: string[] = [];

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

describe("draft transition evidence", () => {
	test("finds the outgoing owner and frame-quantized duration in a plaintext backup", () => {
		const projectRoot = createTempRoot({ prefix: "jy-transition-draft-" });
		tempRoots.push(projectRoot);
		const transitionId = "transition-uuid";
		writeTextFile({
			filePath: path.join(projectRoot, "draft_info.json"),
			content: "ZW5jcnlwdGVkLWJhc2U2NA==",
		});
		writeJsonFile({
			filePath: path.join(projectRoot, ".backup", "snapshot.load.bak"),
			value: {
				id: "project-1",
				name: "transition fixture",
				fps: 30,
				duration: 10_000_000,
				version: 360000,
				new_version: "120.0.0",
				platform: { app_version: "9.9.9" },
				materials: {
					transitions: [
						{
							id: transitionId,
							name: "烟雾转场",
							category_id: "39866",
							category_name: "模糊",
							duration: 1_466_666,
							effect_id: "97482746",
							resource_id: "7450031574923350555",
							is_overlap: true,
							path: "/cache/effect/97482746/hash",
							request_id: "request-1",
							platform: "all",
							type: "transition",
						},
					],
				},
				tracks: [
					{
						id: "track-1",
						type: "video",
						segments: [
							{
								id: "outgoing",
								material_id: "video-a",
								extra_material_refs: [transitionId],
								target_timerange: { start: 0, duration: 5_000_000 },
							},
							{
								id: "incoming",
								material_id: "video-b",
								extra_material_refs: [],
								target_timerange: {
									start: 5_000_000,
									duration: 5_000_000,
								},
							},
						],
					},
				],
			},
		});

		const scan = scanDraftTransitions({ rootPaths: [projectRoot] });
		const matches = matchingDraftTransitions({
			evidence: scan.evidence,
			title: "烟雾转场",
		});
		const evidence = matches[0];

		expect(scan).toMatchObject({
			scannedFiles: 2,
			parsedFiles: 1,
			skippedFiles: 1,
		});
		expect(matches).toHaveLength(1);
		expect(evidence?.sourceKind).toBe("backup");
		expect(evidence?.ownershipState).toBe("owned");
		expect(evidence?.owners[0]).toMatchObject({
			segmentIndex: 0,
			segmentId: "outgoing",
			seamDeltaMicroseconds: 0,
			isAdjacentSeam: true,
			nextSegment: { segmentIndex: 1, segmentId: "incoming" },
		});
		expect(evidence?.frameQuantization.exactFrameCount).toBe(44);
		expect(evidence?.frameQuantization.errorMicroseconds).toBeCloseTo(-2 / 3, 3);
	});
});
