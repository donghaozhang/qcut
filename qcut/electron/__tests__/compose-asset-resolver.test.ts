import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	materializeComposePatchAssets,
	resolveComposeAssetReference,
	resolveComposePatchAssets,
	type ComposeAssetResolverDependencies,
} from "../native-pipeline/compose/compose-asset-resolver.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposePatch,
} from "../native-pipeline/compose/compose-protocol.js";

let directory = "";
let cachedFilePath = "";

const missingLabDependencies: ComposeAssetResolverDependencies = {
	findStickerLabItem: async () => ({ found: false }),
	readStickerLabItem: async () => {
		throw new Error("not cached");
	},
};

function makePatch({
	operations,
}: {
	operations: ComposePatch["operations"];
}): ComposePatch {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "patch-1",
		source: "local-heuristic",
		intentKind: "smart-packaging",
		mode: "idempotent",
		snapshotId: "snapshot-1",
		sourceFingerprint: "f".repeat(64),
		createdAt: "2026-08-30T00:01:00.000Z",
		operations,
		warnings: [],
	};
}

beforeAll(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-compose-assets-"));
	cachedFilePath = path.join(directory, "cached.wav");
	fs.writeFileSync(cachedFilePath, Buffer.alloc(128, 3));
});

afterAll(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("resolveComposeAssetReference", () => {
	it("classifies an existing localPath as cached with a digest", async () => {
		const resolved = await resolveComposeAssetReference({
			operationId: "sound:1",
			reference: {
				provider: "local",
				assetType: "sound-effect",
				assetId: "sound-1",
				localPath: cachedFilePath,
			},
			dependencies: missingLabDependencies,
		});
		expect(resolved).toMatchObject({
			status: "cached",
			bytes: 128,
			evidence: { backend: "local-file", verification: "digest-only" },
		});
		expect(resolved.sha256).toMatch(/^[a-f0-9]{64}$/);
	});

	it("classifies Sticker Lab references by local cache presence", async () => {
		const found = await resolveComposeAssetReference({
			operationId: "sticker:1",
			reference: {
				provider: "local",
				assetType: "sticker",
				assetId: "sticker-lab:batch-01:18001",
			},
			dependencies: {
				...missingLabDependencies,
				findStickerLabItem: async ({ batchId, stickerId }) => {
					expect(batchId).toBe("batch-01");
					expect(stickerId).toBe("18001");
					return { found: true, byteSize: 4_096 };
				},
			},
		});
		expect(found).toMatchObject({
			status: "cached",
			bytes: 4_096,
			evidence: { backend: "sticker-lab", cacheStatus: "local-reference" },
		});

		const missing = await resolveComposeAssetReference({
			operationId: "sticker:2",
			reference: {
				provider: "local",
				assetType: "sticker",
				assetId: "sticker-lab:batch-01:99999",
			},
			dependencies: missingLabDependencies,
		});
		expect(missing.status).toBe("missing");
	});

	it("classifies iconify ids, cloud sounds, transitions, and text assets", async () => {
		const iconify = await resolveComposeAssetReference({
			operationId: "sticker:3",
			reference: {
				provider: "local",
				assetType: "sticker",
				assetId: "mdi:home",
			},
			dependencies: missingLabDependencies,
		});
		expect(iconify.status).toBe("downloadable");

		const cloudSound = await resolveComposeAssetReference({
			operationId: "sound:2",
			reference: {
				provider: "qcut",
				assetType: "sound-effect",
				assetId: "sfx-123",
			},
			dependencies: missingLabDependencies,
		});
		expect(cloudSound.status).toBe("cloud-only");

		const editorPreset = await resolveComposeAssetReference({
			operationId: "transition:1",
			reference: {
				provider: "local",
				assetType: "transition",
				assetId: "dissolve",
			},
			dependencies: missingLabDependencies,
		});
		expect(editorPreset).toMatchObject({
			status: "cached",
			evidence: { backend: "editor-preset" },
		});

		const labRecipe = await resolveComposeAssetReference({
			operationId: "transition:2",
			reference: {
				provider: "local",
				assetType: "transition",
				assetId: "lab-clean-dissolve",
			},
			dependencies: missingLabDependencies,
		});
		expect(labRecipe).toMatchObject({
			status: "cached",
			evidence: { backend: "transition-lab" },
		});

		const unknownTransition = await resolveComposeAssetReference({
			operationId: "transition:3",
			reference: {
				provider: "local",
				assetType: "transition",
				assetId: "made-up",
			},
			dependencies: missingLabDependencies,
		});
		expect(unknownTransition.status).toBe("unsupported");

		const textTemplate = await resolveComposeAssetReference({
			operationId: "text:1",
			reference: {
				provider: "local",
				assetType: "text-template",
				assetId: "template-1",
			},
			dependencies: missingLabDependencies,
		});
		expect(textTemplate.status).toBe("unsupported");
	});

	it("never leaks local paths into the portable report", async () => {
		const resolved = await resolveComposeAssetReference({
			operationId: "sound:1",
			reference: {
				provider: "local",
				assetType: "sound-effect",
				assetId: "sound-1",
				localPath: cachedFilePath,
			},
			dependencies: missingLabDependencies,
		});
		expect(JSON.stringify(resolved)).not.toContain(directory);
	});
});

describe("resolveComposePatchAssets", () => {
	it("maps statuses onto blocking and advisory issues", async () => {
		const { reports, issues } = await resolveComposePatchAssets({
			patch: makePatch({
				operations: [
					{
						kind: "add-sticker",
						id: "sticker:missing",
						startTime: 1,
						duration: 1,
						asset: {
							provider: "local",
							assetType: "sticker",
							assetId: "sticker-lab:batch-01:404",
						},
					},
					{
						kind: "upsert-transition",
						id: "transition:bad",
						trackId: "t",
						fromElementId: "a",
						toElementId: "b",
						startTime: 5,
						duration: 1,
						presetId: "made-up",
					},
					{
						kind: "add-sound-effect",
						id: "sound:cloud",
						startTime: 2,
						duration: 1,
						volume: 0.8,
						asset: {
							provider: "qcut",
							assetType: "sound-effect",
							assetId: "sfx-1",
						},
					},
				],
			}),
			dependencies: missingLabDependencies,
		});
		expect(reports).toHaveLength(3);
		expect(issues).toMatchObject([
			{ severity: "error", operationId: "sticker:missing" },
			{ severity: "error", operationId: "transition:bad" },
			{ severity: "warning", operationId: "sound:cloud" },
		]);
	});
});

describe("materializeComposePatchAssets", () => {
	it("writes cached Sticker Lab bytes into scratch and injects localPath", async () => {
		const readStickerLabItem = vi.fn(async () => ({
			bytes: new Uint8Array([1, 2, 3, 4]),
			fileName: "sticker.webp",
			checksumSha256: "c".repeat(64),
		}));
		const patch = makePatch({
			operations: [
				{
					kind: "add-sticker",
					id: "sticker:lab",
					startTime: 1,
					duration: 1,
					asset: {
						provider: "local",
						assetType: "sticker",
						assetId: "sticker-lab:batch-01:18001",
					},
				},
				{
					kind: "add-caption",
					id: "caption:1",
					text: "hi",
					language: "en",
					startTime: 1,
					duration: 1,
				},
			],
		});
		const scratchDirectory = path.join(directory, "scratch");
		const materialized = await materializeComposePatchAssets({
			patch,
			scratchDirectory,
			dependencies: { ...missingLabDependencies, readStickerLabItem },
		});
		const sticker = materialized.operations[0];
		if (sticker.kind !== "add-sticker") throw new Error("expected sticker");
		expect(sticker.asset.localPath).toBeDefined();
		expect(fs.readFileSync(sticker.asset.localPath as string)).toEqual(
			Buffer.from([1, 2, 3, 4])
		);
		expect(sticker.asset.localPath).toContain(scratchDirectory);
		expect(materialized.operations[1]).toEqual(patch.operations[1]);
		expect(patch.operations[0]).not.toHaveProperty("asset.localPath");
	});
});
