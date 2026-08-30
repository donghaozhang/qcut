import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	prepareComposeEditorAssets,
	type ComposeEditorAssetPreparerDependencies,
} from "../native-pipeline/compose/compose-editor-asset-preparer.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposePatch,
} from "../native-pipeline/compose/compose-protocol.js";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import { TRANSITION_LAB_RECIPES } from "../native-pipeline/transitions/transition-lab-catalog.js";

const client = new EditorApiClient({ baseUrl: "http://127.0.0.1:1" });
const stickerRuntime = {
	kind: "png-sequence" as const,
	cycleDurationSeconds: 1,
	frames: [
		{
			startSeconds: 0,
			durationSeconds: 1,
			source: "$primary",
		},
	],
	repeat: { kind: "infinite" as const },
	completion: "freeze-last" as const,
};

function makePatch({
	operations,
}: {
	operations: ComposePatch["operations"];
}): ComposePatch {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "patch-prepare",
		source: "cloud",
		intentKind: "smart-packaging",
		mode: "idempotent",
		snapshotId: "snapshot-1",
		sourceFingerprint: "f".repeat(64),
		createdAt: "2026-08-31T00:00:00.000Z",
		operations,
		warnings: [],
	};
}

function stickerOperation({ id }: { id: string }) {
	return {
		kind: "add-sticker" as const,
		id,
		startTime: 1,
		duration: 2,
		asset: {
			provider: "local" as const,
			assetType: "sticker" as const,
			assetId: "sticker-lab:batch-01:18001",
		},
	};
}

function soundOperation({ id }: { id: string }) {
	return {
		kind: "add-sound-effect" as const,
		id,
		startTime: 1,
		duration: 1,
		volume: 0.8,
		asset: {
			provider: "qcut" as const,
			assetType: "sound-effect" as const,
			assetId: "sound-effects-lab:impact-1",
		},
	};
}

function baseDependencies(): Partial<ComposeEditorAssetPreparerDependencies> {
	return {
		discoverStickers: async () => ({
			rootPath: "/sticker-lab",
			catalogs: [],
			warnings: [],
			summary: {
				batchCount: 0,
				categoryCount: 0,
				itemCount: 0,
				totalBytes: 0,
			},
		}),
		readSticker: async () => {
			throw new Error("import stub owns the fixture");
		},
		rollbackStickerMedia: async () => {},
	};
}

describe("prepareComposeEditorAssets", () => {
	it("deduplicates Sticker Lab imports, sound downloads, and transition probes", async () => {
		const importSticker = vi.fn(async () => ({
			importedMediaIds: ["runtime-media", "primary-media"],
			mediaId: "primary-media",
			reference: {
				bytes: new Uint8Array([1]),
				fileName: "sticker.png",
				mimeType: "image/png" as const,
				batchId: "batch-01",
				stickerId: "18001",
				checksumSha256: "a".repeat(64),
			},
			stickerRuntime,
		}));
		const materializeSound = vi.fn(async () => ({
			localPath: "/scratch/impact.wav",
			sha256: "b".repeat(64),
			bytes: 128,
			asset: {
				id: "impact-1",
				name: "Impact",
				durationSeconds: 1,
				tags: [],
				categoryIds: [],
				provider: "freesound" as const,
				redistribution: "allowed" as const,
				reusable: true,
			},
		}));
		const recipe = TRANSITION_LAB_RECIPES[1];
		if (!recipe) throw new Error("expected transition recipe");
		const resolveTransition = vi.fn(async () => ({
			status: "ready" as const,
			backend: "transition-lab" as const,
			presetId: recipe.id,
			recipe,
		}));
		const prepared = await prepareComposeEditorAssets({
			patch: makePatch({
				operations: [
					stickerOperation({ id: "sticker-1" }),
					stickerOperation({ id: "sticker-2" }),
					soundOperation({ id: "sound-1" }),
					soundOperation({ id: "sound-2" }),
					{
						kind: "upsert-transition",
						id: "transition-1",
						trackId: "track-1",
						fromElementId: "clip-a",
						toElementId: "clip-b",
						presetId: recipe.id,
						startTime: 3.5,
						duration: 1,
					},
				],
			}),
			client,
			projectId: "project-1",
			scratchDirectory: "/scratch",
			dependencies: {
				...baseDependencies(),
				importSticker,
				materializeSound,
				resolveTransition,
			},
		});

		expect(importSticker).toHaveBeenCalledOnce();
		expect(materializeSound).toHaveBeenCalledOnce();
		expect(resolveTransition).toHaveBeenCalledOnce();
		expect(prepared.importedMediaIds).toEqual([
			"runtime-media",
			"primary-media",
		]);
		expect(prepared.bindings["sticker-1"]?.sticker).toMatchObject({
			mediaId: "primary-media",
			stickerAssetId: "sticker-lab:batch-01:18001",
			stickerRuntime,
		});
		expect(prepared.bindings["sticker-2"]?.sticker?.mediaId).toBe(
			"primary-media"
		);
		expect(prepared.bindings["transition-1"]?.transition).toMatchObject({
			engine: "qcut",
			presetId: recipe.id,
			type: recipe.clip.type,
			easing: recipe.clip.easing,
		});
		const preparedSounds = prepared.patch.operations.filter(
			(operation) => operation.kind === "add-sound-effect"
		);
		expect(preparedSounds).toHaveLength(2);
		expect(preparedSounds).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					asset: expect.objectContaining({
						localPath: "/scratch/impact.wav",
						cacheKey: "b".repeat(64),
					}),
				}),
			])
		);
	});

	it("rolls back successful Sticker Lab imports when another asset fails", async () => {
		const rollbackStickerMedia = vi.fn(async () => {});
		await expect(
			prepareComposeEditorAssets({
				patch: makePatch({
					operations: [
						stickerOperation({ id: "sticker-1" }),
						soundOperation({ id: "sound-1" }),
					],
				}),
				client,
				projectId: "project-1",
				scratchDirectory: "/scratch",
				dependencies: {
					...baseDependencies(),
					importSticker: async () => ({
						importedMediaIds: ["runtime-media", "primary-media"],
						mediaId: "primary-media",
						reference: {
							bytes: new Uint8Array([1]),
							fileName: "sticker.png",
							mimeType: "image/png",
							batchId: "batch-01",
							stickerId: "18001",
							checksumSha256: "a".repeat(64),
						},
					}),
					materializeSound: async () => {
						throw new Error("checksum mismatch");
					},
					rollbackStickerMedia,
				},
			})
		).rejects.toThrow("checksum mismatch");
		expect(rollbackStickerMedia).toHaveBeenCalledWith(
			expect.objectContaining({
				context: "Compose editor asset preparation failed",
				mediaIds: ["runtime-media", "primary-media"],
				projectId: "project-1",
			})
		);
	});
});

