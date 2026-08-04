import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getPrivateStickerCatalogDefinition,
	PRIVATE_STICKER_CATALOG_IDS,
} from "@qcut/editor-core/sticker-lab";
import { preparePrivateStickerCatalog } from "../sticker-lab-private-catalog";
import type {
	PreparedPrivateCatalog,
	PrivateStickerManifest,
} from "../sticker-lab-private-catalog/types";

const temporaryDirectories: string[] = [];

export const GIF_BYTES = new Uint8Array([
	71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0,
]);

export interface StickerCatalogFixture {
	assetPath: string;
	checksumSha256: string;
	manifest: Record<string, unknown>;
	manifestPath: string;
	report: Record<string, unknown>;
	reportPath: string;
	root: string;
}

export async function makeTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-private-stickers-"));
	temporaryDirectories.push(directory);
	return directory;
}

export async function cleanupTemporaryDirectories(): Promise<void> {
	const directories = temporaryDirectories.splice(0);
	await Promise.all(
		directories.map((directory) => rm(directory, { recursive: true }))
	);
}

export async function createStickerCatalogFixture({
	id = "7001",
}: {
	id?: string;
} = {}): Promise<StickerCatalogFixture> {
	const root = await realpath(await makeTemporaryDirectory());
	const assetsDirectory = join(root, "preview-gifs");
	await mkdir(assetsDirectory);
	const fileName = `${id}-测试.gif`;
	const assetPath = join(assetsDirectory, fileName);
	await writeFile(assetPath, GIF_BYTES);
	const checksumSha256 = createHash("sha256").update(GIF_BYTES).digest("hex");
	const manifest: Record<string, unknown> = {
		version: 1,
		referenceOnly: true,
		generatedAt: "2026-08-01T00:00:00Z",
		categories: [
			{
				id: "10515",
				label: "热门",
				sourcePanel: "Jianying cached sticker metadata",
				items: [
					{
						id,
						displayName: "测试",
						fileName,
						filePath: assetPath,
						mimeType: "image/gif",
						sourceKind: "preview-gif",
						playback: {
							kind: "animated",
							frameCount: 2,
							frameRate: 2,
							cycleDuration: 1,
							loop: true,
						},
					},
				],
			},
		],
	};
	const report: Record<string, unknown> = {
		version: 2,
		referenceOnly: true,
		success: [
			{
				categoryId: "10515",
				category: "热门",
				endpointRow: null,
				position: 0,
				id,
				title: "测试",
				sourceKind: "preview-gif",
				mimeType: "image/gif",
				filePath: assetPath,
				codec: "gif",
				width: 1,
				height: 1,
				frameCount: 2,
				frameRate: 2,
				durationSeconds: 1,
				byteSize: GIF_BYTES.byteLength,
				sha256: checksumSha256,
			},
		],
	};
	const manifestPath = join(root, "manifest.json");
	const reportPath = join(root, "report.json");
	await Promise.all([
		writeFile(manifestPath, JSON.stringify(manifest)),
		writeFile(reportPath, JSON.stringify(report)),
	]);
	return {
		assetPath,
		checksumSha256,
		manifest,
		manifestPath,
		report,
		reportPath,
		root,
	};
}

export async function rewriteStickerCatalogFixture({
	fixture,
}: {
	fixture: StickerCatalogFixture;
}): Promise<void> {
	await Promise.all([
		writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest)),
		writeFile(fixture.reportPath, JSON.stringify(fixture.report)),
	]);
}

export async function createAgainstManifestPaths({
	catalogId,
	fixture,
}: {
	catalogId: string;
	fixture: StickerCatalogFixture;
}): Promise<string[]> {
	const registeredCatalogIds: readonly string[] = PRIVATE_STICKER_CATALOG_IDS;
	const catalogIndex = registeredCatalogIds.indexOf(catalogId);
	if (catalogIndex < 0)
		throw new Error(`Unknown fixture catalogId: ${catalogId}`);
	const localCategory = (
		fixture.manifest.categories as Array<{
			id: string;
			label: string;
			sourcePanel: string;
		}>
	)[0];
	if (!localCategory) throw new Error("Missing fixture category");
	return Promise.all(
		PRIVATE_STICKER_CATALOG_IDS.slice(0, catalogIndex).map(
			async (againstCatalogId, againstIndex) => {
				const definition = getPrivateStickerCatalogDefinition({
					catalogId: againstCatalogId,
				});
				if (!definition) {
					throw new Error(
						`Missing fixture catalog definition: ${againstCatalogId}`
					);
				}
				const itemId = String(6001 + againstIndex);
				const manifest: PrivateStickerManifest = {
					version: 2,
					catalogId: againstCatalogId,
					categories: [
						{
							id: localCategory.id,
							label: localCategory.label,
							sourcePanel: localCategory.sourcePanel,
							items: [
								{
									id: itemId,
									displayName: `previous-${againstIndex + 1}`,
									fileName: `${itemId}.gif`,
									mimeType: "image/gif",
									sourceKind: "preview-gif",
									playback: {
										kind: "animated",
										frameCount: 2,
										cycleDuration: 1,
										loop: true,
									},
									asset: {
										kind: "supabase-storage",
										objectKey: `${definition.assetObjectPrefix}${itemId}.gif`,
										byteSize: 1,
										checksumSha256: String(againstIndex + 1).repeat(64),
									},
								},
							],
						},
					],
				};
				const againstPath = join(
					fixture.root,
					`against-${againstCatalogId}.json`
				);
				await writeFile(againstPath, JSON.stringify(manifest));
				return againstPath;
			}
		)
	);
}

export async function prepareStickerCatalogFixture({
	fixture,
	againstManifestPaths,
	catalogId = "jianying-2026-08-01-batch-2",
}: {
	againstManifestPaths?: string[];
	catalogId?: string;
	fixture: StickerCatalogFixture;
}): Promise<PreparedPrivateCatalog> {
	const resolvedAgainstManifestPaths =
		againstManifestPaths ??
		(await createAgainstManifestPaths({ catalogId, fixture }));
	return preparePrivateStickerCatalog({
		againstManifestPaths: resolvedAgainstManifestPaths,
		catalogId,
		manifestPath: fixture.manifestPath,
		reportPath: fixture.reportPath,
	});
}
