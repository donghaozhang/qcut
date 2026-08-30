import { basename, extname } from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type {
	LocalStickerLabDiscovery,
	LocalStickerLabReadResult,
	LocalStickerLabReference,
} from "../../stickers/local-reference-catalog";
import type { EditorApiClient } from "../editor-api-client";
import {
	importStickerLabReference,
	rollbackStickerLabMedia,
	type StickerLabRuntimeDescriptor,
	type StickerRuntimeImportDependencies,
} from "../editor-sticker-runtime-import";

const ROOT_PATH = "/private/QCut Sticker Lab";
const BATCH_ID = "jianying-2026-08-30-batch-19";
const PRIMARY_CHECKSUM = "a".repeat(64);

interface RuntimeResourceFixture {
	checksumSha256: string;
	fileName: string;
	mimeType: "image/png" | "video/webm";
	resourceName: string;
}

interface RuntimeCase {
	descriptor: StickerLabRuntimeDescriptor;
	expectedSources: string[];
	name: string;
	primaryFileName: string;
	resources: RuntimeResourceFixture[];
	stickerId: string;
}

interface RuntimeFixture {
	dependencies: StickerRuntimeImportDependencies;
	discovery: LocalStickerLabDiscovery;
}

interface ImportCall {
	mediaId: string;
	metadata: Record<string, unknown>;
	source: string;
}

function atlasFrame({
	id,
	startSeconds,
	x,
}: {
	id: string;
	startSeconds: number;
	x: number;
}) {
	return {
		id,
		startSeconds,
		durationSeconds: 0.5,
		frameRect: { x, y: 0, width: 32, height: 32 },
		rotated: false,
		trimmed: false,
		spriteSourceRect: { x: 0, y: 0, width: 32, height: 32 },
		sourceSize: { width: 32, height: 32 },
	};
}

function pngSequenceDescriptor({
	resourceNames,
}: {
	resourceNames: readonly string[];
}): StickerLabRuntimeDescriptor {
	const durationSeconds = 1 / resourceNames.length;
	return {
		kind: "png-sequence",
		cycleDurationSeconds: 1,
		frames: resourceNames.map((source, index) => ({
			source,
			startSeconds: index * durationSeconds,
			durationSeconds,
		})),
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	};
}

const ATLAS_CASE: RuntimeCase = {
	name: "Atlas",
	stickerId: "19001",
	primaryFileName: "atlas-preview.png",
	resources: [
		{
			checksumSha256: "b".repeat(64),
			fileName: "SequenceMap.png",
			mimeType: "image/png",
			resourceName: "atlas/SequenceMap.png",
		},
	],
	descriptor: {
		kind: "atlas-animation",
		atlasSource: "atlas/SequenceMap.png",
		atlasSize: { width: 64, height: 32 },
		cycleDurationSeconds: 1,
		frames: [
			atlasFrame({ id: "frame-0", startSeconds: 0, x: 0 }),
			atlasFrame({ id: "frame-1", startSeconds: 0.5, x: 32 }),
		],
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	},
	expectedSources: ["$resource:asset_0001"],
};

const PNG_SEQUENCE_CASE: RuntimeCase = {
	name: "PNG sequence",
	stickerId: "19002",
	primaryFileName: "sequence-preview.png",
	resources: [
		{
			checksumSha256: "c".repeat(64),
			fileName: "frame-00.png",
			mimeType: "image/png",
			resourceName: "frames/frame-00.png",
		},
		{
			checksumSha256: "d".repeat(64),
			fileName: "frame-01.png",
			mimeType: "image/png",
			resourceName: "frames/frame-01.png",
		},
	],
	descriptor: pngSequenceDescriptor({
		resourceNames: ["frames/frame-00.png", "frames/frame-01.png"],
	}),
	expectedSources: ["$resource:asset_0001", "$resource:asset_0002"],
};