describe("media clip bindings", () => {
	function clipOperation({
		id,
		localPath,
		sha256,
	}: {
		id: string;
		localPath?: string;
		sha256?: string;
	}) {
		return {
			kind: "insert-media-clip" as const,
			id,
			startTime: 0,
			duration: 10,
			asset: {
				provider: "local" as const,
				assetType: "media" as const,
				assetId: "manifest:a.mp4",
				...(localPath ? { localPath } : {}),
				...(sha256 ? { provenance: { sha256 } } : {}),
			},
			mediaKind: "video" as const,
			trackRole: "main-video" as const,
			trimStart: 1,
			trimEnd: 1,
			sourceDuration: 12,
		};
	}

	it("binds an existing file and verifies a declared checksum", async () => {
		const directory = await mkdtemp(join(tmpdir(), "compose-clip-"));
		const filePath = join(directory, "a.mp4");
		await writeFile(filePath, "fake video bytes");
		const sha256 = createHash("sha256")
			.update("fake video bytes")
			.digest("hex");
		const prepared = await prepareComposeEditorAssets({
			patch: makePatch({
				operations: [
					clipOperation({ id: "clip:a", localPath: filePath, sha256 }),
				],
			}),
			client,
			projectId: "project-1",
			scratchDirectory: directory,
			dependencies: baseDependencies(),
		});
		expect(prepared.bindings["clip:a"]?.mediaClip).toEqual({
			path: filePath,
			filename: "a.mp4",
		});
	});

	it("fails on checksum mismatches and missing files", async () => {
		const directory = await mkdtemp(join(tmpdir(), "compose-clip-"));
		const filePath = join(directory, "a.mp4");
		await writeFile(filePath, "fake video bytes");
		await expect(
			prepareComposeEditorAssets({
				patch: makePatch({
					operations: [
						clipOperation({
							id: "clip:bad",
							localPath: filePath,
							sha256: "0".repeat(64),
						}),
					],
				}),
				client,
				projectId: "project-1",
				scratchDirectory: directory,
				dependencies: baseDependencies(),
			})
		).rejects.toThrow(/failed its checksum/);
		await expect(
			prepareComposeEditorAssets({
				patch: makePatch({
					operations: [
						clipOperation({
							id: "clip:gone",
							localPath: join(directory, "missing.mp4"),
						}),
					],
				}),
				client,
				projectId: "project-1",
				scratchDirectory: directory,
				dependencies: baseDependencies(),
			})
		).rejects.toThrow(/missing or empty/);
		await expect(
			prepareComposeEditorAssets({
				patch: makePatch({ operations: [clipOperation({ id: "clip:none" })] }),
				client,
				projectId: "project-1",
				scratchDirectory: directory,
				dependencies: baseDependencies(),
			})
		).rejects.toThrow(/absolute localPath/);
	});
});
