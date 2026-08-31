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
	validateComposeJob,
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

	it("rejects sticker geometry outside the normalized canvas contract", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					{
						kind: "add-sticker",
						id: "sticker:bad-geometry",
						startTime: 2,
						duration: 3,
						x: 82,
						width: 0,
						asset: {
							provider: "local",
							assetType: "sticker",
							assetId: "sticker-asset",
						},
					},
				],
			},
		});

		expect(validateComposePatch({ snapshot, patch })).toMatchObject([
			{ code: "invalid-sticker-geometry", path: "operations.0.x" },
			{ code: "invalid-sticker-geometry", path: "operations.0.width" },
		]);
	});

	it("rejects invalid sticker aspect and animation options", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					{
						kind: "add-sticker",
						id: "sticker:bad-options",
						startTime: 2,
						duration: 3,
						maintainAspectRatio: "yes",
						animationInType: "wipe",
						animationOutType: "bounce",
						animationLoopType: "flash",
						asset: {
							provider: "local",
							assetType: "sticker",
							assetId: "sticker-asset",
						},
					} as unknown as ComposePatch["operations"][number],
				],
			},
		});

		expect(validateComposePatch({ snapshot, patch })).toMatchObject([
			{
				code: "invalid-sticker-geometry",
				path: "operations.0.maintainAspectRatio",
			},
			{
				code: "invalid-sticker-geometry",
				path: "operations.0.animationInType",
			},
			{
				code: "invalid-sticker-geometry",
				path: "operations.0.animationOutType",
			},
			{
				code: "invalid-sticker-geometry",
				path: "operations.0.animationLoopType",
			},
		]);
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

describe("compose fingerprint identity ties", () => {
	it("is order-insensitive when items share startTime and id", () => {
		const snapshot = makeSnapshot();
		const shared = {
			id: "media-shared",
			kind: "video" as const,
			startTime: 0,
			duration: 5,
			trimStart: 0,
		};
		const onTrackOne = { ...shared, trackId: "t1", elementId: "e1" };
		const onTrackTwo = { ...shared, trackId: "t2", elementId: "e2" };
		const forward = computeComposeSourceFingerprint({
			project: snapshot.project,
			media: [onTrackOne, onTrackTwo],
			captions: [],
		});
		const reversed = computeComposeSourceFingerprint({
			project: snapshot.project,
			media: [onTrackTwo, onTrackOne],
			captions: [],
		});
		expect(reversed).toBe(forward);
	});

	it("keeps distinct non-finite values from colliding", () => {
		const snapshot = makeSnapshot();
		const withNan = computeComposeSourceFingerprint({
			project: snapshot.project,
			media: [{ ...snapshot.media[0], duration: Number.NaN }],
			captions: [],
		});
		const withInfinity = computeComposeSourceFingerprint({
			project: snapshot.project,
			media: [{ ...snapshot.media[0], duration: Number.POSITIVE_INFINITY }],
			captions: [],
		});
		expect(withNan).not.toBe(withInfinity);
	});
});

