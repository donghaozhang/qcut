import { describe, expect, it } from "vitest";
import {
	applySameProfileScalarPatches,
	type DraftInteropDocumentV1,
	type ForeignDraftEnvelopeV1,
} from "../draft-interop/index.js";
import {
	CAPCUT_8_1_PROFILE_ID,
	planCapCut81TimingPatches,
	type CapCut81WritebackTimingSnapshot,
} from "../jianying-draft/index.js";

const INTERNAL_TRACK_ID = "qcut-track-1";
const INTERNAL_SEGMENT_ID = "qcut-segment-1";
const INTERNAL_RESOURCE_ID = "qcut-resource-1";

function document(): DraftInteropDocumentV1 {
	return {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "capcut",
			profileId: CAPCUT_8_1_PROFILE_ID,
			platform: "macos",
			files: [],
		},
		project: {
			id: "draft-1",
			name: "Round trip",
			width: 1920,
			height: 1080,
			fps: 30,
		},
		timelines: [
			{
				id: "draft-1",
				isRoot: true,
				tracks: [
					{
						id: "track-1",
						kind: "video",
						order: 0,
						isMain: true,
						capability: "exact",
						segments: [
							{
								id: "segment-1",
								kind: "video",
								resourceId: "resource-1",
								sourceRange: { startUs: 0, durationUs: 3_000_000 },
								targetRange: { startUs: 0, durationUs: 3_000_000 },
								speed: 1,
								capability: "exact",
								foreignRef: "segment-1",
							},
						],
					},
				],
			},
		],
		resources: [
			{
				id: "resource-1",
				kind: "video",
				status: "resolved",
				capability: "exact",
			},
		],
		links: [],
		issues: [],
	};
}

function envelope(): ForeignDraftEnvelopeV1 {
	return {
		schemaVersion: 1,
		importId: "import-1",
		profileId: CAPCUT_8_1_PROFILE_ID,
		entries: [
			{
				relativePath: "draft_info.json",
				sha256: "a".repeat(64),
				byteLength: 1,
				allowlistEntryId: "capcut-8.1-root-draft-info",
				storage: "raw",
			},
		],
		bindings: [
			{
				foreignRef: "segment-1",
				file: "draft_info.json",
				jsonPointer: "/tracks/0/segments/0",
				semanticId: "segment-1",
			},
		],
		unknownSubtrees: [],
		dirtyDomains: [],
		acceptedDowngradeFingerprints: [],
	};
}

function snapshot(): CapCut81WritebackTimingSnapshot {
	return {
		tracks: [
			{
				id: INTERNAL_TRACK_ID,
				name: "Video",
				type: "media",
				order: 0,
				isMain: true,
				elements: [
					{
						id: INTERNAL_SEGMENT_ID,
						type: "media",
						mediaId: INTERNAL_RESOURCE_ID,
						name: "clip.mp4",
						duration: 3,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
						playbackRate: 1,
					},
				],
			},
		],
		timelineDurationByElementId: { [INTERNAL_SEGMENT_ID]: 3 },
	};
}

const internalIdBySemanticId = {
	"track-1": INTERNAL_TRACK_ID,
	"segment-1": INTERNAL_SEGMENT_ID,
	"resource-1": INTERNAL_RESOURCE_ID,
};

