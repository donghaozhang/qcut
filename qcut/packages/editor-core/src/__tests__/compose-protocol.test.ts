import { describe, expect, it } from "vitest";
import {
	COMPOSE_PROTOCOL_VERSION,
	composeIssueFromSmartPackaging,
	composePatchFromSmartPackaging,
	composeSnapshotFromSmartPackaging,
	computeComposeSourceFingerprint,
	countComposeOperations,
	hasComposeValidationErrors,
	mergeComposePatches,
	validateComposePatch,
	validateComposeSnapshot,
	type ComposePatch,
	type ComposeSnapshot,
} from "../compose/index.js";
import {
	SMART_PACKAGING_PROTOCOL_VERSION,
	type SmartPackagingTimelinePatch,
} from "../templates/index.js";

function makeSnapshot({
	overrides = {},
}: {
	overrides?: Partial<ComposeSnapshot>;
} = {}): ComposeSnapshot {
	const project = {
		id: "project-1",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 30,
	};
	const media = [
		{
			id: "media-1",
			kind: "video" as const,
			trackId: "track-video",
			elementId: "element-1",
			startTime: 0,
			duration: 20,
			trimStart: 0,
		},
		{
			id: "media-2",
			kind: "video" as const,
			trackId: "track-video",
			elementId: "element-2",
			startTime: 20,
			duration: 10,
			trimStart: 0,
		},
	];
	const captions = [
		{ id: "caption-1", text: "hello", startTime: 1, duration: 2 },
	];
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media,
			captions,
		}),
		project,
		media,
		captions,
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
		...overrides,
	};
}

function makePatch({
	snapshot,
	overrides = {},
}: {
	snapshot: ComposeSnapshot;
	overrides?: Partial<ComposePatch>;
}): ComposePatch {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "patch-1",
		source: "local-heuristic",
		intentKind: "smart-packaging",
		mode: "idempotent",
		snapshotId: snapshot.id,
		sourceFingerprint: snapshot.sourceFingerprint,
		createdAt: "2026-08-30T00:01:00.000Z",
		operations: [
			{
				kind: "add-sticker",
				id: "sticker:1",
				startTime: 2,
				duration: 3,
				asset: {
					provider: "local",
					assetType: "sticker",
					assetId: "sticker-asset",
				},
			},
			{
				kind: "update-media-zoom",
				id: "zoom:element-1",
				trackId: "track-video",
				elementId: "element-1",
				startTime: 4,
				duration: 2,
				fromScale: 1,
				toScale: 1.2,
			},
		],
		warnings: [],
		...overrides,
	};
}

describe("compose fingerprint", () => {
	it("is deterministic and insensitive to item and key order", () => {
		const snapshot = makeSnapshot();
		const first = computeComposeSourceFingerprint({
			project: snapshot.project,
			media: snapshot.media,
			captions: snapshot.captions,
		});
		const reordered = computeComposeSourceFingerprint({
			project: {
				duration: snapshot.project.duration,
				canvasSize: snapshot.project.canvasSize,
				fps: snapshot.project.fps,
				id: snapshot.project.id,
			},
			media: [...snapshot.media].reverse(),
			captions: snapshot.captions,
		});
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(reordered).toBe(first);
	});

	it("changes when a timeline element changes", () => {
		const snapshot = makeSnapshot();
		const changed = computeComposeSourceFingerprint({
			project: snapshot.project,
			media: snapshot.media.map((item) =>
				item.id === "media-1" ? { ...item, duration: 21 } : item
			),
			captions: snapshot.captions,
		});
		expect(changed).not.toBe(snapshot.sourceFingerprint);
	});
});