describe("compose job validation", () => {
	function makeJob({
		overrides = {},
	}: {
		overrides?: Partial<import("../compose/index.js").ComposeJob>;
	} = {}): import("../compose/index.js").ComposeJob {
		return {
			schemaVersion: COMPOSE_PROTOCOL_VERSION,
			id: "job-1",
			provider: "local",
			intentKind: "smart-packaging",
			snapshotId: "snapshot-1",
			snapshotFingerprint: makeSnapshot().sourceFingerprint,
			status: "running",
			progress: 0.5,
			createdAt: "2026-08-30T00:00:00.000Z",
			updatedAt: "2026-08-30T00:01:00.000Z",
			attempt: 1,
			...overrides,
		};
	}

	it("accepts a well-formed job against its snapshot", () => {
		const snapshot = makeSnapshot();
		expect(validateComposeJob({ job: makeJob(), snapshot })).toEqual([]);
	});

	it("flags bad progress, stale snapshots, missing results, and versions", () => {
		const snapshot = makeSnapshot();
		expect(
			validateComposeJob({ job: makeJob({ overrides: { progress: 2 } }) }).map(
				(issue) => issue.code
			)
		).toEqual(["invalid-progress"]);
		expect(
			validateComposeJob({
				job: makeJob({ overrides: { snapshotFingerprint: "0".repeat(64) } }),
				snapshot,
			}).map((issue) => issue.code)
		).toEqual(["snapshot-mismatch"]);
		expect(
			validateComposeJob({
				job: makeJob({ overrides: { status: "completed", progress: 1 } }),
			}).map((issue) => issue.code)
		).toEqual(["terminal-job-without-result"]);
		expect(
			validateComposeJob({
				job: makeJob({
					overrides: {
						schemaVersion: 999 as unknown as typeof COMPOSE_PROTOCOL_VERSION,
					},
				}),
			}).map((issue) => issue.code)
		).toEqual(["schema-version-mismatch"]);
	});
});

describe("compose validation edge cases", () => {
	it("warns without blocking when an operation overruns the timeline", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					{
						kind: "add-sticker",
						id: "sticker:late",
						startTime: 28,
						duration: 5,
						asset: {
							provider: "local",
							assetType: "sticker",
							assetId: "sticker-asset",
						},
					},
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		expect(issues).toMatchObject([
			{ severity: "warning", code: "operation-out-of-bounds" },
		]);
		expect(hasComposeValidationErrors({ issues })).toBe(false);
	});

	it("checks sound source bounds at playbackRate speed", () => {
		const snapshot = makeSnapshot();
		const soundOperation = ({
			overrides = {},
		}: {
			overrides?: Record<string, unknown>;
		} = {}) => ({
			kind: "add-sound-effect" as const,
			id: "sfx:1",
			startTime: 1,
			duration: 6,
			volume: 0.8,
			asset: {
				provider: "qcut" as const,
				assetType: "sound-effect" as const,
				assetId: "sound-effects-lab:whoosh",
				duration: 10,
			},
			...overrides,
		});

		// 6s timeline × 2 = 12s of source, but the asset only has 10s.
		const doubled = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					operations: [soundOperation({ overrides: { playbackRate: 2 } })],
				},
			}),
		});
		expect(doubled).toMatchObject([
			{
				severity: "error",
				code: "invalid-range",
				path: expect.stringContaining(".duration"),
			},
		]);

		// 6s timeline × 0.5 = 3s of source; with 1s + 2s trims that is 6s ≤ 10s.
		const halved = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					operations: [
						soundOperation({
							overrides: { playbackRate: 0.5, trimStart: 1, trimEnd: 2 },
						}),
					],
				},
			}),
		});
		expect(halved).toEqual([]);

		// At 1× the trims alone push past the source: 1 + 2 + 8 = 11 > 10.
		const trimmedOver = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					operations: [
						soundOperation({
							overrides: { duration: 8, trimStart: 1, trimEnd: 2 },
						}),
					],
				},
			}),
		});
		expect(trimmedOver).toMatchObject([
			{
				severity: "error",
				code: "invalid-range",
				path: expect.stringContaining(".duration"),
			},
		]);

		// A fade longer than the operation stays rejected alongside the rule.
		const longFade = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					operations: [soundOperation({ overrides: { fadeIn: 7 } })],
				},
			}),
		});
		expect(longFade).toMatchObject([
			{
				severity: "error",
				code: "invalid-range",
				path: expect.stringContaining(".fadeIn"),
			},
		]);
	});

	it("rejects empty asset ids, bad schema versions, and empty ranges", () => {
		const snapshot = makeSnapshot();
		const badAsset = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					operations: [
						{
							kind: "add-sound-effect",
							id: "sound:1",
							startTime: 1,
							duration: 1,
							volume: 0.8,
							asset: {
								provider: "local",
								assetType: "sound-effect",
								assetId: "  ",
							},
						},
					],
				},
			}),
		}).map((issue) => issue.code);
		expect(badAsset).toEqual(["invalid-asset-reference"]);

		const badVersion = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					schemaVersion: 999 as unknown as typeof COMPOSE_PROTOCOL_VERSION,
				},
			}),
		}).map((issue) => issue.code);
		expect(badVersion).toContain("schema-version-mismatch");

		const badRange = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: {
					operations: [
						{
							kind: "add-caption",
							id: "caption:1",
							text: "hi",
							language: "en",
							startTime: 1,
							duration: 0,
						},
					],
				},
			}),
		}).map((issue) => issue.code);
		expect(badRange).toEqual(["invalid-range"]);
	});

	it("rejects invalid beats, shots, and project settings in snapshots", () => {
		const snapshot = makeSnapshot({
			overrides: {
				beats: [{ id: "beat:0", timestamp: Number.NaN }],
				shots: [{ id: "shot-1", startTime: 0, duration: 0 }],
				project: {
					id: "project-1",
					fps: 0,
					canvasSize: { width: 1920, height: 1080 },
					duration: 30,
				},
			},
		});
		const codes = validateComposeSnapshot({ snapshot }).map(
			(issue) => `${issue.code}:${issue.path}`
		);
		expect(codes).toContain("invalid-range:beats.0");
		expect(codes).toContain("invalid-range:shots.0");
		expect(codes).toContain("invalid-range:project");
	});

	it("sorts merged operations by start, duration, then id", () => {
		const snapshot = makeSnapshot();
		const scrambled = makePatch({
			snapshot,
			overrides: {
				operations: [
					{
						kind: "add-caption",
						id: "b",
						text: "later",
						language: "en",
						startTime: 5,
						duration: 1,
					},
					{
						kind: "add-caption",
						id: "a",
						text: "tie",
						language: "en",
						startTime: 5,
						duration: 1,
					},
					{
						kind: "add-caption",
						id: "c",
						text: "first",
						language: "en",
						startTime: 1,
						duration: 1,
					},
				],
			},
		});
		const merged = mergeComposePatches({
			base: makePatch({ snapshot, overrides: { operations: [] } }),
			incoming: scrambled,
			patchId: "patch-sorted",
			createdAt: "2026-08-30T00:05:00.000Z",
		});
		expect(merged.operations.map((operation) => operation.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});
});

