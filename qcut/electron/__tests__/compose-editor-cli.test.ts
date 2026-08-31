import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleComposeValidate } from "../native-pipeline/cli/cli-handlers-compose.js";
import {
	handleComposeApply,
	handleComposeSnapshot,
	type ComposeEditorDependencies,
} from "../native-pipeline/cli/cli-handlers-compose-editor.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	type ComposePatch,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";
import { prepareComposeEditorAssets } from "../native-pipeline/compose/compose-editor-asset-preparer.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";

let directory = "";
let snapshotPath = "";
let patchPath = "";

function fixtureSnapshot(): ComposeSnapshot {
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
	];
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media,
			captions: [],
		}),
		project,
		media,
		captions: [],
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

function fixturePatch({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
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
				kind: "add-caption",
				id: "caption:1",
				text: "hello",
				language: "en",
				startTime: 1,
				duration: 2,
			},
			{
				kind: "update-media-zoom",
				id: "zoom:1",
				trackId: "track-video",
				elementId: "element-1",
				startTime: 4,
				duration: 2,
				fromScale: 1,
				toScale: 1.2,
			},
		],
		warnings: [],
	};
}

function options(partial: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "compose",
		outputDir: directory,
		...partial,
	} as CLIRunOptions;
}

const noProgress = () => {};
const signal = new AbortController().signal;

beforeAll(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-compose-cli-"));
	const snapshot = fixtureSnapshot();
	snapshotPath = path.join(directory, "snapshot.json");
	patchPath = path.join(directory, "patch.json");
	fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
	fs.writeFileSync(patchPath, JSON.stringify(fixturePatch({ snapshot })));
});

