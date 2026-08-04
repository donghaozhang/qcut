import {
	chmod,
	mkdir,
	readFile,
	realpath,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { MAX_PRIVATE_STICKER_CATALOG_BYTES } from "@qcut/editor-core/sticker-lab";
import { afterEach, describe, expect, it } from "vitest";
import {
	findNearestGitRepositoryRoot,
	parsePrivateCatalogCliArguments,
	writePreparedManifest,
} from "../sticker-lab-private-catalog/cli";
import { preparePrivateStickerCatalog } from "../sticker-lab-private-catalog";
import type { PrivateStickerManifest } from "../sticker-lab-private-catalog/types";
import {
	cleanupTemporaryDirectories,
	createAgainstManifestPaths,
	createStickerCatalogFixture,
	GIF_BYTES,
	makeTemporaryDirectory,
	prepareStickerCatalogFixture,
	rewriteStickerCatalogFixture,
} from "./sticker-lab-private-catalog.test-utils";

afterEach(cleanupTemporaryDirectories);

describe("private sticker catalog preparation", () => {
	it("builds the registered private v2 shape without local paths or provenance", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });

		expect(prepared.manifest).toMatchObject({
			version: 2,
			catalogId: "jianying-2026-08-01-batch-2",
		});
		const item = prepared.manifest.categories[0]?.items[0];
		expect(item?.asset).toEqual({
			kind: "supabase-storage",
			objectKey: "jianying/2026-08-01-batch-2/assets/7001.gif",
			byteSize: GIF_BYTES.byteLength,
			checksumSha256: fixture.checksumSha256,
		});
		expect(JSON.stringify(prepared.manifest)).not.toContain(fixture.root);
		expect(prepared.manifest).not.toHaveProperty("provenance");
		expect(prepared.summary).toMatchObject({
			againstCatalogCount: 1,
			categoryCount: 1,
			itemCount: 1,
		});
	});

	it("rejects catalog IDs outside the shared registry", async () => {
		const fixture = await createStickerCatalogFixture();
		await expect(
			preparePrivateStickerCatalog({
				catalogId: "jianying-2026-08-01-batch-99",
				manifestPath: fixture.manifestPath,
				reportPath: fixture.reportPath,
			})
		).rejects.toThrow("Unknown private sticker catalogId");
	});

	it.each([
		["wrong hash", "sha256", "0".repeat(64), "SHA-256 mismatch"],
		["wrong size", "byteSize", GIF_BYTES.byteLength + 1, "byte size mismatch"],
	])("rejects %s", async (_name, field, value, expectedError) => {
		const fixture = await createStickerCatalogFixture();
		const success = (
			fixture.report.success as Array<Record<string, unknown>>
		)[0];
		if (!success) throw new Error("Missing fixture success item");
		success[field] = value;
		await rewriteStickerCatalogFixture({ fixture });
		await expect(prepareStickerCatalogFixture({ fixture })).rejects.toThrow(
			expectedError
		);
	});

	it("rejects manifest/report metadata drift and URL-bearing input", async () => {
		const fixture = await createStickerCatalogFixture();
		const success = (
			fixture.report.success as Array<Record<string, unknown>>
		)[0];
		if (!success) throw new Error("Missing fixture success item");
		success.category = "错误分类";
		fixture.report.previewUrl = "https://example.invalid/signed?token=secret";
		await rewriteStickerCatalogFixture({ fixture });
		await expect(prepareStickerCatalogFixture({ fixture })).rejects.toThrow(
			"URL field is forbidden"
		);
		fixture.report = Object.fromEntries(
			Object.entries(fixture.report).filter(([key]) => key !== "previewUrl")
		);
		await rewriteStickerCatalogFixture({ fixture });
		await expect(prepareStickerCatalogFixture({ fixture })).rejects.toThrow(
			"Manifest/report metadata mismatch"
		);
	});

	it("rejects paths outside the batch and symlinked assets", async () => {
		const fixture = await createStickerCatalogFixture();
		const outsideDirectory = await makeTemporaryDirectory();
		const outsidePath = join(outsideDirectory, "outside.gif");
		await writeFile(outsidePath, GIF_BYTES);
		const manifestItem = (
			(fixture.manifest.categories as Array<Record<string, unknown>>)[0]
				?.items as Array<Record<string, unknown>>
		)[0];
		const reportItem = (
			fixture.report.success as Array<Record<string, unknown>>
		)[0];
		if (!(manifestItem && reportItem)) throw new Error("Missing fixture item");
		manifestItem.filePath = outsidePath;
		manifestItem.fileName = basename(outsidePath);
		reportItem.filePath = outsidePath;
		await rewriteStickerCatalogFixture({ fixture });
		await expect(prepareStickerCatalogFixture({ fixture })).rejects.toThrow(
			"escapes its batch"
		);

		const symlinkPath = join(fixture.root, "preview-gifs", "linked.gif");
		await symlink(outsidePath, symlinkPath);
		manifestItem.filePath = symlinkPath;
		manifestItem.fileName = basename(symlinkPath);
		reportItem.filePath = symlinkPath;
		await rewriteStickerCatalogFixture({ fixture });
		await expect(prepareStickerCatalogFixture({ fixture })).rejects.toThrow(
			"must not contain symlinks"
		);
	});

	it("checks IDs and checksums against other private catalogs without merging", async () => {
		const fixture = await createStickerCatalogFixture();
		const againstPath = join(fixture.root, "against.json");
		const againstManifest: PrivateStickerManifest = {
			version: 2,
			catalogId: "jianying-2026-07-31",
			categories: [
				{
					id: "10515",
					label: "热门",
					sourcePanel: "source",
					items: [
						{
							id: "7001",
							displayName: "old",
							fileName: "7001.gif",
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
								objectKey: "jianying/2026-07-31/assets/7001.gif",
								byteSize: 1,
								checksumSha256: "1".repeat(64),
							},
						},
					],
				},
			],
		};
		await writeFile(againstPath, JSON.stringify(againstManifest));
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				againstManifestPaths: [againstPath],
			})
		).rejects.toThrow("Sticker id conflicts");

		againstManifest.categories[0]!.items[0]!.id = "9001";
		againstManifest.categories[0]!.items[0]!.fileName = "9001.gif";
		againstManifest.categories[0]!.items[0]!.asset.objectKey =
			"jianying/2026-07-31/assets/9001.gif";
		againstManifest.categories[0]!.items[0]!.asset.checksumSha256 =
			fixture.checksumSha256;
		await writeFile(againstPath, JSON.stringify(againstManifest));
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				againstManifestPaths: [againstPath],
			})
		).rejects.toThrow("Asset checksum conflicts");
	});

	it("requires exactly every preceding catalog and rejects current or duplicate inputs", async () => {
		const fixture = await createStickerCatalogFixture();
		await expect(
			prepareStickerCatalogFixture({ fixture, againstManifestPaths: [] })
		).rejects.toThrow("missing: jianying-2026-07-31");

		const batch3AgainstPaths = await createAgainstManifestPaths({
			catalogId: "jianying-2026-08-01-batch-3",
			fixture,
		});
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				catalogId: "jianying-2026-08-01-batch-3",
				againstManifestPaths: [batch3AgainstPaths[0] as string],
			})
		).rejects.toThrow("missing: jianying-2026-08-01-batch-2");
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				againstManifestPaths: [batch3AgainstPaths[1] as string],
			})
		).rejects.toThrow("must precede");
		const futureManifest = JSON.parse(
			await readFile(batch3AgainstPaths[1] as string, "utf8")
		) as PrivateStickerManifest;
		futureManifest.catalogId = "jianying-2026-08-01-batch-3";
		futureManifest.categories[0]!.items[0]!.asset.objectKey =
			"jianying/2026-08-01-batch-3/assets/6002.gif";
		const futureManifestPath = join(fixture.root, "against-future.json");
		await writeFile(futureManifestPath, JSON.stringify(futureManifest));
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				againstManifestPaths: [futureManifestPath],
			})
		).rejects.toThrow("must precede");
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				againstManifestPaths: [
					batch3AgainstPaths[0] as string,
					batch3AgainstPaths[0] as string,
				],
			})
		).rejects.toThrow("Duplicate against catalogId");

		await expect(
			prepareStickerCatalogFixture({
				fixture,
				catalogId: "jianying-2026-08-01-batch-3",
				againstManifestPaths: batch3AgainstPaths,
			})
		).resolves.toMatchObject({
			summary: { againstCatalogCount: 2 },
		});
	});

	it("allows the first catalog without against manifests", async () => {
		const fixture = await createStickerCatalogFixture();
		await expect(
			prepareStickerCatalogFixture({
				fixture,
				catalogId: "jianying-2026-07-31",
				againstManifestPaths: [],
			})
		).resolves.toMatchObject({
			summary: { againstCatalogCount: 0 },
		});
	});

	it("requires identical ordered category IDs and labels across catalogs", async () => {
		const fixture = await createStickerCatalogFixture();
		const [againstPath] = await createAgainstManifestPaths({
			catalogId: "jianying-2026-08-01-batch-2",
			fixture,
		});
		const againstManifest = JSON.parse(
			await readFile(againstPath as string, "utf8")
		) as PrivateStickerManifest;
		againstManifest.categories[0]!.label = "different label";
		await writeFile(againstPath as string, JSON.stringify(againstManifest));

		await expect(
			prepareStickerCatalogFixture({
				fixture,
				againstManifestPaths: [againstPath as string],
			})
		).rejects.toThrow("Category topology mismatch");
	});

	it("checks conflicts between preceding catalogs, not only the current batch", async () => {
		const fixture = await createStickerCatalogFixture();
		const againstPaths = await createAgainstManifestPaths({
			catalogId: "jianying-2026-08-01-batch-3",
			fixture,
		});
		const firstManifest = JSON.parse(
			await readFile(againstPaths[0] as string, "utf8")
		) as PrivateStickerManifest;
		const secondManifest = JSON.parse(
			await readFile(againstPaths[1] as string, "utf8")
		) as PrivateStickerManifest;
		secondManifest.categories[0]!.items[0]!.id =
			firstManifest.categories[0]!.items[0]!.id;
		secondManifest.categories[0]!.items[0]!.fileName = "6001.gif";
		secondManifest.categories[0]!.items[0]!.asset.objectKey =
			"jianying/2026-08-01-batch-2/assets/6001.gif";
		await writeFile(againstPaths[1] as string, JSON.stringify(secondManifest));

		await expect(
			prepareStickerCatalogFixture({
				fixture,
				catalogId: "jianying-2026-08-01-batch-3",
				againstManifestPaths: againstPaths,
			})
		).rejects.toThrow("Sticker id conflicts across private catalogs");
	});

	it("does not allow a caller to relax the shared catalog byte ceiling", async () => {
		const fixture = await createStickerCatalogFixture();
		await expect(
			preparePrivateStickerCatalog({
				catalogId: "jianying-2026-08-01-batch-2",
				manifestPath: fixture.manifestPath,
				maxCatalogBytes: MAX_PRIVATE_STICKER_CATALOG_BYTES + 1,
				reportPath: fixture.reportPath,
			})
		).rejects.toThrow("maxCatalogBytes cannot exceed");
	});
});

