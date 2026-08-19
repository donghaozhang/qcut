import { describe, expect, it } from "vitest";
import {
	parseDraftInteropDocumentV1,
	type DraftInteropDocumentV1,
	type InteropSegment,
} from "../draft-interop/index.js";
import { mapInteropDocumentToQCutPlan } from "../jianying-draft/index.js";

const RESOURCE_ID = "video-resource";

function createSegment({
	overrides,
}: {
	overrides: Partial<InteropSegment>;
}): InteropSegment {
	return {
		id: "segment-1",
		kind: "video",
		resourceId: RESOURCE_ID,
		sourceRange: { startUs: 0, durationUs: 2_000_000 },
		targetRange: { startUs: 0, durationUs: 2_000_000 },
		capability: "exact",
		...overrides,
	};
}

function createDocument({
	segments,
}: {
	segments: InteropSegment[];
}): DraftInteropDocumentV1 {
	return {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "jianying",
			profileId: "jianying-desktop-11.3-beta4",
			platform: "macos",
			files: [],
		},
		project: {
			id: "source-project",
			name: "Downgrade Admission",
			width: 1920,
			height: 1080,
			fps: 30,
		},
		timelines: [
			{
				id: "root",
				isRoot: true,
				tracks: [
					{
						id: "video-track",
						kind: "video",
						order: 0,
						isMain: true,
						segments,
						capability: "exact",
					},
				],
			},
		],
		resources: [
			{
				id: RESOURCE_ID,
				kind: "video",
				name: "clip.mp4",
				durationUs: 2_000_000,
				status: "resolved",
				capability: "exact",
			},
		],
		links: [],
		issues: [],
	};
}

describe("qcut import downgrade admission (L0)", () => {
	it("keeps exact segments crossing without a downgrades list", () => {
		const plan = mapInteropDocumentToQCutPlan({
			document: createDocument({
				segments: [createSegment({ overrides: {} })],
			}),
		});
		expect(plan.tracks[0]?.elements).toHaveLength(1);
		expect(plan.skipped).toEqual([]);
		expect(plan.downgrades).toBeUndefined();
	});

	it("skips a downgrade segment without an approximation declaration", () => {
		const plan = mapInteropDocumentToQCutPlan({
			document: createDocument({
				segments: [createSegment({ overrides: { capability: "downgrade" } })],
			}),
		});
		expect(plan.tracks).toHaveLength(0);
		expect(plan.downgrades).toBeUndefined();
		expect(plan.skipped).toContainEqual({
			nodeId: "segment-1",
			nodeType: "segment",
			capability: "downgrade",
			reason: "downgrade segment carries no approximation declaration",
		});
	});

	it("admits a declared downgrade segment and lists the admission", () => {
		const plan = mapInteropDocumentToQCutPlan({
			document: createDocument({
				segments: [
					createSegment({
						overrides: {
							capability: "downgrade",
							downgrade: {
								approximation: "filter-lut-recipe",
								fidelityEvidence: "parity/filter-lut-recipe-2026-08-19",
							},
						},
					}),
				],
			}),
		});
		expect(plan.tracks[0]?.elements.map(({ id }) => id)).toEqual(["segment-1"]);
		expect(plan.skipped).toEqual([]);
		expect(plan.downgrades).toEqual([
			{
				nodeId: "segment-1",
				nodeType: "segment",
				approximation: "filter-lut-recipe",
				fidelityEvidence: "parity/filter-lut-recipe-2026-08-19",
			},
		]);
	});

	it("keeps opaque and blocked below the import bar", () => {
		for (const capability of ["opaque", "blocked"] as const) {
			const plan = mapInteropDocumentToQCutPlan({
				document: createDocument({
					segments: [createSegment({ overrides: { capability } })],
				}),
			});
			expect(plan.tracks).toHaveLength(0);
			expect(plan.downgrades).toBeUndefined();
			expect(plan.skipped).toContainEqual({
				nodeId: "segment-1",
				nodeType: "segment",
				capability,
				reason: `capability "${capability}" is below the import bar`,
			});
		}
	});

	it("records no admission when a declared downgrade is later rejected", () => {
		const plan = mapInteropDocumentToQCutPlan({
			document: createDocument({
				segments: [
					createSegment({
						overrides: {
							capability: "downgrade",
							resourceId: "missing-resource",
							downgrade: {
								approximation: "filter-lut-recipe",
								fidelityEvidence: "parity/filter-lut-recipe-2026-08-19",
							},
						},
					}),
				],
			}),
		});
		expect(plan.tracks).toHaveLength(0);
		expect(plan.downgrades).toBeUndefined();
		expect(plan.skipped).toContainEqual({
			nodeId: "segment-1",
			nodeType: "segment",
			capability: "blocked",
			reason: "segment has no resolvable media resource",
		});
	});

	it("round-trips the downgrade declaration through the document parser", () => {
		const document = createDocument({
			segments: [
				createSegment({
					overrides: {
						capability: "downgrade",
						downgrade: {
							approximation: "filter-lut-recipe",
							fidelityEvidence: "parity/filter-lut-recipe-2026-08-19",
						},
					},
				}),
			],
		});
		const parsed = parseDraftInteropDocumentV1(
			JSON.parse(JSON.stringify(document))
		);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(
				parsed.document.timelines[0]?.tracks[0]?.segments[0]?.downgrade
			).toEqual({
				approximation: "filter-lut-recipe",
				fidelityEvidence: "parity/filter-lut-recipe-2026-08-19",
			});
		}
	});

	it("rejects a declaration with a blank approximation", () => {
		const document = JSON.parse(
			JSON.stringify(
				createDocument({
					segments: [
						createSegment({
							overrides: {
								capability: "downgrade",
								downgrade: {
									approximation: "filter-lut-recipe",
									fidelityEvidence: "parity/receipt",
								},
							},
						}),
					],
				})
			)
		);
		document.timelines[0].tracks[0].segments[0].downgrade.approximation = "";
		const parsed = parseDraftInteropDocumentV1(document);
		expect(parsed.ok).toBe(false);
	});
});