afterAll(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("compose validate mode selection", () => {
	it("rejects mixing manifest mode with patch mode", async () => {
		const result = await handleComposeValidate(
			options({ config: "edit.json", snapshot: snapshotPath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("manifest mode");
	});

	it("requires both patch-mode inputs", async () => {
		const result = await handleComposeValidate(
			options({ snapshot: snapshotPath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--snapshot and --patch");
	});

	it("validates a patch against its snapshot", async () => {
		const result = await handleComposeValidate(
			options({ snapshot: snapshotPath, patch: patchPath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			mode: "patch",
			valid: true,
			operationCount: 2,
		});
	});

	it("fails on a stale snapshot fingerprint", async () => {
		const snapshot = fixtureSnapshot();
		const stale = {
			...fixturePatch({ snapshot }),
			sourceFingerprint: "0".repeat(64),
		};
		const stalePath = path.join(directory, "stale-patch.json");
		fs.writeFileSync(stalePath, JSON.stringify(stale));
		const result = await handleComposeValidate(
			options({ snapshot: snapshotPath, patch: stalePath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		const issues = (result.data as { issues: Array<{ code: string }> }).issues;
		expect(issues.map(({ code }) => code)).toContain("snapshot-mismatch");
	});
});

describe("compose snapshot handler", () => {
	it("captures and writes the snapshot through injected dependencies", async () => {
		const snapshot = fixtureSnapshot();
		const dependencies: ComposeEditorDependencies = {
			createClient: vi.fn(() => ({}) as never),
			capture: vi.fn(async () => snapshot),
			applyManifest: vi.fn(),
		} as unknown as ComposeEditorDependencies;
		const outputPath = path.join(directory, "captured", "snapshot.json");
		const result = await handleComposeSnapshot(
			options({ output: outputPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			snapshotId: "snapshot-1",
			mediaCount: 1,
		});
		expect(JSON.parse(fs.readFileSync(outputPath, "utf-8"))).toMatchObject({
			id: "snapshot-1",
		});
	});
});

interface ApplyDependencyOverrides {
	applyManifest?: ReturnType<typeof vi.fn>;
	prepareAssets?: ReturnType<typeof vi.fn>;
	rollbackStickerMedia?: ReturnType<typeof vi.fn>;
	timeline?: { tracks: Array<Record<string, unknown>> };
}

function applyDependencies({
	applyManifest = vi.fn(async () => ({
		success: true,
		data: { elements: {}, transitionIds: [], verified: true },
	})),
	prepareAssets = vi.fn(async ({ patch }: { patch: ComposePatch }) => ({
		patch,
		bindings: {},
		importedMediaIds: [],
	})),
	rollbackStickerMedia = vi.fn(async () => undefined),
	timeline = { tracks: [] },
}: ApplyDependencyOverrides = {}) {
	const get = vi.fn(async () => timeline);
	const dependencies = {
		createClient: vi.fn(() => ({ get }) as never),
		capture: vi.fn(),
		applyManifest,
		resolveAssets: vi.fn(async () => ({ reports: [], issues: [] })),
		prepareAssets,
		rollbackStickerMedia,
	} as unknown as ComposeEditorDependencies;
	return { dependencies, applyManifest, prepareAssets, rollbackStickerMedia };
}

describe("compose apply handler", () => {
	it("validates, converts, applies, and maps operation ids to elements", async () => {
		const applyManifest = vi.fn(
			async (_client: unknown, opts: CLIRunOptions) => {
				const manifest = JSON.parse(opts.manifest ?? "{}");
				expect(manifest.projectId).toBe("project-1");
				expect(manifest.updates).toMatchObject([
					{
						alias: "zoom:1",
						elementId: "element-1",
						keyframes: {
							scaleX: [
								{ frame: 120, value: 1 },
								{ frame: 180, value: 1.2 },
							],
						},
					},
				]);
				return {
					success: true,
					data: {
						elements: {
							"caption:1": "created-element-1",
							"zoom:1": "element-1",
						},
						transitionIds: [],
						verified: true,
					},
				};
			}
		);
		const { dependencies, prepareAssets } = applyDependencies({
			applyManifest,
		});
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: patchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			applied: {
				"caption:1": "created-element-1",
				"zoom:1": "element-1",
			},
			verified: true,
		});
		expect(prepareAssets).toHaveBeenCalledOnce();
		const skipped = (result.data as { skipped: Array<{ operationId: string }> })
			.skipped;
		expect(skipped).toEqual([]);
	});

	it("refuses to apply a patch that fails validation", async () => {
		const snapshot = fixtureSnapshot();
		const broken = {
			...fixturePatch({ snapshot }),
			sourceFingerprint: "0".repeat(64),
		};
		const brokenPath = path.join(directory, "broken-patch.json");
		fs.writeFileSync(brokenPath, JSON.stringify(broken));
		const { dependencies, applyManifest, prepareAssets } = applyDependencies();
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: brokenPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(prepareAssets).not.toHaveBeenCalled();
		expect(applyManifest).not.toHaveBeenCalled();
	});

	it("feeds prepared bindings into the manifest converter", async () => {
		const snapshot = fixtureSnapshot();
		const stickerPatch: ComposePatch = {
			...fixturePatch({ snapshot }),
			operations: [
				{
					kind: "add-sticker",
					id: "sticker:1",
					startTime: 1,
					duration: 2,
					asset: {
						provider: "qcut",
						assetType: "sticker",
						assetId: "sticker-lab:batch-1:1001",
					},
				},
			],
		};
		const stickerPatchPath = path.join(directory, "sticker-patch.json");
		fs.writeFileSync(stickerPatchPath, JSON.stringify(stickerPatch));

		const applyManifest = vi.fn(
			async (_client: unknown, opts: CLIRunOptions) => {
				const manifest = JSON.parse(opts.manifest ?? "{}");
				// The binding's imported media id reaches the manifest element,
				// and no raw media path rides along.
				expect(manifest.media).toBeUndefined();
				expect(manifest.tracks).toMatchObject([
					{
						type: "sticker",
						elements: [
							{
								alias: "sticker:1",
								mediaId: "imported-media-1",
								stickerAssetId: "sticker-lab:batch-1:1001",
							},
						],
					},
				]);
				return {
					success: true,
					data: {
						elements: { "sticker:1": "el-1" },
						transitionIds: [],
						verified: true,
					},
				};
			}
		);
		const prepareAssets = vi.fn(async ({ patch }: { patch: ComposePatch }) => ({
			patch,
			bindings: {
				"sticker:1": {
					sticker: {
						mediaId: "imported-media-1",
						stickerAssetId: "sticker-lab:batch-1:1001",
					},
				},
			},
			importedMediaIds: ["imported-media-1"],
		}));
		const { dependencies } = applyDependencies({
			applyManifest,
			prepareAssets,
		});
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: stickerPatchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(applyManifest).toHaveBeenCalledOnce();
		expect(prepareAssets).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				client: expect.anything(),
			})
		);
		expect(result.data).toMatchObject({
			applied: { "sticker:1": "el-1" },
			importedMediaCount: 1,
		});
		const serialized = JSON.stringify(result.data);
		expect(serialized).not.toContain("/assets/");
		expect(serialized).not.toContain("compose-assets");
	});

	it("prepares each unique sticker and sound exactly once", async () => {
		const snapshot = fixtureSnapshot();
		const duplicatePatch: ComposePatch = {
			...fixturePatch({ snapshot }),
			operations: [
				{
					kind: "add-sticker",
					id: "sticker:1",
					startTime: 1,
					duration: 2,
					asset: {
						provider: "qcut",
						assetType: "sticker",
						assetId: "sticker-lab:batch-1:1001",
					},
				},
				{
					kind: "add-sticker",
					id: "sticker:2",
					startTime: 4,
					duration: 2,
					asset: {
						provider: "qcut",
						assetType: "sticker",
						assetId: "sticker-lab:batch-1:1001",
					},
				},
				{
					kind: "add-sound-effect",
					id: "sfx:1",
					startTime: 1,
					duration: 2,
					volume: 0.8,
					asset: {
						provider: "qcut",
						assetType: "sound-effect",
						assetId: "sound-effects-lab:whoosh",
					},
				},
				{
					kind: "add-sound-effect",
					id: "sfx:2",
					startTime: 5,
					duration: 2,
					volume: 0.8,
					asset: {
						provider: "qcut",
						assetType: "sound-effect",
						assetId: "sound-effects-lab:whoosh",
					},
				},
			],
		};
		const duplicatePatchPath = path.join(directory, "duplicate-patch.json");
		fs.writeFileSync(duplicatePatchPath, JSON.stringify(duplicatePatch));

		const importSticker = vi.fn(async () => ({
			mediaId: "imported-media-1",
			importedMediaIds: ["imported-media-1"],
			reference: {} as never,
		}));
		const materializeSound = vi.fn(async () => ({
			localPath: path.join(directory, "whoosh.mp3"),
			sha256: "ab".repeat(32),
			bytes: 3,
		}));
		const discoverStickers = vi.fn(async () => ({
			rootPath: directory,
			catalogs: [],
			warnings: [],
			summary: {
				batchCount: 0,
				categoryCount: 0,
				itemCount: 0,
				totalBytes: 0,
			},
		}));
		// The real preparer runs with spied inner dependencies, so the
		// per-asset dedup caches are the code under test.
		const prepareAssets = vi.fn(
			async (args: Parameters<typeof prepareComposeEditorAssets>[0]) =>
				prepareComposeEditorAssets({
					...args,
					dependencies: {
						discoverStickers: discoverStickers as never,
						readSticker: vi.fn() as never,
						importSticker: importSticker as never,
						rollbackStickerMedia: vi.fn() as never,
						materializeSound: materializeSound as never,
						resolveTransition: vi.fn() as never,
					},
				})
		);
		const { dependencies } = applyDependencies({ prepareAssets });
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: duplicatePatchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(importSticker).toHaveBeenCalledTimes(1);
		expect(materializeSound).toHaveBeenCalledTimes(1);
	});

	it("does not touch the timeline when asset preparation fails", async () => {
		const prepareAssets = vi.fn(async () => {
			throw new Error("Sticker Lab reference is absent from discovery");
		});
		const { dependencies, applyManifest } = applyDependencies({
			prepareAssets,
		});
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: patchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("asset preparation failed");
		expect(applyManifest).not.toHaveBeenCalled();
	});

	it("rolls back imported sticker media when the apply fails", async () => {
		const applyManifest = vi.fn(async () => ({
			success: false,
			error: "Manifest verification failed: element 'caption:1' is missing",
		}));
		const prepareAssets = vi.fn(async ({ patch }: { patch: ComposePatch }) => ({
			patch,
			bindings: {},
			importedMediaIds: ["imported-media-1", "imported-media-2"],
		}));
		const { dependencies, rollbackStickerMedia } = applyDependencies({
			applyManifest,
			prepareAssets,
		});
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: patchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(rollbackStickerMedia).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaIds: ["imported-media-1", "imported-media-2"],
				projectId: "project-1",
			})
		);
	});

	it("cleans up prepared media when the patch plans nothing", async () => {
		const snapshot = fixtureSnapshot();
		// A sticker without a binding or localPath converts to `skipped`, so
		// the plan is empty while an import already happened.
		const skippedPatch: ComposePatch = {
			...fixturePatch({ snapshot }),
			operations: [
				{
					kind: "add-sticker",
					id: "sticker:1",
					startTime: 1,
					duration: 2,
					asset: {
						provider: "qcut",
						assetType: "sticker",
						assetId: "sticker-lab:batch-1:1001",
					},
				},
			],
		};
		const skippedPatchPath = path.join(directory, "skipped-patch.json");
		fs.writeFileSync(skippedPatchPath, JSON.stringify(skippedPatch));
		const prepareAssets = vi.fn(async ({ patch }: { patch: ComposePatch }) => ({
			patch,
			bindings: {},
			importedMediaIds: ["orphan-media-1"],
		}));
		const { dependencies, applyManifest, rollbackStickerMedia } =
			applyDependencies({ prepareAssets });
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: skippedPatchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(applyManifest).not.toHaveBeenCalled();
		expect(rollbackStickerMedia).toHaveBeenCalledWith(
			expect.objectContaining({ mediaIds: ["orphan-media-1"] })
		);
		expect(result.data).toMatchObject({ importedMediaCount: 0 });
	});

	it("replays the same patch without creating duplicate elements", async () => {
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
				duration: 10,
				trimStart: 0,
			},
			{
				id: "media-2",
				kind: "video" as const,
				trackId: "track-video",
				elementId: "element-2",
				startTime: 10,
				duration: 10,
				trimStart: 0,
			},
		];
		const snapshot: ComposeSnapshot = {
			...fixtureSnapshot(),
			id: "snapshot-replay",
			media,
			sourceFingerprint: computeComposeSourceFingerprint({
				project,
				media,
				captions: [],
			}),
		};
		const replayPatch: ComposePatch = {
			...fixturePatch({ snapshot }),
			snapshotId: snapshot.id,
			sourceFingerprint: snapshot.sourceFingerprint,
			operations: [
				{
					kind: "add-caption",
					id: "caption:1",
					text: "hello",
					language: "en",
					startTime: 1,
					duration: 2,
				},
				{
					kind: "upsert-transition",
					id: "transition:1",
					trackId: "track-video",
					fromElementId: "element-1",
					toElementId: "element-2",
					presetId: "crossfade",
					startTime: 9.5,
					duration: 1,
				},
			],
		};
		const replaySnapshotPath = path.join(directory, "replay-snapshot.json");
		const replayPatchPath = path.join(directory, "replay-patch.json");
		fs.writeFileSync(replaySnapshotPath, JSON.stringify(snapshot));
		fs.writeFileSync(replayPatchPath, JSON.stringify(replayPatch));

		// A tiny live editor: the first apply lands elements and transitions,
		// which the replay's timeline read then reports back.
		const timeline: {
			tracks: Array<{
				id: string;
				elements: Array<{ id: string }>;
				transitions: Array<{
					duration: number;
					fromElementId: string;
					presetId: string;
					toElementId: string;
				}>;
			}>;
		} = {
			tracks: [{ id: "track-video", elements: [], transitions: [] }],
		};
		const applyManifest = vi.fn(async () => {
			timeline.tracks[0].elements.push({ id: "caption:1" });
			timeline.tracks[0].transitions.push({
				duration: 1,
				fromElementId: "element-1",
				// The bridge stores the EDITOR preset vocabulary
				// (crossfade → dissolve), which replay matching normalizes to.
				presetId: "dissolve",
				toElementId: "element-2",
			});
			return {
				success: true,
				data: {
					elements: { "caption:1": "caption:1" },
					transitionIds: ["transition-real-1"],
					verified: true,
				},
			};
		});
		const { dependencies, prepareAssets } = applyDependencies({
			applyManifest,
			timeline,
		});
		const runOptions = options({
			snapshot: replaySnapshotPath,
			patch: replayPatchPath,
		});

		const first = await handleComposeApply(
			runOptions,
			noProgress,
			signal,
			dependencies
		);
		expect(first.success).toBe(true);
		expect(first.data).toMatchObject({
			applied: { "caption:1": "caption:1" },
			alreadyAppliedOperationIds: [],
		});
		expect(applyManifest).toHaveBeenCalledTimes(1);

		const second = await handleComposeApply(
			runOptions,
			noProgress,
			signal,
			dependencies
		);
		expect(second.success).toBe(true);
		// Nothing re-applies: the timeline keeps one caption, one transition.
		expect(applyManifest).toHaveBeenCalledTimes(1);
		expect(second.data).toMatchObject({
			applied: {},
			alreadyAppliedOperationIds: ["caption:1", "transition:1"],
		});
		expect(timeline.tracks[0].elements).toHaveLength(1);
		expect(timeline.tracks[0].transitions).toHaveLength(1);
		// The replay prepared nothing, so no duplicate sticker/sound imports.
		const replayPrepareCall = prepareAssets.mock.calls.at(-1)?.[0] as {
			patch: ComposePatch;
		};
		expect(replayPrepareCall.patch.operations).toEqual([]);

		const changedPatch: ComposePatch = {
			...replayPatch,
			id: "patch-transition-changed",
			operations: replayPatch.operations.map((operation) =>
				operation.kind === "upsert-transition"
					? { ...operation, duration: 0.5, presetId: "dissolve" }
					: operation
			),
		};
		fs.writeFileSync(replayPatchPath, JSON.stringify(changedPatch));
		const changed = await handleComposeApply(
			runOptions,
			noProgress,
			signal,
			dependencies
		);

		expect(changed.success).toBe(true);
		expect(applyManifest).toHaveBeenCalledTimes(2);
		const changedPrepareCall = prepareAssets.mock.calls.at(-1)?.[0] as {
			patch: ComposePatch;
		};
		expect(changedPrepareCall.patch.operations).toMatchObject([
			{ kind: "upsert-transition", duration: 0.5, presetId: "dissolve" },
		]);
	});
});
