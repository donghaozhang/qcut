import { describe, expect, it } from "vitest";
import type { ForeignDraftEnvelopeV1 } from "../draft-interop/index.js";
import {
	JIANYING_11_3_BETA2_PROFILE_ID,
	normalizeRawDraft,
	prepareJianying113Beta2SameProfileWriteback,
	type Jianying113Beta2WritebackTimingSnapshot,
} from "../jianying-draft/index.js";
import {
	createJianying113CompoundSource,
	createJianying113CompoundWrapper,
	encodeJianyingCompoundContent,
} from "./support/jianying-11-3-compound-fixture.js";

const INTERNAL_TRACK_ID = "qcut-track-1";
const INTERNAL_SEGMENT_ID = "qcut-segment-1";
const INTERNAL_RESOURCE_ID = "qcut-resource-1";

const internalIdBySemanticId = {
	"inner-track": INTERNAL_TRACK_ID,
	"inner-segment": INTERNAL_SEGMENT_ID,
	"inner-video": INTERNAL_RESOURCE_ID,
};

interface MutableInnerDraft {
	tracks: Record<string, unknown>[];
	materials: { videos: Record<string, unknown>[] };
}

function getInnerDraft({
	content,
}: {
	content: Record<string, unknown>;
}): MutableInnerDraft {
	const materials = content.materials as {
		drafts: Array<{ draft: MutableInnerDraft }>;
	};
	const inner = materials.drafts[0]?.draft;
	if (inner === undefined) throw new Error("missing inner draft fixture");
	return inner;
}

function createFixture({
	content = createJianying113CompoundWrapper(),
}: {
	content?: Record<string, unknown>;
} = {}) {
	const bytes = encodeJianyingCompoundContent({ content });
	const normalized = normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113CompoundSource({ bytes }),
	});
	const sourceFile = normalized.document.source.files[0];
	if (sourceFile === undefined) throw new Error("missing source file fixture");
	const envelope: ForeignDraftEnvelopeV1 = {
		schemaVersion: 1,
		importId: "import-jianying-compound",
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		entries: [
			{
				relativePath: "draft_content.json",
				sha256: sourceFile.sha256,
				byteLength: sourceFile.byteLength,
				allowlistEntryId: "jianying-11.3-beta2-subdraft-content",
				storage: "raw",
			},
		],
		bindings: normalized.bindings,
		unknownSubtrees: [],
		dirtyDomains: [],
		acceptedDowngradeFingerprints: [],
	};
	return { bytes, envelope, normalized };
}

function createSnapshot(): Jianying113Beta2WritebackTimingSnapshot {
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
						name: "calibration.mp4",
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

function prepare({
	content,
	internalIds = internalIdBySemanticId,
	snapshot = createSnapshot(),
}: {
	content?: Record<string, unknown>;
	internalIds?: Record<string, string>;
	snapshot?: Jianying113Beta2WritebackTimingSnapshot;
} = {}) {
	const fixture = createFixture({ content });
	return {
		...fixture,
		result: prepareJianying113Beta2SameProfileWriteback({
			baselineDocument: fixture.normalized.document,
			bytesByPath: new Map([["draft_content.json", fixture.bytes]]),
			envelope: fixture.envelope,
			internalIdBySemanticId: internalIds,
			snapshot,
		}),
	};
}

describe("Jianying 11.3 beta 2 same-profile preparation", () => {
	it("returns the exact original bytes when imported timing is unchanged", () => {
		const { bytes, result } = prepare();

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.changed).toBe(false);
		expect(result.contentBytes).toBe(bytes);
		expect(result.patches).toEqual([]);
	});

	it("ignores source-only opaque tracks when checking imported track order", () => {
		const content = createJianying113CompoundWrapper();
		getInnerDraft({ content }).tracks.unshift({
			id: "inner-opaque-track",
			type: "mixed",
			segments: [],
		});

		const { result } = prepare({ content });

		expect(result).toMatchObject({ ok: true, changed: false });
	});

	it("still blocks relative reordering of imported tracks", () => {
		const content = createJianying113CompoundWrapper();
		const inner = getInnerDraft({ content });
		inner.tracks.push({
			id: "inner-track-2",
			type: "mixed",
			segments: [
				{
					id: "inner-segment-2",
					material_id: "inner-video-2",
					extra_material_refs: [],
					source_timerange: { start: 0, duration: 3_000_000 },
					target_timerange: { start: 0, duration: 3_000_000 },
					speed: 1,
				},
			],
		});
		inner.materials.videos.push({
			id: "inner-video-2",
			type: "video",
			duration: 3_000_000,
			material_name: "calibration-2.mp4",
			path: "/private/calibration-2.mp4",
		});
		const snapshot = createSnapshot();
		snapshot.tracks[0].order = 1;
		snapshot.tracks.push({
			id: "qcut-track-2",
			name: "Video 2",
			type: "media",
			order: 0,
			elements: [
				{
					id: "qcut-segment-2",
					type: "media",
					mediaId: "qcut-resource-2",
					name: "calibration-2.mp4",
					duration: 3,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
					playbackRate: 1,
				},
			],
		});
		snapshot.timelineDurationByElementId = {
			...snapshot.timelineDurationByElementId,
			"qcut-segment-2": 3,
		};

		const { result } = prepare({
			content,
			internalIds: {
				...internalIdBySemanticId,
				"inner-track-2": "qcut-track-2",
				"inner-segment-2": "qcut-segment-2",
				"inner-video-2": "qcut-resource-2",
			},
			snapshot,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.map(({ code }) => code)).toEqual([
			"WRITEBACK_TRACK_CHANGED",
			"WRITEBACK_TRACK_CHANGED",
		]);
	});

	it("patches only inner timing pointers and preserves outer and inner unknown fields", () => {
		const snapshot = createSnapshot();
		const element = snapshot.tracks[0]?.elements[0];
		if (element?.type !== "media") throw new Error("missing media fixture");
		element.startTime = 1;
		element.trimStart = 0.5;
		snapshot.timelineDurationByElementId = { [INTERNAL_SEGMENT_ID]: 2 };

		const { result } = prepare({ snapshot });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.changed).toBe(true);
		expect(result.patches).toHaveLength(4);
		expect(result.patches[0]?.jsonPointer).toBe(
			"/materials/drafts/0/draft/tracks/0/segments/0/target_timerange/start"
		);
		const output = JSON.parse(new TextDecoder().decode(result.contentBytes));
		expect(output.unknown_outer_top_level).toEqual({ preserve: "sentinel" });
		const inner = output.materials.drafts[0].draft;
		expect(inner.unknown_inner_top_level).toEqual({ preserve: [1, 2, 3] });
		expect(inner.tracks[0].segments[0]).toMatchObject({
			unknown_inner_segment: { preserve: true },
			target_timerange: { start: 1_000_000, duration: 2_000_000 },
			source_timerange: { start: 500_000, duration: 2_000_000 },
		});
	});

	it("blocks QCut structure additions instead of deleting unknown Jianying data", () => {
		const snapshot = createSnapshot();
		snapshot.tracks.push({
			id: "qcut-added-track",
			name: "Added",
			type: "media",
			elements: [
				{
					id: "qcut-added-segment",
					type: "media",
					mediaId: INTERNAL_RESOURCE_ID,
					name: "added.mp4",
					duration: 1,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		});

		expect(prepare({ snapshot }).result).toMatchObject({
			ok: false,
			issues: [{ code: "WRITEBACK_TRACK_ADDED" }],
		});
	});
});