const ALPHA_VIDEO_CASE: RuntimeCase = {
	name: "Alpha Video",
	stickerId: "19003",
	primaryFileName: "alpha-preview.png",
	resources: [
		{
			checksumSha256: "e".repeat(64),
			fileName: "alpha-runtime.webm",
			mimeType: "video/webm",
			resourceName: "video/alpha-runtime.webm",
		},
	],
	descriptor: {
		kind: "alpha-video",
		source: "video/alpha-runtime.webm",
		sourceDurationSeconds: 1,
		cycleDurationSeconds: 1,
		layout: {
			kind: "side-by-side",
			colorRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
			maskRect: { x: 0, y: 0, width: 0.5, height: 1 },
			mask: { channel: "luma", inverted: false },
		},
		progressKeyframes: [
			{ atSeconds: 0, sourceProgress: 0, interpolation: "linear" },
			{ atSeconds: 1, sourceProgress: 1, interpolation: "hold" },
		],
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	},
	expectedSources: ["$resource:asset_0001"],
};

const RUNTIME_CASES = [
	ATLAS_CASE,
	PNG_SEQUENCE_CASE,
	ALPHA_VIDEO_CASE,
] as const;

function runtimeSources({
	descriptor,
}: {
	descriptor: StickerLabRuntimeDescriptor;
}): string[] {
	switch (descriptor.kind) {
		case "atlas-animation":
			return [descriptor.atlasSource ?? "$primary"];
		case "png-sequence":
			return descriptor.frames.map(({ source }) => source);
		case "alpha-video":
			return [
				descriptor.source,
				...(descriptor.layout.kind === "separate-mask"
					? [descriptor.layout.maskSource]
					: []),
			];
	}
}

function runtimeFixture({
	runtimeCase,
}: {
	runtimeCase: RuntimeCase;
}): RuntimeFixture {
	const primaryBytes = new Uint8Array([1, 2, 3, 4]);
	const resourceReads = new Map<string, LocalStickerLabReadResult>();
	const runtimeResources = runtimeCase.resources.map((resource, index) => {
		const bytes = new Uint8Array([10 + index, 20 + index, 30 + index]);
		resourceReads.set(resource.resourceName, {
			batchId: BATCH_ID,
			bytes,
			checksumSha256: resource.checksumSha256,
			fileName: resource.fileName,
			mimeType: resource.mimeType,
			resourceName: resource.resourceName,
			stickerId: runtimeCase.stickerId,
		});
		return {
			resourceName: resource.resourceName,
			fileName: resource.fileName,
			mimeType: resource.mimeType,
			asset: {
				kind: "local-reference-runtime-resource" as const,
				rootPath: ROOT_PATH,
				batchId: BATCH_ID,
				stickerId: runtimeCase.stickerId,
				resourceName: resource.resourceName,
				byteSize: bytes.byteLength,
				checksumSha256: resource.checksumSha256,
			},
		};
	});
	const reference: LocalStickerLabReference = {
		id: runtimeCase.stickerId,
		displayName: runtimeCase.name,
		fileName: runtimeCase.primaryFileName,
		mimeType: "image/png",
		sourceKind: runtimeCase.descriptor.kind,
		playback: {
			kind: "animated",
			frameCount: 2,
			cycleDuration: 1,
			loop: true,
		},
		asset: {
			kind: "local-reference",
			rootPath: ROOT_PATH,
			batchId: BATCH_ID,
			stickerId: runtimeCase.stickerId,
			byteSize: primaryBytes.byteLength,
			checksumSha256: PRIMARY_CHECKSUM,
		},
		runtimePackage: {
			descriptor: runtimeCase.descriptor,
			resources: runtimeResources,
		},
	};
	const discovery: LocalStickerLabDiscovery = {
		rootPath: ROOT_PATH,
		catalogs: [
			{
				version: 1,
				batchId: BATCH_ID,
				referenceOnly: true,
				categories: [
					{
						id: "runtime",
						label: "Runtime",
						sourcePanel: "Test fixture",
						items: [reference],
					},
				],
				itemCount: 1,
				totalBytes:
					primaryBytes.byteLength +
					runtimeResources.reduce(
						(total, resource) => total + resource.asset.byteSize,
						0
					),
			},
		],
		warnings: [],
		summary: {
			batchCount: 1,
			categoryCount: 1,
			itemCount: 1,
			totalBytes: primaryBytes.byteLength,
		},
	};
	const dependencies: StickerRuntimeImportDependencies = {
		readLocalReference: async ({ resourceName }) => {
			if (resourceName) {
				const resource = resourceReads.get(resourceName);
				if (!resource) throw new Error(`Unknown resource: ${resourceName}`);
				return resource;
			}
			return {
				batchId: BATCH_ID,
				bytes: primaryBytes,
				checksumSha256: PRIMARY_CHECKSUM,
				fileName: runtimeCase.primaryFileName,
				mimeType: "image/png",
				stickerId: runtimeCase.stickerId,
			};
		},
	};
	return { dependencies, discovery };
}