describe("compose patch merge", () => {
	it("is idempotent by operation id and lets the incoming patch win", () => {
		const snapshot = makeSnapshot();
		const base = makePatch({ snapshot });
		const incoming = makePatch({
			snapshot,
			overrides: {
				id: "patch-2",
				operations: [
					{
						kind: "update-media-zoom",
						id: "zoom:element-1",
						trackId: "track-video",
						elementId: "element-1",
						startTime: 4,
						duration: 2,
						fromScale: 1,
						toScale: 1.4,
					},
				],
			},
		});
		const merged = mergeComposePatches({
			base,
			incoming,
			patchId: "patch-3",
			createdAt: "2026-08-30T00:02:00.000Z",
		});
		expect(merged.operations).toHaveLength(2);
		const zoom = merged.operations.find(
			(operation) => operation.id === "zoom:element-1"
		);
		expect(zoom).toMatchObject({ toScale: 1.4 });

		const replayed = mergeComposePatches({
			base: merged,
			incoming,
			patchId: "patch-4",
			createdAt: "2026-08-30T00:03:00.000Z",
		});
		expect(replayed.operations).toEqual(merged.operations);
		expect(countComposeOperations({ patch: replayed })).toMatchObject({
			"add-sticker": 1,
			"update-media-zoom": 1,
		});
	});

	it("refuses to merge patches from different snapshots", () => {
		const snapshot = makeSnapshot();
		const other = makeSnapshot({ overrides: { id: "snapshot-2" } });
		expect(() =>
			mergeComposePatches({
				base: makePatch({ snapshot }),
				incoming: makePatch({ snapshot: other }),
				patchId: "patch-x",
				createdAt: "2026-08-30T00:02:00.000Z",
			})
		).toThrow(/different snapshots/);
	});
});

describe("compose validation", () => {
	it("accepts a well-formed patch against its snapshot", () => {
		const snapshot = makeSnapshot();
		const issues = validateComposePatch({
			snapshot,
			patch: makePatch({ snapshot }),
		});
		expect(issues).toEqual([]);
	});

	it("rejects a patch whose snapshot fingerprint is stale", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: { sourceFingerprint: "0".repeat(64) },
		});
		const issues = validateComposePatch({ snapshot, patch });
		expect(issues).toMatchObject([
			{ severity: "error", code: "snapshot-mismatch" },
		]);
		expect(hasComposeValidationErrors({ issues })).toBe(true);
	});

	it("flags duplicate ids, unknown targets, and conflicting operations", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					{
						kind: "update-media-zoom",
						id: "zoom:1",
						trackId: "track-video",
						elementId: "element-1",
						startTime: 1,
						duration: 4,
						fromScale: 1,
						toScale: 1.2,
					},
					{
						kind: "update-media-zoom",
						id: "zoom:1",
						trackId: "track-video",
						elementId: "element-1",
						startTime: 3,
						duration: 4,
						fromScale: 1,
						toScale: 1.5,
					},
					{
						kind: "upsert-transition",
						id: "transition:1",
						trackId: "track-video",
						fromElementId: "element-2",
						toElementId: "element-missing",
						startTime: 19,
						duration: 1,
						presetId: "dissolve",
					},
				],
			},
		});
		const codes = validateComposePatch({ snapshot, patch }).map(
			(issue) => issue.code
		);
		expect(codes).toContain("duplicate-operation-id");
		expect(codes).toContain("unknown-target-element");
		expect(codes).toContain("operation-conflict");
	});

	it("reports empty snapshots and missing main media", () => {
		const empty = makeSnapshot({
			overrides: { media: [], captions: [], beats: [], shots: [] },
		});
		const codes = validateComposeSnapshot({ snapshot: empty }).map(
			(issue) => issue.code
		);
		expect(codes).toContain("empty-snapshot");
		expect(codes).toContain("missing-main-media");
	});
});