describe("private manifest output", () => {
	it("finds an outer worktree .git file and rejects output anywhere inside it", async () => {
		const repositoryRoot = await makeTemporaryDirectory();
		await writeFile(join(repositoryRoot, ".git"), "gitdir: elsewhere\n");
		const nestedDirectory = join(repositoryRoot, "qcut", "scripts", "nested");
		await mkdir(nestedDirectory, { recursive: true });
		const discoveredRoot = await findNearestGitRepositoryRoot({
			startPath: nestedDirectory,
		});
		expect(discoveredRoot).toBe(await realpath(repositoryRoot));

		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		await expect(
			writePreparedManifest({
				outputPath: join(repositoryRoot, "qcut", "private.json"),
				prepared,
				replaceOutput: false,
				repositoryRoot: discoveredRoot,
			})
		).rejects.toThrow("outside the Git repository");
	});

	it("prefers the nearest .git directory and rejects paths without a repository", async () => {
		const outerRoot = await makeTemporaryDirectory();
		await writeFile(join(outerRoot, ".git"), "gitdir: elsewhere\n");
		const nestedRoot = join(outerRoot, "nested");
		const startPath = join(nestedRoot, "src", "deep");
		await mkdir(join(nestedRoot, ".git"), { recursive: true });
		await mkdir(startPath, { recursive: true });
		await expect(findNearestGitRepositoryRoot({ startPath })).resolves.toBe(
			await realpath(nestedRoot)
		);

		const noRepository = await makeTemporaryDirectory();
		await expect(
			findNearestGitRepositoryRoot({ startPath: noRepository })
		).rejects.toThrow("No Git repository found");
	});

	it("stays outside Git, is idempotent, and tightens identical-file permissions", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const repositoryRoot = await makeTemporaryDirectory();
		const outputRoot = await makeTemporaryDirectory();
		const outputPath = join(outputRoot, "manifest.json");
		await writePreparedManifest({
			outputPath,
			prepared,
			replaceOutput: false,
			repositoryRoot,
		});
		expect(
			Buffer.from(await readFile(outputPath)).equals(
				Buffer.from(prepared.manifestBytes)
			)
		).toBe(true);
		await chmod(outputPath, 0o644);
		await writePreparedManifest({
			outputPath,
			prepared,
			replaceOutput: false,
			repositoryRoot,
		});
		expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
		await expect(
			writePreparedManifest({
				outputPath: join(repositoryRoot, "private.json"),
				prepared,
				replaceOutput: false,
				repositoryRoot,
			})
		).rejects.toThrow("outside the Git repository");
	});

	it("requires explicit replacement for different output bytes", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const repositoryRoot = await makeTemporaryDirectory();
		const outputRoot = await makeTemporaryDirectory();
		const outputPath = join(outputRoot, "manifest.json");
		await writeFile(outputPath, "different");
		await expect(
			writePreparedManifest({
				outputPath,
				prepared,
				replaceOutput: false,
				repositoryRoot,
			})
		).rejects.toThrow("--replace-output");
	});
});