describe("smart packaging issue severities", () => {
	it("keeps missing-main-media advisory through the adapter", () => {
		const issue = composeIssueFromSmartPackaging({
			issue: {
				code: "missing-main-media",
				path: "media",
				message: "no video",
			},
		});
		expect(issue.severity).toBe("warning");
		expect(hasComposeValidationErrors({ issues: [issue] })).toBe(false);
	});
});

describe("compose editable-project operations", () => {
	const mediaAsset = {
		provider: "local" as const,
		assetType: "media" as const,
		assetId: "manifest:a.mp4",
	};

	function insertClip({
		id,
		startTime,
		duration,
		trimStart = 1,
		trimEnd = 1,
		sourceDuration = duration + 2,
		trackRole = "main-video" as const,
	}: {
		id: string;
		startTime: number;
		duration: number;
		trimStart?: number;
		trimEnd?: number;
		sourceDuration?: number;
		trackRole?: "main-video" | "overlay-video";
	}) {
		return {
			kind: "insert-media-clip" as const,
			id,
			startTime,
			duration,
			asset: mediaAsset,
			mediaKind: "video" as const,
			trackRole,
			trimStart,
			trimEnd,
			sourceDuration,
		};
	}

	function filterStep({ id = "step-1", intensity = 60 } = {}) {
		return {
			id,
			asset: {
				provider: "local" as const,
				assetType: "filter" as const,
				assetId: "123",
			},
			intensity,
			enabled: true,
		};
	}

	it("accepts pending clips, transitions between them, and filter stacks", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				source: "manifest-compiler",
				operations: [
					insertClip({ id: "clip:a", startTime: 0, duration: 10 }),
					insertClip({ id: "clip:b", startTime: 10, duration: 5 }),
					{
						kind: "upsert-transition",
						id: "transition:a-b",
						startTime: 9.75,
						duration: 0.5,
						trackId: "main-video",
						fromElementId: "clip:a",
						toElementId: "clip:b",
						presetId: "crossfade",
					},
					{
						kind: "set-media-filter-stack",
						id: "stack:a",
						startTime: 0,
						duration: 10,
						trackId: "clip:a",
						elementId: "clip:a",
						filters: [filterStep()],
					},
					{
						kind: "set-media-filter-stack",
						id: "stack:element-1",
						startTime: 0,
						duration: 20,
						trackId: "track-video",
						elementId: "element-1",
						filters: [filterStep({ id: "step-2", intensity: 40 })],
					},
					{
						kind: "add-filter-layer",
						id: "layer:1",
						startTime: 0,
						duration: 15,
						trackRole: "adjustment",
						filters: [filterStep({ id: "step-3" })],
					},
				],
			},
		});
		expect(validateComposePatch({ snapshot, patch })).toEqual([]);
	});

	it("rejects clip trims and durations that disagree with the source", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					insertClip({
						id: "clip:short",
						startTime: 0,
						duration: 9,
						sourceDuration: 12,
					}),
					insertClip({
						id: "clip:eaten",
						startTime: 9,
						duration: 1,
						trimStart: 6,
						trimEnd: 6,
						sourceDuration: 12,
					}),
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		expect(
			issues.some(
				(issue) =>
					issue.operationId === "clip:short" && issue.path.endsWith(".duration")
			)
		).toBe(true);
		expect(
			issues.some(
				(issue) =>
					issue.operationId === "clip:eaten" && issue.path.endsWith(".trimEnd")
			)
		).toBe(true);
	});

	it("rejects malformed filter stacks", () => {
		const snapshot = makeSnapshot();
		const tooMany = Array.from({ length: 17 }, (unused, index) =>
			filterStep({ id: `step-${index}` })
		);
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					{
						kind: "set-media-filter-stack",
						id: "stack:empty",
						startTime: 0,
						duration: 5,
						trackId: "track-video",
						elementId: "element-1",
						filters: [],
					},
					{
						kind: "add-filter-layer",
						id: "layer:bad",
						startTime: 0,
						duration: 5,
						trackRole: "adjustment",
						filters: [
							filterStep({ intensity: 150 }),
							filterStep({ id: "step-1" }),
							...tooMany,
						],
					},
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		const codes = issues.map((issue) => issue.code);
		expect(codes).toContain("invalid-filter-stack");
		expect(
			issues.filter((issue) => issue.code === "invalid-filter-stack").length
		).toBeGreaterThanOrEqual(3);
	});

	it("requires pending filter stacks to repeat the insert id as trackId", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					insertClip({ id: "clip:a", startTime: 0, duration: 10 }),
					{
						kind: "set-media-filter-stack",
						id: "stack:wrong",
						startTime: 0,
						duration: 10,
						trackId: "track-video",
						elementId: "clip:a",
						filters: [filterStep()],
					},
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		expect(
			issues.some(
				(issue) =>
					issue.code === "unknown-target-element" &&
					issue.operationId === "stack:wrong"
			)
		).toBe(true);
	});

	it("rejects transitions that mix pending clips with snapshot elements", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					insertClip({ id: "clip:a", startTime: 0, duration: 10 }),
					{
						kind: "upsert-transition",
						id: "transition:mixed",
						startTime: 9.75,
						duration: 0.5,
						trackId: "main-video",
						fromElementId: "clip:a",
						toElementId: "element-1",
						presetId: "crossfade",
					},
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		expect(
			issues.some(
				(issue) =>
					issue.operationId === "transition:mixed" &&
					issue.message.includes("mix")
			)
		).toBe(true);
	});

	it("checks pending transition track markers and endpoint roles", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					insertClip({ id: "clip:a", startTime: 0, duration: 10 }),
					insertClip({
						id: "clip:overlay",
						startTime: 10,
						duration: 5,
						trackRole: "overlay-video",
					}),
					{
						kind: "upsert-transition",
						id: "transition:bad",
						startTime: 9.75,
						duration: 0.5,
						trackId: "track-video",
						fromElementId: "clip:a",
						toElementId: "clip:overlay",
						presetId: "crossfade",
					},
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		expect(issues.some((issue) => issue.path.endsWith(".trackId"))).toBe(true);
		expect(issues.some((issue) => issue.path.endsWith(".toElementId"))).toBe(
			true
		);
	});

	it("flags overlapping main-video clips and duplicate filter stacks", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					insertClip({ id: "clip:a", startTime: 0, duration: 10 }),
					insertClip({ id: "clip:b", startTime: 5, duration: 10 }),
					{
						kind: "set-media-filter-stack",
						id: "stack:1",
						startTime: 0,
						duration: 10,
						trackId: "clip:a",
						elementId: "clip:a",
						filters: [filterStep()],
					},
					{
						kind: "set-media-filter-stack",
						id: "stack:2",
						startTime: 0,
						duration: 10,
						trackId: "clip:a",
						elementId: "clip:a",
						filters: [filterStep({ id: "step-9" })],
					},
				],
			},
		});
		const issues = validateComposePatch({ snapshot, patch });
		const conflicts = issues.filter(
			(issue) => issue.code === "operation-conflict"
		);
		expect(conflicts.some((issue) => issue.message.includes("overlap"))).toBe(
			true
		);
		expect(
			conflicts.some((issue) => issue.message.includes("Filter stacks"))
		).toBe(true);
	});

	it("extends the out-of-bounds horizon with pending clips", () => {
		const snapshot = makeSnapshot();
		const longClip = insertClip({
			id: "clip:long",
			startTime: 0,
			duration: 40,
		});
		const sticker = {
			kind: "add-sticker" as const,
			id: "sticker:late",
			startTime: 32,
			duration: 3,
			asset: {
				provider: "local" as const,
				assetType: "sticker" as const,
				assetId: "sticker-asset",
			},
		};
		const withClip = validateComposePatch({
			snapshot,
			patch: makePatch({
				snapshot,
				overrides: { operations: [longClip, sticker] },
			}),
		});
		expect(withClip).toEqual([]);
		const withoutClip = validateComposePatch({
			snapshot,
			patch: makePatch({ snapshot, overrides: { operations: [sticker] } }),
		});
		expect(
			withoutClip.some((issue) => issue.code === "operation-out-of-bounds")
		).toBe(true);
	});

	it("counts the editable-project operation kinds", () => {
		const snapshot = makeSnapshot();
		const patch = makePatch({
			snapshot,
			overrides: {
				operations: [
					insertClip({ id: "clip:a", startTime: 0, duration: 10 }),
					{
						kind: "set-media-filter-stack",
						id: "stack:a",
						startTime: 0,
						duration: 10,
						trackId: "clip:a",
						elementId: "clip:a",
						filters: [filterStep()],
					},
					{
						kind: "add-filter-layer",
						id: "layer:1",
						startTime: 0,
						duration: 5,
						trackRole: "adjustment",
						filters: [filterStep({ id: "step-2" })],
					},
				],
			},
		});
		const counts = countComposeOperations({ patch });
		expect(counts["insert-media-clip"]).toBe(1);
		expect(counts["set-media-filter-stack"]).toBe(1);
		expect(counts["add-filter-layer"]).toBe(1);
		expect(counts["add-caption"]).toBe(0);
	});
});