describe("Sticker Lab CLI runtime import", () => {
	test.each(
		RUNTIME_CASES
	)("imports $name resources with normalized metadata", async ({
		descriptor,
		expectedSources,
		primaryFileName,
		resources,
		stickerId,
	}) => {
		const { dependencies, discovery } = runtimeFixture({
			runtimeCase: {
				descriptor,
				expectedSources: [...expectedSources],
				name: descriptor.kind,
				primaryFileName,
				resources: [...resources],
				stickerId,
			},
		});
		const importCalls: ImportCall[] = [];
		const materializedPaths: string[] = [];
		const client = {
			post: async (_path: string, body: Record<string, unknown>) => {
				const source = String(body.source);
				const metadata = body.metadata as Record<string, unknown>;
				expect(existsSync(source)).toBe(true);
				materializedPaths.push(source);
				const resourceName = metadata.stickerRuntimeResourceName;
				const mediaId =
					typeof resourceName === "string"
						? `media-${resourceName}`
						: `media-primary-${stickerId}`;
				importCalls.push({ mediaId, metadata, source });
				return { id: mediaId };
			},
			delete: async () => true,
		} as unknown as EditorApiClient;

		const imported = await importStickerLabReference({
			batchId: BATCH_ID,
			client,
			dependencies,
			discovery,
			projectId: "project/runtime",
			stickerId,
		});

		const expectedResourceMap = Object.fromEntries(
			resources.map((_resource, index) => {
				const normalizedName = `asset_${String(index + 1).padStart(4, "0")}`;
				return [normalizedName, `media-${normalizedName}`];
			})
		);
		const primaryCall = importCalls.find(
			({ metadata }) => metadata.source === "sticker-lab"
		);
		expect(primaryCall).toBeDefined();
		expect(basename(primaryCall?.source ?? "")).toBe(primaryFileName);
		expect(primaryCall?.metadata).toMatchObject({
			animatedSticker: true,
			batchId: BATCH_ID,
			checksumSha256: PRIMARY_CHECKSUM,
			itemId: stickerId,
			referenceOnly: true,
			redistribution: "prohibited",
			source: "sticker-lab",
			stickerRuntimeResources: expectedResourceMap,
			usage: "internal-reference-only",
		});
		expect(primaryCall?.metadata.stickerRuntime).toEqual(
			imported.stickerRuntime
		);
		expect(runtimeSources({ descriptor: imported.stickerRuntime })).toEqual(
			expectedSources
		);

		for (const [index, resource] of resources.entries()) {
			const normalizedName = `asset_${String(index + 1).padStart(4, "0")}`;
			const resourceCall = importCalls.find(
				({ metadata }) => metadata.stickerRuntimeResourceName === normalizedName
			);
			expect(resourceCall).toBeDefined();
			expect(basename(resourceCall?.source ?? "")).toBe(
				`${normalizedName}-${resource.fileName}`
			);
			expect(extname(resourceCall?.source ?? "")).toBe(
				resource.mimeType === "video/webm" ? ".webm" : ".png"
			);
			expect(resourceCall?.metadata).toEqual({
				batchId: BATCH_ID,
				checksumSha256: resource.checksumSha256,
				itemId: stickerId,
				referenceOnly: true,
				redistribution: "prohibited",
				source: "sticker-runtime-resource",
				stickerAssetId: `sticker-lab:${BATCH_ID}:${stickerId}`,
				stickerAssetVersion: 1,
				stickerRuntimeResourceName: normalizedName,
				stickerRuntimeSourceUrl: resource.resourceName,
				usage: "internal-reference-only",
			});
		}
		expect(materializedPaths.every((path) => !existsSync(path))).toBe(true);
	});

	test("gives duplicate resource basenames unique project media names", async () => {
		const resources: RuntimeResourceFixture[] = [
			{
				checksumSha256: "1".repeat(64),
				fileName: "shared.png",
				mimeType: "image/png",
				resourceName: "first/shared.png",
			},
			{
				checksumSha256: "2".repeat(64),
				fileName: "shared.png",
				mimeType: "image/png",
				resourceName: "second/shared.png",
			},
		];
		const runtimeCase: RuntimeCase = {
			descriptor: pngSequenceDescriptor({
				resourceNames: resources.map(({ resourceName }) => resourceName),
			}),
			expectedSources: [],
			name: "Duplicate basename sequence",
			primaryFileName: "duplicate-preview.png",
			resources,
			stickerId: "19005",
		};
		const { dependencies, discovery } = runtimeFixture({ runtimeCase });
		const resourceBasenames: string[] = [];
		const client = {
			post: async (_path: string, body: Record<string, unknown>) => {
				const metadata = body.metadata as Record<string, unknown>;
				if (metadata.source === "sticker-runtime-resource") {
					const sourceBasename = basename(String(body.source));
					resourceBasenames.push(sourceBasename);
					return { id: `media-${sourceBasename}` };
				}
				return { id: "media-primary" };
			},
			delete: async () => true,
		} as unknown as EditorApiClient;

		const imported = await importStickerLabReference({
			batchId: BATCH_ID,
			client,
			dependencies,
			discovery,
			projectId: "project/runtime",
			stickerId: runtimeCase.stickerId,
		});

		expect(new Set(resourceBasenames)).toEqual(
			new Set(["asset_0001-shared.png", "asset_0002-shared.png"])
		);
		expect(new Set(imported.importedMediaIds).size).toBe(3);
	});

	test("rolls back every successful resource when a later resource import fails", async () => {
		const resources = Array.from({ length: 4 }, (_, index) => ({
			checksumSha256: String(index + 1).repeat(64),
			fileName: `frame-${index}.png`,
			mimeType: "image/png" as const,
			resourceName: `frames/frame-${index}.png`,
		}));
		const runtimeCase: RuntimeCase = {
			name: "PNG sequence failure",
			stickerId: "19004",
			primaryFileName: "failure-preview.png",
			resources,
			descriptor: pngSequenceDescriptor({
				resourceNames: resources.map(({ resourceName }) => resourceName),
			}),
			expectedSources: [],
		};
		const { dependencies, discovery } = runtimeFixture({ runtimeCase });
		const importedMediaIds: string[] = [];
		const deletedMediaIds: string[] = [];
		const materializedPaths: string[] = [];
		const client = {
			post: async (_path: string, body: Record<string, unknown>) => {
				const source = String(body.source);
				const metadata = body.metadata as Record<string, unknown>;
				materializedPaths.push(source);
				const resourceName = String(metadata.stickerRuntimeResourceName);
				if (resourceName === "asset_0003") {
					throw new Error("third runtime resource rejected");
				}
				const mediaId = `media-${resourceName}`;
				importedMediaIds.push(mediaId);
				return { id: mediaId };
			},
			delete: async (path: string) => {
				deletedMediaIds.push(path.split("/").at(-1) ?? "");
				return true;
			},
		} as unknown as EditorApiClient;

		await expect(
			importStickerLabReference({
				batchId: BATCH_ID,
				client,
				dependencies,
				discovery,
				projectId: "project/runtime",
				stickerId: runtimeCase.stickerId,
			})
		).rejects.toThrow("third runtime resource rejected");
		expect(new Set(deletedMediaIds)).toEqual(new Set(importedMediaIds));
		expect(importedMediaIds.length).toBeGreaterThan(0);
		expect(materializedPaths.every((path) => !existsSync(path))).toBe(true);
	});

	test("reports a rollback endpoint that returns false", async () => {
		const client = {
			delete: async () => false,
		} as unknown as EditorApiClient;

		await expect(
			rollbackStickerLabMedia({
				cause: new Error("timeline placement failed"),
				client,
				context: "Sticker placement failed",
				mediaIds: ["runtime-resource"],
				projectId: "project/runtime",
			})
		).rejects.toThrow(
			"Sticker placement failed: timeline placement failed. Imported media rollback also failed: Media rollback did not delete runtime-resource"
		);
	});
});
