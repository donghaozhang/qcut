import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	clearLocalReferenceDiscoveryCache,
	discoverLocalReferences,
	readLocalReference,
} from "../native-pipeline/stickers/local-reference-catalog/index";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const GIF_BYTES = new TextEncoder().encode("GIF89a-local-reference");
const temporaryRoots: string[] = [];

interface FixtureOptions {
	batchId?: string;
	bytes?: Uint8Array;
	filePath?: string;
	fixtureRootPath?: string;
	id?: string;
	manifestReferenceOnly?: boolean;
	mimeType?: "image/gif" | "image/png";
	reportReferenceOnly?: boolean;
	reportFrameRate?: number | null;
	reportPosition?: number;
	reportRemoteUrl?: string;
	reportSha256?: string;
	reportVersion?: 1 | 2;
	withLegacyReportFields?: boolean;
}

async function createTemporaryRoot(): Promise<string> {
	const temporaryPath = await mkdtemp(join(tmpdir(), "qcut-sticker-lab-"));
	const rootPath = await realpath(temporaryPath);
	temporaryRoots.push(rootPath);
	return rootPath;
}

function checksum({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function writeFixture({
	batchId = "jianying-2026-07-31",
	bytes = PNG_BYTES,
	filePath,
	fixtureRootPath,
	id = "123",
	manifestReferenceOnly,
	mimeType = "image/png",
	reportReferenceOnly,
	reportFrameRate,
	reportPosition = 0,
	reportRemoteUrl,
	reportSha256,
	reportVersion = 2,
	withLegacyReportFields = false,
}: FixtureOptions = {}): Promise<{
	assetPath: string;
	batchId: string;
	batchRoot: string;
	rootPath: string;
}> {
	const rootPath = fixtureRootPath ?? (await createTemporaryRoot());
	const batchRoot = join(rootPath, batchId);
	const extension = mimeType === "image/gif" ? "gif" : "png";
	const assetPath = filePath ?? join(batchRoot, "assets", `${id}.${extension}`);
	await Promise.all([
		mkdir(batchRoot, { recursive: true }),
		mkdir(dirname(assetPath), { recursive: true }),
	]);
	await writeFile(assetPath, bytes);
	const sourceKind = mimeType === "image/gif" ? "preview-gif" : "static-image";
	const playback =
		mimeType === "image/gif"
			? {
					kind: "animated",
					frameCount: 2,
					frameRate: 10,
					cycleDuration: 0.2,
					loop: true,
				}
			: { kind: "static" };
	const manifest = {
		version: 1,
		...(manifestReferenceOnly === undefined
			? {}
			: { referenceOnly: manifestReferenceOnly }),
		categories: [
			{
				id: "10515",
				label: "热门",
				sourcePanel: "fixture",
				items: [
					{
						id,
						displayName: `Sticker ${id}`,
						fileName: `${id}.${extension}`,
						filePath: assetPath,
						mimeType,
						sourceKind,
						playback,
					},
				],
			},
		],
	};
	const reportItem = {
		categoryId: "10515",
		category: "热门",
		endpointRow: 1,
		position: reportPosition,
		id,
		title: `Sticker ${id}`,
		sourceKind,
		mimeType,
		filePath: assetPath,
		codec: mimeType === "image/gif" ? "gif" : "png",
		width: 32,
		height: 32,
		frameCount: mimeType === "image/gif" ? 2 : 1,
		frameRate:
			reportFrameRate === undefined
				? mimeType === "image/gif"
					? 10
					: null
				: reportFrameRate,
		durationSeconds: mimeType === "image/gif" ? 0.2 : null,
		byteSize: bytes.byteLength,
		sha256: reportSha256 ?? checksum({ bytes }),
		...(withLegacyReportFields
			? { nonEmpty: true, reusedExistingFile: false }
			: {}),
	};
	const report = {
		version: reportVersion,
		...(reportRemoteUrl ? { downloadUrl: reportRemoteUrl } : {}),
		...(reportReferenceOnly === undefined
			? reportVersion === 2
				? { referenceOnly: true }
				: {}
			: { referenceOnly: reportReferenceOnly }),
		success: [reportItem],
	};
	await Promise.all([
		writeFile(join(batchRoot, "manifest.json"), JSON.stringify(manifest)),
		writeFile(join(batchRoot, "report.json"), JSON.stringify(report)),
	]);
	return { assetPath, batchId, batchRoot, rootPath };
}

afterEach(async () => {
	clearLocalReferenceDiscoveryCache();
	const roots = temporaryRoots.splice(0);
	await Promise.all(roots.map((rootPath) => rm(rootPath, { recursive: true })));
});

describe("local Sticker Lab reference service", () => {
	it("normalizes the legacy first-batch manifest and report", async () => {
		const fixture = await writeFixture({
			reportFrameRate: 25,
			reportPosition: 3,
			reportVersion: 1,
			withLegacyReportFields: true,
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.warnings).toEqual([]);
		expect(discovery.summary).toEqual({
			batchCount: 1,
			categoryCount: 1,
			itemCount: 1,
			totalBytes: PNG_BYTES.byteLength,
		});
		expect(discovery.catalogs[0]).toMatchObject({
			version: 1,
			batchId: fixture.batchId,
			referenceOnly: true,
			itemCount: 1,
		});
		expect(discovery.catalogs[0]?.categories[0]?.items[0]?.asset).toEqual({
			kind: "local-reference",
			rootPath: fixture.rootPath,
			batchId: fixture.batchId,
			stickerId: "123",
			byteSize: PNG_BYTES.byteLength,
			checksumSha256: checksum({ bytes: PNG_BYTES }),
		});
	});

	it("reads PNG and GIF assets only after verifying bytes", async () => {
		const pngFixture = await writeFixture({ id: "123" });
		const gifFixture = await writeFixture({
			batchId: "jianying-2026-08-01-batch-2",
			bytes: GIF_BYTES,
			id: "456",
			mimeType: "image/gif",
		});

		const [png, gif] = await Promise.all([
			readLocalReference({
				rootPath: pngFixture.rootPath,
				batchId: pngFixture.batchId,
				stickerId: "123",
			}),
			readLocalReference({
				rootPath: gifFixture.rootPath,
				batchId: gifFixture.batchId,
				stickerId: "456",
			}),
		]);

		expect(Array.from(png.bytes)).toEqual(Array.from(PNG_BYTES));
		expect(png.mimeType).toBe("image/png");
		expect(Array.from(gif.bytes)).toEqual(Array.from(GIF_BYTES));
		expect(gif.mimeType).toBe("image/gif");
	});

	it("does not hash asset content during discovery", async () => {
		const fixture = await writeFixture({
			bytes: new TextEncoder().encode("not-a-png"),
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.summary.itemCount).toBe(1);
		await expect(
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "123",
			})
		).rejects.toThrow("magic does not match MIME type");
	});

	it("fails the verified read when the report checksum is wrong", async () => {
		const fixture = await writeFixture({ reportSha256: "a".repeat(64) });
		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});
		expect(discovery.summary.itemCount).toBe(1);

		await expect(
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "123",
			})
		).rejects.toThrow("SHA-256 mismatch");
	});

	it("keeps verification metadata isolated from returned catalogs", async () => {
		const fixture = await writeFixture();
		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});
		const reference = discovery.catalogs[0]?.categories[0]?.items[0];
		if (!reference) throw new Error("Fixture reference is missing");
		reference.asset.checksumSha256 = "a".repeat(64);

		const result = await readLocalReference({
			rootPath: fixture.rootPath,
			batchId: fixture.batchId,
			stickerId: reference.id,
		});

		expect(result.checksumSha256).toBe(checksum({ bytes: PNG_BYTES }));
	});

	it("rejects an explicit non-reference manifest or report", async () => {
		const manifestFixture = await writeFixture({
			manifestReferenceOnly: false,
		});
		const reportFixture = await writeFixture({ reportReferenceOnly: false });

		const [manifestDiscovery, reportDiscovery] = await Promise.all([
			discoverLocalReferences({ rootPath: manifestFixture.rootPath }),
			discoverLocalReferences({ rootPath: reportFixture.rootPath }),
		]);

		expect(manifestDiscovery.summary.itemCount).toBe(0);
		expect(manifestDiscovery.warnings[0]?.batchId).toBe(
			manifestFixture.batchId
		);
		expect(reportDiscovery.summary.itemCount).toBe(0);
		expect(reportDiscovery.warnings[0]?.batchId).toBe(reportFixture.batchId);
	});

	it("rejects URL-bearing report metadata", async () => {
		const fixture = await writeFixture({
			reportRemoteUrl: "https://example.com/sticker.png",
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.summary.itemCount).toBe(0);
		expect(discovery.warnings[0]?.message).toContain("URL field is forbidden");
	});

	it("rejects duplicate asset checksums across batches", async () => {
		const rootPath = await createTemporaryRoot();
		await writeFixture({ fixtureRootPath: rootPath });
		await writeFixture({
			batchId: "jianying-2026-08-01-batch-2",
			fixtureRootPath: rootPath,
			id: "456",
		});

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.summary.batchCount).toBe(1);
		expect(discovery.warnings[0]?.message).toContain(
			"Duplicate sticker checksum across batches"
		);
	});

	it("rejects an asset path outside its batch", async () => {
		const outsideRoot = await createTemporaryRoot();
		const outsidePath = join(outsideRoot, "123.png");
		await writeFile(outsidePath, PNG_BYTES);
		const fixture = await writeFixture({ filePath: outsidePath });

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.summary.itemCount).toBe(0);
		expect(discovery.warnings[0]?.message).toContain("escapes its batch");
	});

	it.runIf(process.platform !== "win32")(
		"rejects symlinked sticker assets",
		async () => {
			const fixture = await writeFixture();
			const realAssetPath = join(fixture.batchRoot, "assets", "real.png");
			await writeFile(realAssetPath, PNG_BYTES);
			await rm(fixture.assetPath);
			await symlink(realAssetPath, fixture.assetPath);

			const discovery = await discoverLocalReferences({
				rootPath: fixture.rootPath,
			});

			expect(discovery.summary.itemCount).toBe(0);
			expect(discovery.warnings[0]?.message).toContain("symlinks");
		}
	);

	it("returns a warning instead of throwing for a missing root", async () => {
		const rootPath = join(await createTemporaryRoot(), "missing");

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.rootPath).toBe(rootPath);
		expect(discovery.catalogs).toEqual([]);
		expect(discovery.warnings).toHaveLength(1);
	});
});
