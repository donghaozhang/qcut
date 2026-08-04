import { describe, expect, it } from "vitest";
import {
	asRawDraftContent,
	buildJianyingDraft,
	detectDraftReferenceCycles,
	readRawDraftGraph,
	validateRawDraftGraph,
} from "../jianying-draft/index.js";
import type { QCutDraftExportSnapshotV1 } from "../jianying-draft/types.js";

/**
 * JYI-004 acceptance: malformed input, duplicate ids, dangling refs,
 * draft-reference cycles, and time-boundary defects all surface as stable
 * issues; a well-formed draft (our own builder output) validates clean.
 */

function createSnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				duration: 5,
				height: 1080,
				id: "video-1",
				name: "clip.mp4",
				sourcePath: "/source/clip.mp4",
				type: "video",
				width: 1920,
			},
		],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Graph Fixture",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: { "clip-1": 5 },
		tracks: [
			{
				elements: [
					{
						duration: 5,
						id: "clip-1",
						mediaId: "video-1",
						name: "clip-1",
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				hidden: false,
				id: "track-1",
				muted: false,
				name: "Video",
				order: 0,
				type: "media",
			},
		],
	};
}

function builderContent(): Record<string, unknown> {
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: "/qcut-fixture/draft",
		snapshot: createSnapshot(),
		targetPlatform: "macos",
	});
	// Round-trip through JSON so the parser sees plain data, as on disk.
	return JSON.parse(JSON.stringify(content));
}

function rawFixture(): Record<string, unknown> {
	return {
		id: "draft-1",
		tracks: [
			{
				id: "track-a",
				type: "video",
				segments: [
					{
						id: "seg-1",
						material_id: "mat-1",
						extra_material_refs: ["mat-2"],
						source_timerange: { start: 0, duration: 2_000_000 },
						target_timerange: { start: 0, duration: 2_000_000 },
					},
					{
						id: "seg-2",
						material_id: "mat-1",
						target_timerange: { start: 2_000_000, duration: 1_000_000 },
					},
				],
			},
		],
		materials: {
			videos: [{ id: "mat-1" }],
			speeds: [{ id: "mat-2" }],
		},
	};
}

describe("readRawDraftGraph", () => {
	it("indexes our own builder output without any read issues", () => {
		const content = asRawDraftContent(builderContent());
		expect(content).not.toBeNull();
		if (content === null) {
			return;
		}
		const graph = readRawDraftGraph({ content });
		expect(graph.readIssues).toEqual([]);
		expect(graph.duplicateIds).toEqual([]);
		expect(graph.tracks.length).toBeGreaterThan(0);
		expect(graph.segmentsById.size).toBeGreaterThan(0);
		expect(graph.materialsById.size).toBeGreaterThan(0);
		expect(validateRawDraftGraph({ graph })).toEqual([]);
	});

	it("indexes tracks, segments, refs, and material buckets", () => {
		const graph = readRawDraftGraph({ content: rawFixture() });
		expect(graph.draftId).toBe("draft-1");
		expect(graph.tracks).toHaveLength(1);
		expect(graph.tracks[0].segmentIds).toEqual(["seg-1", "seg-2"]);
		const seg1 = graph.segmentsById.get("seg-1");
		expect(seg1?.materialId).toBe("mat-1");
		expect(seg1?.extraMaterialRefs).toEqual(["mat-2"]);
		expect(seg1?.jsonPointer).toBe("/tracks/0/segments/0");
		expect(graph.materialsById.get("mat-2")?.bucket).toBe("speeds");
	});

	it("rejects non-object content without throwing", () => {
		expect(asRawDraftContent(null)).toBeNull();
		expect(asRawDraftContent([])).toBeNull();
		expect(asRawDraftContent("draft")).toBeNull();
	});

	it("skips malformed subtrees and reports precise pointers", () => {
		const graph = readRawDraftGraph({
			content: {
				tracks: [
					"not-a-track",
					{ type: "video" },
					{ id: "track-b", segments: "nope" },
				],
				materials: { videos: [42, { name: "no id" }] },
			},
		});
		const paths = graph.readIssues.map((issue) => issue.path);
		expect(paths).toContain("/tracks/0");
		expect(paths).toContain("/tracks/1/id");
		expect(paths).toContain("/tracks/2/segments");
		expect(paths).toContain("/materials/videos/0");
		expect(paths).toContain("/materials/videos/1/id");
		for (const issue of graph.readIssues) {
			expect(issue.code).toBe("DOCUMENT_MALFORMED");
			expect(issue.severity).toBe("error");
		}
		// The salvageable track survived.
		expect(graph.tracks.map((track) => track.id)).toEqual(["track-b"]);
	});
});