describe("smart packaging adapter", () => {
	function makeSmartPackagingPatch(): SmartPackagingTimelinePatch {
		return {
			schemaVersion: SMART_PACKAGING_PROTOCOL_VERSION,
			id: "sp-patch-1",
			source: "local-heuristic",
			snapshotId: "snapshot-1",
			sourceFingerprint: "f".repeat(64),
			createdAt: "2026-08-30T00:01:00.000Z",
			provider: "local",
			operations: [
				{
					kind: "add-text-overlay",
					id: "text:caption-1:0",
					text: "hello",
					startTime: 1,
					duration: 2,
					textTemplateId: "template-1",
					asset: {
						provider: "local",
						assetId: "template-1",
						assetType: "text-template",
					},
				},
				{
					kind: "add-sticker",
					id: "sticker:1.000:1",
					startTime: 2,
					duration: 3,
					asset: {
						provider: "local",
						assetId: "sticker-1",
						assetType: "effect",
					},
				},
				{
					kind: "upsert-transition",
					id: "transition:track-video:element-1:element-2",
					trackId: "track-video",
					fromElementId: "element-1",
					toElementId: "element-2",
					startTime: 19.5,
					duration: 1,
					presetId: "whip-pan-right",
				},
			],
			warnings: ["kept existing captions"],
			diagnostics: {
				sourceCounts: { captions: 1, beats: 1, shots: 2 },
				operationCounts: {
					"add-caption": 0,
					"add-text-overlay": 1,
					"add-sticker": 1,
					"add-sound-effect": 0,
					"update-media-zoom": 0,
					"upsert-transition": 1,
				},
			},
		};
	}

	it("converts a Smart Packaging patch into a compose patch", () => {
		const patch = composePatchFromSmartPackaging({
			patch: makeSmartPackagingPatch(),
		});
		expect(patch).toMatchObject({
			schemaVersion: COMPOSE_PROTOCOL_VERSION,
			intentKind: "smart-packaging",
			mode: "idempotent",
			snapshotId: "snapshot-1",
		});
		expect(patch.operations.map((operation) => operation.id)).toEqual([
			"text:caption-1:0",
			"sticker:1.000:1",
			"transition:track-video:element-1:element-2",
		]);
		const sticker = patch.operations.find(
			(operation) => operation.kind === "add-sticker"
		);
		expect(sticker).toMatchObject({
			asset: { assetType: "filter", assetId: "sticker-1" },
		});
		expect(patch.warnings).toEqual(["kept existing captions"]);
	});

	it("converts snapshots and issue codes into the compose taxonomy", () => {
		const snapshot = composeSnapshotFromSmartPackaging({
			snapshot: {
				schemaVersion: SMART_PACKAGING_PROTOCOL_VERSION,
				id: "snapshot-1",
				createdAt: "2026-08-30T00:00:00.000Z",
				sourceFingerprint: "f".repeat(64),
				project: {
					id: "project-1",
					fps: 30,
					canvasSize: { width: 1920, height: 1080 },
					duration: 30,
				},
				options: {
					style: "auto",
					clearExistingSmartPackaging: false,
					clearCurrentSubtitles: false,
					commercialMaterialsOnly: false,
					generateAsr: true,
					generateChapters: false,
					generateIntro: false,
					generateSubtitleAndTextTemplate: true,
				},
				media: [
					{
						id: "media-1",
						kind: "video",
						trackId: "track-video",
						elementId: "element-1",
						startTime: 0,
						duration: 20,
						trimStart: 0,
					},
				],
				captions: [
					{ id: "caption-1", text: "hello", startTime: 1, duration: 2 },
				],
				beats: [{ timestamp: 4, strength: 0.9 }],
				shots: [
					{
						id: "shot-1",
						trackId: "track-video",
						elementId: "element-1",
						startTime: 0,
						endTime: 10,
					},
				],
			},
		});
		expect(snapshot.beats).toEqual([
			{ id: "beat:0", timestamp: 4, confidence: 0.9 },
		]);
		expect(snapshot.shots).toEqual([
			{ id: "shot-1", startTime: 0, duration: 10 },
		]);
		expect(validateComposeSnapshot({ snapshot })).toEqual([]);

		expect(
			composeIssueFromSmartPackaging({
				issue: {
					code: "snapshot-mismatch",
					path: "snapshot",
					message: "mismatch",
				},
			})
		).toEqual({
			severity: "error",
			code: "snapshot-mismatch",
			path: "snapshot",
			message: "mismatch",
		});
	});
});