describe("private catalog CLI arguments", () => {
	it("defaults to dry-run and requires explicit publish options", () => {
		const options = parsePrivateCatalogCliArguments({
			argv: [
				"--catalog-id",
				"jianying-2026-08-01-batch-2",
				"--manifest",
				"manifest.json",
				"--report",
				"report.json",
			],
		});
		expect(options.mode).toBe("dry-run");
		expect(options.replaceManifest).toBe(false);
		expect(() =>
			parsePrivateCatalogCliArguments({
				argv: [
					"--catalog-id",
					"jianying-2026-08-01-batch-2",
					"--manifest",
					"manifest.json",
					"--report",
					"report.json",
					"--publish",
				],
			})
		).toThrow("--output is required");
	});

	it("allows --max-catalog-bytes to tighten but never relax the shared ceiling", () => {
		const baseArguments = [
			"--catalog-id",
			"jianying-2026-08-01-batch-2",
			"--manifest",
			"manifest.json",
			"--report",
			"report.json",
		];
		expect(
			parsePrivateCatalogCliArguments({
				argv: [...baseArguments, "--max-catalog-bytes", "1024"],
			}).maxCatalogBytes
		).toBe(1024);
		expect(() =>
			parsePrivateCatalogCliArguments({
				argv: [
					...baseArguments,
					"--max-catalog-bytes",
					String(MAX_PRIVATE_STICKER_CATALOG_BYTES + 1),
				],
			})
		).toThrow("--max-catalog-bytes cannot exceed");
	});
});