describe("validateRawDraftGraph", () => {
	it("passes a well-formed fixture", () => {
		const graph = readRawDraftGraph({ content: rawFixture() });
		expect(validateRawDraftGraph({ graph })).toEqual([]);
	});

	it("reports duplicate ids across node kinds", () => {
		const content = rawFixture();
		(content.materials as Record<string, unknown[]>).videos.push({
			id: "mat-1",
		});
		const graph = readRawDraftGraph({ content });
		const issues = validateRawDraftGraph({ graph });
		const duplicate = issues.find((issue) => issue.code === "REF_DUPLICATE_ID");
		expect(duplicate?.subjectId).toBe("mat-1");
		expect(duplicate?.path).toBe("/materials/videos/1");
	});

	it("reports dangling material references", () => {
		const content = rawFixture();
		(content.materials as Record<string, unknown[]>).speeds = [];
		const graph = readRawDraftGraph({ content });
		const issues = validateRawDraftGraph({ graph });
		const broken = issues.filter((issue) => issue.code === "REF_BROKEN");
		expect(broken).toHaveLength(1);
		expect(broken[0].subjectId).toBe("seg-1");
		expect(broken[0].message).toContain("mat-2");
	});

	it("reports time-boundary defects: negative, zero, and fractional", () => {
		const content = rawFixture();
		const track = (content.tracks as Record<string, unknown>[])[0];
		const segments = track.segments as Record<string, unknown>[];
		segments[0].source_timerange = { start: -1, duration: 2_000_000 };
		segments[0].target_timerange = { start: 0, duration: 0 };
		segments[1].target_timerange = { start: 0.5, duration: 1_000_000 };
		const graph = readRawDraftGraph({ content });
		const issues = validateRawDraftGraph({ graph });
		const invalid = issues.filter(
			(issue) => issue.code === "TIME_RANGE_INVALID"
		);
		expect(invalid).toHaveLength(3);
		expect(invalid.map((issue) => issue.path)).toEqual([
			"/tracks/0/segments/0/source_timerange",
			"/tracks/0/segments/0/target_timerange",
			"/tracks/0/segments/1/target_timerange",
		]);
	});

	it("reports same-track target overlaps, half-open", () => {
		const content = rawFixture();
		const track = (content.tracks as Record<string, unknown>[])[0];
		const segments = track.segments as Record<string, unknown>[];
		// seg-2 now starts inside seg-1's [0, 2s) range.
		segments[1].target_timerange = { start: 1_999_999, duration: 1_000_000 };
		const graph = readRawDraftGraph({ content });
		const issues = validateRawDraftGraph({ graph });
		const overlaps = issues.filter((issue) => issue.code === "TRACK_OVERLAP");
		expect(overlaps).toHaveLength(1);
		expect(overlaps[0].subjectId).toBe("seg-2");

		// Exactly adjacent ranges do not overlap.
		segments[1].target_timerange = { start: 2_000_000, duration: 1_000_000 };
		const adjacent = validateRawDraftGraph({
			graph: readRawDraftGraph({ content }),
		});
		expect(adjacent).toEqual([]);
	});
});

describe("detectDraftReferenceCycles", () => {
	it("accepts acyclic references", () => {
		expect(
			detectDraftReferenceCycles({
				edges: [
					{ fromDraftId: "root", toDraftId: "child-a" },
					{ fromDraftId: "root", toDraftId: "child-b" },
					{ fromDraftId: "child-a", toDraftId: "child-b" },
				],
			})
		).toEqual([]);
	});

	it("reports a self-reference", () => {
		const issues = detectDraftReferenceCycles({
			edges: [{ fromDraftId: "root", toDraftId: "root" }],
		});
		expect(issues).toHaveLength(1);
		expect(issues[0].code).toBe("REF_CYCLE");
		expect(issues[0].subjectId).toBe("root");
	});

	it("reports a multi-node cycle exactly once", () => {
		const issues = detectDraftReferenceCycles({
			edges: [
				{ fromDraftId: "a", toDraftId: "b" },
				{ fromDraftId: "b", toDraftId: "c" },
				{ fromDraftId: "c", toDraftId: "a" },
				{ fromDraftId: "entry", toDraftId: "a" },
			],
		});
		expect(issues).toHaveLength(1);
		expect(issues[0].code).toBe("REF_CYCLE");
		expect(issues[0].subjectId).toBe("a");
		expect(issues[0].message).toContain("->");
	});
});