describe("CapCut 8.1 timing patch planning", () => {
	it("emits only changed timing leaves", () => {
		const current = snapshot();
		const element = current.tracks[0]?.elements[0];
		if (!element) throw new Error("missing fixture element");
		element.startTime = 1;
		element.trimStart = 0.5;
		element.trimEnd = 0.5;
		current.timelineDurationByElementId[INTERNAL_SEGMENT_ID] = 2;

		const result = planCapCut81TimingPatches({
			document: document(),
			envelope: envelope(),
			internalIdBySemanticId,
			snapshot: current,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.importedSegmentCount).toBe(1);
		expect(result.patches).toEqual([
			expect.objectContaining({
				foreignRef: "segment-1:target_timerange:start",
				jsonPointer: "/tracks/0/segments/0/target_timerange/start",
				expectedValue: 0,
				nextValue: 1_000_000,
			}),
			expect.objectContaining({
				foreignRef: "segment-1:target_timerange:duration",
				jsonPointer: "/tracks/0/segments/0/target_timerange/duration",
				expectedValue: 3_000_000,
				nextValue: 2_000_000,
			}),
			expect.objectContaining({
				foreignRef: "segment-1:source_timerange:start",
				jsonPointer: "/tracks/0/segments/0/source_timerange/start",
				expectedValue: 0,
				nextValue: 500_000,
			}),
			expect.objectContaining({
				foreignRef: "segment-1:source_timerange:duration",
				jsonPointer: "/tracks/0/segments/0/source_timerange/duration",
				expectedValue: 3_000_000,
				nextValue: 2_000_000,
			}),
		]);
	});

	it("composes with scalar patching without losing unknown fields", () => {
		const current = snapshot();
		const element = current.tracks[0]?.elements[0];
		if (!element) throw new Error("missing fixture element");
		element.startTime = 1;
		const plan = planCapCut81TimingPatches({
			document: document(),
			envelope: envelope(),
			internalIdBySemanticId,
			snapshot: current,
		});
		if (!plan.ok) throw new Error("timing plan failed");
		const sourceBytes = new TextEncoder().encode(
			JSON.stringify({
				unknownTopLevel: { sentinel: "keep" },
				tracks: [
					{
						segments: [
							{
								id: "segment-1",
								target_timerange: { start: 0, duration: 3_000_000 },
								source_timerange: { start: 0, duration: 3_000_000 },
								unknownSegment: { sentinel: [1, 2, 3] },
							},
						],
					},
				],
			})
		);

		const applied = applySameProfileScalarPatches({
			patches: plan.patches,
			relativePath: "draft_info.json",
			sourceBytes,
		});

		expect(applied.ok).toBe(true);
		if (!applied.ok) return;
		expect(
			JSON.parse(new TextDecoder().decode(applied.outputBytes))
		).toMatchObject({
			unknownTopLevel: { sentinel: "keep" },
			tracks: [
				{
					segments: [
						{
							target_timerange: { start: 1_000_000 },
							unknownSegment: { sentinel: [1, 2, 3] },
						},
					],
				},
			],
		});
	});

	it("returns a no-op plan for unchanged imported timing", () => {
		const result = planCapCut81TimingPatches({
			document: document(),
			envelope: envelope(),
			internalIdBySemanticId,
			snapshot: snapshot(),
		});

		expect(result).toMatchObject({
			ok: true,
			patches: [],
			importedSegmentCount: 1,
		});
	});

	it.each([
		{
			name: "speed change",
			mutate(current: QCutDraftExportSnapshotV1) {
				const element = current.tracks[0]?.elements[0];
				if (element?.type === "media") element.playbackRate = 2;
			},
			code: "WRITEBACK_SPEED_CHANGED",
		},
		{
			name: "resource replacement",
			mutate(current: QCutDraftExportSnapshotV1) {
				const element = current.tracks[0]?.elements[0];
				if (element?.type === "media") element.mediaId = "replacement";
			},
			code: "WRITEBACK_RESOURCE_CHANGED",
		},
		{
			name: "segment deletion",
			mutate(current: QCutDraftExportSnapshotV1) {
				if (current.tracks[0]) current.tracks[0].elements = [];
			},
			code: "WRITEBACK_SEGMENT_MISSING",
		},
		{
			name: "segment addition",
			mutate(current: QCutDraftExportSnapshotV1) {
				const source = current.tracks[0]?.elements[0];
				if (source) {
					current.tracks[0]?.elements.push({ ...source, id: "new-element" });
				}
			},
			code: "WRITEBACK_SEGMENT_ADDED",
		},
	])("blocks $name", ({ code, mutate }) => {
		const current = snapshot();
		mutate(current);

		const result = planCapCut81TimingPatches({
			document: document(),
			envelope: envelope(),
			internalIdBySemanticId,
			snapshot: current,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toEqual([expect.objectContaining({ code })]);
	});
});
