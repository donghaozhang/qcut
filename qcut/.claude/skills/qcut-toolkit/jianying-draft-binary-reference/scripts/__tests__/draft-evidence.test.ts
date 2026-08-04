import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	diffDraftFiles,
	inspectDraftFile,
	inventoryDraftRoot,
} from "../draft-evidence";
import {
	parseDraftInspectionOptions,
	runDraftInspectionCli,
} from "../inspect-draft";

const tempRoots: string[] = [];

interface DraftFixture {
	config: { maintrack_adsorb: boolean };
	materials: Record<string, unknown[]>;
	tracks: Array<{
		id: string;
		segments: Array<Record<string, unknown>>;
		type: string;
	}>;
	[key: string]: unknown;
}

function createTempRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "jy-draft-evidence-"));
	tempRoots.push(root);
	return root;
}

function writeJson({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function videoDraft({
	name = "private project name",
	segmentDuration = 3_000_000,
	updateTime = 1,
}: {
	name?: string;
	segmentDuration?: number;
	updateTime?: number;
} = {}): DraftFixture {
	return {
		id: "draft-1",
		name,
		version: 360_000,
		new_version: "177.0.0",
		update_time: updateTime,
		platform: { app_version: "11.2.0-beta5" },
		config: { maintrack_adsorb: true },
		materials: {
			videos: [{ id: "video-1", path: "/private/source.mp4" }],
			speeds: [{ id: "speed-1", mode: 0, speed: 1 }],
		},
		tracks: [
			{
				id: "track-video",
				type: "video",
				segments: [
					{
						id: "segment-video",
						material_id: "video-1",
						extra_material_refs: ["speed-1"],
						target_timerange: { start: 0, duration: segmentDuration },
					},
				],
			},
		],
	};
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("Jianying draft evidence", () => {
	test("classifies current drafts, backups, and subdrafts without exposing paths", () => {
		const root = createTempRoot();
		const project = path.join(root, "project");
		mkdirSync(project, { recursive: true });
		writeFileSync(
			path.join(project, "draft_info.json"),
			"opaque-envelope",
			"utf8"
		);
		writeFileSync(path.join(project, ".locked"), "", "utf8");
		writeJson({
			filePath: path.join(project, ".backup", "snapshot.load.bak"),
			value: videoDraft(),
		});
		writeJson({
			filePath: path.join(project, "subdraft", "nested", "draft_content.json"),
			value: { ...videoDraft(), id: "nested-draft" },
		});

		const inventory = inventoryDraftRoot({ rootPath: root });

		expect(inventory).toMatchObject({
			candidateCount: 3,
			jsonCount: 2,
			lockedProjectCount: 1,
			opaqueCount: 1,
			timelineDocumentCount: 2,
			bySourceKind: {
				backup: { json: 1, opaque: 0, total: 1, withTimeline: 1 },
				draft: { json: 0, opaque: 1, total: 1, withTimeline: 0 },
				subdraft: { json: 1, opaque: 0, total: 1, withTimeline: 1 },
			},
			trackTypes: { video: 2 },
		});
		expect(inventory.documents).toBeUndefined();
	});

	test("records stable semantic hashes while ignoring only top-level update_time", () => {
		const root = createTempRoot();
		const beforePath = path.join(root, "before.json");
		const afterPath = path.join(root, "after.json");
		writeJson({ filePath: beforePath, value: videoDraft({ updateTime: 1 }) });
		writeJson({ filePath: afterPath, value: videoDraft({ updateTime: 2 }) });

		const before = inspectDraftFile({ filePath: beforePath });
		const after = inspectDraftFile({ filePath: afterPath });

		expect(before.rawSha256).not.toBe(after.rawSha256);
		expect(before.semanticSha256).toBe(after.semanticSha256);
		expect(before.summary?.materialReferences).toEqual({
			resolved: 2,
			total: 2,
			unresolved: 0,
		});
	});

	test("reports entity and timing changes while hashing private strings", () => {
		const root = createTempRoot();
		const beforePath = path.join(root, "before.json");
		const afterPath = path.join(root, "after.json");
		const before = videoDraft();
		const after = videoDraft({
			name: "another private project name",
			segmentDuration: 4_000_000,
			updateTime: 2,
		});
		after.config.maintrack_adsorb = false;
		after.materials.texts = [
			{ id: "text-1", type: "text", content: "private caption" },
		];
		after.tracks.push({
			id: "track-text",
			type: "text",
			segments: [
				{
					id: "segment-text",
					material_id: "text-1",
					extra_material_refs: [],
					target_timerange: { start: 0, duration: 4_000_000 },
				},
			],
		});
		writeJson({ filePath: beforePath, value: before });
		writeJson({ filePath: afterPath, value: after });

		const diff = diffDraftFiles({ beforePath, afterPath });

		expect(diff.changes.trackOrder).toEqual({
			before: ["track-video"],
			after: ["track-video", "track-text"],
		});
		expect(diff.changes.tracks.added).toEqual([
			{ id: "track-text", location: "tracks[1]" },
		]);
		expect(diff.changes.segments.added[0]?.id).toBe("segment-text");
		expect(diff.changes.materials.added[0]?.id).toBe("texts/text-1");
		expect(diff.changes.config).toContainEqual({
			before: true,
			after: false,
			path: "maintrack_adsorb",
		});
		expect(diff.changes.segments.changed[0]?.changes).toContainEqual({
			before: 3_000_000,
			after: 4_000_000,
			path: "target_timerange.duration",
		});
		expect(diff.changes.root[0]?.before).toMatchObject({
			kind: "string",
			length: "private project name".length,
		});
		expect(JSON.stringify(diff)).not.toContain("private project name");
		expect(JSON.stringify(diff)).not.toContain("private caption");
	});

	test("rejects opaque payloads for semantic diff", () => {
		const root = createTempRoot();
		const beforePath = path.join(root, "before.json");
		const afterPath = path.join(root, "after.json");
		writeFileSync(beforePath, "opaque", "utf8");
		writeJson({ filePath: afterPath, value: videoDraft() });

		expect(() => diffDraftFiles({ beforePath, afterPath })).toThrow(
			"is not a plaintext JSON draft"
		);
	});

	test("parses and runs the read-only CLI", () => {
		const root = createTempRoot();
		const filePath = path.join(root, "draft_info.json");
		writeJson({ filePath, value: videoDraft() });

		expect(
			parseDraftInspectionOptions({ args: ["inspect", "--file", filePath] })
		).toMatchObject({ command: "inspect", filePath, includePaths: false });
		expect(
			runDraftInspectionCli({ args: ["inventory", "--root", root] })
		).toMatchObject({
			candidateCount: 1,
			jsonCount: 1,
		});
		expect(() =>
			parseDraftInspectionOptions({ args: ["inventory", "--roots", root] })
		).toThrow("Unknown option --roots");
	});
});
