import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../draft-interop/index.js";
import {
	CAPCUT_8_1_PROFILE_ID,
	prepareCapCut81SameProfileWriteback,
	type QCutDraftExportSnapshotV1,
} from "../jianying-draft/index.js";

const INTERNAL_TRACK_ID = "qcut-track-1";
const INTERNAL_SEGMENT_ID = "qcut-segment-1";
const INTERNAL_RESOURCE_ID = "qcut-resource-1";

const internalIdBySemanticId = {
	"track-1": INTERNAL_TRACK_ID,
	"segment-1": INTERNAL_SEGMENT_ID,
	"resource-1": INTERNAL_RESOURCE_ID,
};

function sourceBytes({ targetStartUs = 0 }: { targetStartUs?: number } = {}) {
	return new TextEncoder().encode(
		JSON.stringify({
			id: "11111111-1111-4111-8111-111111111111",
			new_version: "179.0.0",
			unknownTopLevel: { sentinel: ["keep", { nested: true }] },
			tracks: [
				{
					segments: [
						{
							target_timerange: {
								start: targetStartUs,
								duration: 3_000_000,
							},
							source_timerange: { start: 0, duration: 3_000_000 },
							unknownSegment: { preserve: true },
						},
					],
				},
			],
		})
	);
}

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function document({ bytes }: { bytes: Uint8Array }): DraftInteropDocumentV1 {
	return {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "capcut",
			profileId: CAPCUT_8_1_PROFILE_ID,
			platform: "macos",
			files: [
				{
					relativePath: "draft_info.json",
					byteLength: bytes.byteLength,
					sha256: sha256({ bytes }),
					role: "content",
					classification: "plaintext-json",
				},
			],
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

function envelope({
	bytes,
	unknownTimingOwner = false,
}: {
	bytes: Uint8Array;
	unknownTimingOwner?: boolean;
}): ForeignDraftEnvelopeV1 {
	return {
		schemaVersion: 1,
		importId: "import-1",
		profileId: CAPCUT_8_1_PROFILE_ID,
		entries: [
			{
				relativePath: "draft_info.json",
				sha256: sha256({ bytes }),
				byteLength: bytes.byteLength,
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
		unknownSubtrees: unknownTimingOwner
			? [
					{
						foreignRef: "segment-1:unknownSegment",
						ownerSemanticId: "segment-1",
						ownedDomains: ["timing"],
					},
				]
			: [],
		dirtyDomains: [],
		acceptedDowngradeFingerprints: [],
	};
}

function snapshot(): QCutDraftExportSnapshotV1 {
	return {
		schemaVersion: 1,
		project: {
			id: "project-1",
			name: "Round trip",
			sceneId: "scene-1",
			width: 1920,
			height: 1080,
			fps: 30,
			backgroundColor: "transparent",
			backgroundType: "color",
		},
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
		media: [
			{
				id: INTERNAL_RESOURCE_ID,
				name: "clip.mp4",
				sourcePath: "/private/clip.mp4",
				type: "video",
				duration: 3,
				width: 1920,
				height: 1080,
			},
		],
		timelineDurationByElementId: { [INTERNAL_SEGMENT_ID]: 3 },
	};
}

function prepare({
	bytes,
	current = snapshot(),
	unknownTimingOwner = false,
}: {
	bytes: Uint8Array;
	current?: QCutDraftExportSnapshotV1;
	unknownTimingOwner?: boolean;
}) {
	return prepareCapCut81SameProfileWriteback({
		baselineDocument: document({ bytes }),
		bytesByPath: new Map([["draft_info.json", bytes]]),
		envelope: envelope({ bytes, unknownTimingOwner }),
		internalIdBySemanticId,
		snapshot: current,
	});
}

describe("CapCut 8.1 same-profile preparation", () => {
	it("patches timing while preserving unknown values", () => {
		const bytes = sourceBytes();
		const current = snapshot();
		const element = current.tracks[0]?.elements[0];
		if (!element) throw new Error("missing fixture element");
		element.startTime = 1;
		element.trimStart = 0.5;
		current.timelineDurationByElementId[INTERNAL_SEGMENT_ID] = 2;

		const result = prepare({ bytes, current });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.changed).toBe(true);
		expect(result.patches).toHaveLength(4);
		const output = JSON.parse(new TextDecoder().decode(result.contentBytes));
		expect(output.unknownTopLevel).toEqual({
			sentinel: ["keep", { nested: true }],
		});
		expect(output.tracks[0].segments[0].unknownSegment).toEqual({
			preserve: true,
		});
		expect(output.tracks[0].segments[0].target_timerange).toEqual({
			start: 1_000_000,
			duration: 2_000_000,
		});
	});

	it("returns the original byte object when nothing changed", () => {
		const bytes = sourceBytes();
		const result = prepare({ bytes });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.changed).toBe(false);
		expect(result.contentBytes).toBe(bytes);
		expect(result.patches).toEqual([]);
	});

	it("blocks structural additions before patching", () => {
		const bytes = sourceBytes();
		const current = snapshot();
		current.tracks.push({
			id: "new-track",
			name: "New",
			type: "media",
			elements: [
				{
					id: "new-segment",
					type: "media",
					mediaId: INTERNAL_RESOURCE_ID,
					name: "new.mp4",
					duration: 1,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		});

		expect(prepare({ bytes, current })).toMatchObject({
			ok: false,
			issues: [{ code: "WRITEBACK_TRACK_ADDED" }],
		});
	});

	it("rejects a conflicting unknown subtree", () => {
		const bytes = sourceBytes();
		const current = snapshot();
		const element = current.tracks[0]?.elements[0];
		if (!element) throw new Error("missing fixture element");
		element.startTime = 1;

		expect(prepare({ bytes, current, unknownTimingOwner: true })).toMatchObject(
			{
				ok: false,
				issues: [{ code: "UNKNOWN_SUBTREE_CONFLICT" }],
			}
		);
	});

	it("rejects baseline and envelope identity disagreement", () => {
		const bytes = sourceBytes();
		const baselineDocument = document({ bytes });
		baselineDocument.source.files[0]!.sha256 = "f".repeat(64);

		expect(
			prepareCapCut81SameProfileWriteback({
				baselineDocument,
				bytesByPath: new Map([["draft_info.json", bytes]]),
				envelope: envelope({ bytes }),
				internalIdBySemanticId,
				snapshot: snapshot(),
			})
		).toMatchObject({
			ok: false,
			issues: [{ code: "WRITEBACK_CONTENT_IDENTITY_MISMATCH" }],
		});
	});

	it("rejects missing verified source bytes", () => {
		const bytes = sourceBytes();

		expect(
			prepareCapCut81SameProfileWriteback({
				baselineDocument: document({ bytes }),
				bytesByPath: new Map(),
				envelope: envelope({ bytes }),
				internalIdBySemanticId,
				snapshot: snapshot(),
			})
		).toMatchObject({
			ok: false,
			issues: [{ code: "WRITEBACK_CONTENT_BYTES_MISSING" }],
		});
	});
});
