// @vitest-environment node
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isTrustedJianyingResourceUrl,
	recoverJianyingTextResource,
	recoverJianyingTextResources,
	validateJianyingRecoveryArchiveEntry,
} from "../jianying-text-runtime/resource-recovery.js";

const temporaryDirectories: string[] = [];

async function createRecoveryFixture({
	archive,
	catalogResourceId = "6897084405781631496",
	resourceId = "6897084405781631496",
}: {
	archive: Buffer;
	catalogResourceId?: string;
	resourceId?: string;
}) {
	const root = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-resource-recovery-")
	);
	temporaryDirectories.push(root);
	const databaseRoot = path.join(root, "ressdk_db");
	const accountRoot = path.join(databaseRoot, "account");
	await mkdir(accountRoot, { recursive: true });
	const database = new DatabaseSync(path.join(accountRoot, "rp.db"));
	database.exec(`
		CREATE TABLE http_cache (
			url TEXT NOT NULL,
			response_body TEXT NOT NULL,
			timestamp TEXT NOT NULL
		)
	`);
	const packageHash = createHash("md5").update(archive).digest("hex");
	const downloadUrl =
		"https://lf26-faceu-file-sign.bytecdn.com/signed-resource.zip";
	database
		.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		)
		.run(
			"/artist/panel",
			JSON.stringify({
				data: {
					effect_item_list: [
						{
							common_attr: {
								id: catalogResourceId,
								...(catalogResourceId !== resourceId
									? { third_resource_id_str: resourceId }
									: {}),
								md5: packageHash,
								item_urls: [downloadUrl],
							},
						},
					],
				},
			}),
			"2026-08-12 12:00:00"
		);
	database.close();
	return {
		databaseRoot,
		downloadUrl,
		packageHash,
		recoveryRoot: path.join(root, "qcut-recovery"),
		resourceId,
	};
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying text resource recovery", () => {
	it("accepts only HTTPS URLs from known Jianying CDN families", () => {
		expect(
			isTrustedJianyingResourceUrl({
				value: "https://lf26-faceu-file-sign.bytecdn.com/package.zip",
			})
		).toBe(true);
		expect(
			isTrustedJianyingResourceUrl({
				value: "https://p3-artist-file-sign.byteimg.com/package.zip",
			})
		).toBe(true);
		expect(
			isTrustedJianyingResourceUrl({
				value: "http://lf26-faceu-file-sign.bytecdn.com/package.zip",
			})
		).toBe(false);
		expect(
			isTrustedJianyingResourceUrl({
				value: "https://bytecdn.com.attacker.test/package.zip",
			})
		).toBe(false);
	});

	it("rejects traversal, links, and oversized archive entries", () => {
		const state = { entryCount: 0, uncompressedBytes: 0 };
		expect(() =>
			validateJianyingRecoveryArchiveEntry({
				entry: {
					fileName: "../config.json",
					compressedSize: 10,
					uncompressedSize: 10,
					externalFileAttributes: 0,
					versionMadeBy: 0,
				},
				state,
			})
		).toThrow("unsafe path");
		expect(() =>
			validateJianyingRecoveryArchiveEntry({
				entry: {
					fileName: "config.json",
					compressedSize: 10,
					uncompressedSize: 10,
					externalFileAttributes: 0o120777 * 65_536,
					versionMadeBy: 3 << 8,
				},
				state,
			})
		).toThrow("link or device");
		expect(() =>
			validateJianyingRecoveryArchiveEntry({
				entry: {
					fileName: "huge.bin",
					compressedSize: 10,
					uncompressedSize: 129 * 1024 * 1024,
					externalFileAttributes: 0,
					versionMadeBy: 0,
				},
				state,
			})
		).toThrow("too large");
	});

	it("downloads, verifies, and atomically installs into QCut private cache", async () => {
		const archive = Buffer.from("synthetic-jianying-package");
		const fixture = await createRecoveryFixture({ archive });
		const fetchResource = vi.fn(async () => new Response(archive));
		const extractArchive = vi.fn(
			async ({ destination }: { archivePath: string; destination: string }) => {
				await mkdir(destination, { recursive: true });
				await writeFile(
					path.join(destination, "config.json"),
					JSON.stringify({
						effect: { Link: [{ type: "TextAnimation" }] },
					}),
					"utf8"
				);
			}
		);

		const result = await recoverJianyingTextResource({
			resourceId: fixture.resourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			fetchResource,
			extractArchive,
		});

		expect(result).toMatchObject({
			resourceId: fixture.resourceId,
			state: "recovered",
			packageHash: fixture.packageHash,
		});
		expect(fetchResource).toHaveBeenCalledWith(
			fixture.downloadUrl,
			expect.objectContaining({ redirect: "follow" })
		);
		expect(extractArchive).toHaveBeenCalledOnce();
		const packagePath = result.packagePath;
		expect(packagePath).toBeTruthy();
		if (!packagePath) throw new Error("Recovered package path is missing");
		expect(
			JSON.parse(await readFile(path.join(packagePath, "config.json"), "utf8"))
		).toMatchObject({
			effect: { Link: [{ type: "TextAnimation" }] },
		});
		expect((await stat(packagePath)).isDirectory()).toBe(true);

		const cached = await recoverJianyingTextResource({
			resourceId: fixture.resourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			fetchResource,
			extractArchive,
		});
		expect(cached.state).toBe("already-ready");
		expect(fetchResource).toHaveBeenCalledOnce();
	});

	it("does not extract an archive whose bytes fail the catalog MD5", async () => {
		const fixture = await createRecoveryFixture({
			archive: Buffer.from("expected-package"),
		});
		const extractArchive = vi.fn();
		const result = await recoverJianyingTextResource({
			resourceId: fixture.resourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			fetchResource: async () => new Response("tampered-package"),
			extractArchive,
		});

		expect(result).toMatchObject({
			state: "unavailable",
			reason: "hash-mismatch",
		});
		expect(extractArchive).not.toHaveBeenCalled();
	});

	it("repairs an invalid package already occupying the recovery destination", async () => {
		const archive = Buffer.from("replacement-jianying-package");
		const fixture = await createRecoveryFixture({ archive });
		const destination = path.join(
			fixture.recoveryRoot,
			"effect",
			fixture.resourceId,
			fixture.packageHash
		);
		await mkdir(destination, { recursive: true });
		await writeFile(
			path.join(destination, "config.json"),
			JSON.stringify({ effect: { Link: [{ type: "UnrelatedEffect" }] } }),
			"utf8"
		);
		const fetchResource = vi.fn(async () => new Response(archive));
		const extractArchive = vi.fn(
			async ({ destination: extractionRoot }: { destination: string }) => {
				await mkdir(extractionRoot, { recursive: true });
				await writeFile(
					path.join(extractionRoot, "config.json"),
					JSON.stringify({
						effect: { Link: [{ type: "TextAnimation" }] },
					}),
					"utf8"
				);
			}
		);

		const result = await recoverJianyingTextResource({
			resourceId: fixture.resourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			fetchResource,
			extractArchive,
		});

		expect(result.state).toBe("recovered");
		expect(fetchResource).toHaveBeenCalledOnce();
		expect(
			JSON.parse(await readFile(path.join(destination, "config.json"), "utf8"))
		).toMatchObject({ effect: { Link: [{ type: "TextAnimation" }] } });
	});

	it("serializes distinct requests installing the same package", async () => {
		const archive = Buffer.from("concurrent-jianying-package");
		const fixture = await createRecoveryFixture({ archive });
		const fetchResource = vi.fn(async () => new Response(archive));
		const extractArchive = vi.fn(
			async ({ destination }: { destination: string }) => {
				await new Promise((resolve) => setTimeout(resolve, 75));
				await mkdir(destination, { recursive: true });
				await writeFile(
					path.join(destination, "config.json"),
					JSON.stringify({
						effect: { Link: [{ type: "TextAnimation" }] },
					}),
					"utf8"
				);
			}
		);

		const results = await Promise.all([
			recoverJianyingTextResource({
				resourceId: fixture.resourceId,
				role: "animation",
				databaseRoot: fixture.databaseRoot,
				recoveryRoot: fixture.recoveryRoot,
				fetchResource,
				extractArchive,
			}),
			recoverJianyingTextResource({
				resourceId: fixture.resourceId,
				role: "animation",
				expectedPackageHash: fixture.packageHash,
				databaseRoot: fixture.databaseRoot,
				recoveryRoot: fixture.recoveryRoot,
				fetchResource,
				extractArchive,
			}),
		]);

		expect(results.map(({ state }) => state).sort()).toEqual([
			"already-ready",
			"recovered",
		]);
		expect(fetchResource).toHaveBeenCalledOnce();
		expect(extractArchive).toHaveBeenCalledOnce();
	});

	it("installs a current catalog card under its legacy dependency ID", async () => {
		const archive = Buffer.from("aliased-jianying-package");
		const legacyResourceId = "7021831463867781662";
		const fixture = await createRecoveryFixture({
			archive,
			catalogResourceId: "7426685437122497827",
			resourceId: legacyResourceId,
		});
		const extractArchive = vi.fn(
			async ({ destination }: { archivePath: string; destination: string }) => {
				await mkdir(destination, { recursive: true });
				await writeFile(
					path.join(destination, "config.json"),
					JSON.stringify({ effect: { Link: [{ type: "InfoSticker" }] } }),
					"utf8"
				);
			}
		);

		const result = await recoverJianyingTextResource({
			resourceId: legacyResourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			fetchResource: async () => new Response(archive),
			extractArchive,
		});

		const expectedPackagePath = await realpath(
			path.join(
				fixture.recoveryRoot,
				"effect",
				legacyResourceId,
				fixture.packageHash
			)
		);
		expect(result).toMatchObject({
			resourceId: legacyResourceId,
			state: "recovered",
			packageHash: fixture.packageHash,
			packagePath: expectedPackagePath,
		});
	});

	it("relocates an aliased local package so reopened projects survive cache cleanup", async () => {
		const archive = Buffer.from("locally-cached-aliased-package");
		const legacyResourceId = "7021831463867781662";
		const catalogResourceId = "7426685437122497827";
		const fixture = await createRecoveryFixture({
			archive,
			catalogResourceId,
			resourceId: legacyResourceId,
		});
		const sourceCacheRoot = path.join(
			path.dirname(fixture.databaseRoot),
			"Cache"
		);
		const sourcePackagePath = path.join(
			sourceCacheRoot,
			"effect",
			catalogResourceId,
			fixture.packageHash
		);
		await mkdir(sourcePackagePath, { recursive: true });
		await writeFile(
			path.join(sourcePackagePath, "config.json"),
			JSON.stringify({ effect: { Link: [{ type: "InfoSticker" }] } }),
			"utf8"
		);
		const fetchResource = vi.fn(async () => {
			throw new Error("network recovery must not run");
		});

		const recovered = await recoverJianyingTextResource({
			resourceId: legacyResourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			sourceCacheRoots: [sourceCacheRoot],
			fetchResource,
		});

		expect(recovered).toMatchObject({
			resourceId: legacyResourceId,
			state: "recovered",
			packageHash: fixture.packageHash,
		});
		expect(fetchResource).not.toHaveBeenCalled();
		await rm(sourceCacheRoot, { recursive: true, force: true });

		const reopened = await recoverJianyingTextResource({
			resourceId: legacyResourceId,
			role: "animation",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			sourceCacheRoots: [sourceCacheRoot],
			fetchResource,
		});

		expect(reopened.state).toBe("already-ready");
		expect(reopened.packagePath).toBe(recovered.packagePath);
		expect(fetchResource).not.toHaveBeenCalled();
	});

	it("relocates a cached font stored under a legacy ID by matching its package hash", async () => {
		const archive = Buffer.from("catalog-font-package");
		const currentResourceId = "7030677248797577765";
		const fixture = await createRecoveryFixture({
			archive,
			resourceId: currentResourceId,
		});
		const sourceCacheRoot = path.join(
			path.dirname(fixture.databaseRoot),
			"Cache"
		);
		const sourcePackagePath = path.join(
			sourceCacheRoot,
			"effect",
			"1441466",
			fixture.packageHash
		);
		await mkdir(sourcePackagePath, { recursive: true });
		await Promise.all([
			writeFile(
				path.join(sourcePackagePath, "config.json"),
				JSON.stringify({ effect: { Link: [{ type: "InfoSticker" }] } }),
				"utf8"
			),
			writeFile(
				path.join(sourcePackagePath, "GalleryModern.otf"),
				Buffer.from("OTTOsynthetic-font")
			),
		]);
		const fetchResource = vi.fn(async () => {
			throw new Error("network recovery must not run");
		});

		const recovered = await recoverJianyingTextResource({
			resourceId: currentResourceId,
			role: "font",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			sourceCacheRoots: [sourceCacheRoot],
			fetchResource,
		});

		expect(recovered).toMatchObject({
			resourceId: currentResourceId,
			state: "recovered",
			packageHash: fixture.packageHash,
		});
		expect(fetchResource).not.toHaveBeenCalled();
		if (!recovered.packagePath) {
			throw new Error("Recovered font package path is missing");
		}
		expect(
			await readFile(
				path.join(recovered.packagePath, "GalleryModern.otf"),
				"utf8"
			)
		).toBe("OTTOsynthetic-font");
	});

	it("recovers a legacy font from local draft metadata when the catalog card is gone", async () => {
		const fixture = await createRecoveryFixture({
			archive: Buffer.from("unrelated-catalog-package"),
			resourceId: "7999999999999999999",
		});
		const sourceCacheRoot = path.join(
			path.dirname(fixture.databaseRoot),
			"Cache"
		);
		const currentFontId = "7209944750529450553";
		const fontPackageHash = "b9b8c6fb5242b7d8920ad8795d926d5b";
		const fontPackagePath = path.join(
			sourceCacheRoot,
			"effect",
			"10608864",
			fontPackageHash
		);
		const metadataPackagePath = path.join(
			sourceCacheRoot,
			"artistEffect",
			"7212166583127379258",
			"176afb95160716dbb2b6497fa2afd5dd"
		);
		await Promise.all([
			mkdir(fontPackagePath, { recursive: true }),
			mkdir(metadataPackagePath, { recursive: true }),
		]);
		await Promise.all([
			writeFile(
				path.join(fontPackagePath, "config.json"),
				JSON.stringify({ effect: { Link: [{ type: "InfoSticker" }] } }),
				"utf8"
			),
			writeFile(
				path.join(fontPackagePath, "NewYork.otf"),
				Buffer.from("OTTOsynthetic-new-york")
			),
			writeFile(
				path.join(metadataPackagePath, "content.json"),
				JSON.stringify({
					materials: {
						text_templates: [
							{
								resources: [
									{
										panel: "fonts",
										path: `text/${fontPackageHash}/NewYork.otf`,
										resource_id: currentFontId,
									},
								],
							},
						],
					},
				}),
				"utf8"
			),
		]);
		const fetchResource = vi.fn(async () => {
			throw new Error("network recovery must not run");
		});

		const recovered = await recoverJianyingTextResource({
			resourceId: currentFontId,
			role: "font",
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			sourceCacheRoots: [sourceCacheRoot],
			fetchResource,
		});

		expect(recovered).toMatchObject({
			resourceId: currentFontId,
			state: "recovered",
			packageHash: fontPackageHash,
		});
		expect(fetchResource).not.toHaveBeenCalled();
	});

	it("recovers a dependency batch and deduplicates repeated requests", async () => {
		const firstArchive = Buffer.from("first-jianying-package");
		const fixture = await createRecoveryFixture({ archive: firstArchive });
		const secondResourceId = "6774626192990409224";
		const secondArchive = Buffer.from("second-jianying-package");
		const secondPackageHash = createHash("md5")
			.update(secondArchive)
			.digest("hex");
		const secondDownloadUrl =
			"https://lf26-faceu-file-sign.bytecdn.com/second-resource.zip";
		const database = new DatabaseSync(
			path.join(fixture.databaseRoot, "account", "rp.db")
		);
		database
			.prepare(
				"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
			)
			.run(
				"/artist/panel/second",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: secondResourceId,
									md5: secondPackageHash,
									item_urls: [secondDownloadUrl],
								},
							},
						],
					},
				}),
				"2026-08-12 13:00:00"
			);
		database.close();
		const archivesByUrl = new Map([
			[fixture.downloadUrl, firstArchive],
			[secondDownloadUrl, secondArchive],
		]);
		const fetchResource = vi.fn(async (input: string) => {
			const archive = archivesByUrl.get(input);
			if (!archive) return new Response(null, { status: 404 });
			return new Response(archive);
		});
		const extractArchive = vi.fn(
			async ({ destination }: { archivePath: string; destination: string }) => {
				await mkdir(destination, { recursive: true });
				await writeFile(
					path.join(destination, "config.json"),
					JSON.stringify({
						effect: { Link: [{ type: "TextAnimation" }] },
					}),
					"utf8"
				);
			}
		);

		const results = await recoverJianyingTextResources({
			databaseRoot: fixture.databaseRoot,
			recoveryRoot: fixture.recoveryRoot,
			fetchResource,
			extractArchive,
			requests: [
				{ resourceId: fixture.resourceId, role: "animation" },
				{ resourceId: secondResourceId, role: "animation" },
				{ resourceId: fixture.resourceId, role: "animation" },
			],
		});

		expect(results.map(({ state }) => state)).toEqual([
			"recovered",
			"recovered",
			"recovered",
		]);
		expect(results[0]?.packagePath).toBe(results[2]?.packagePath);
		expect(fetchResource).toHaveBeenCalledTimes(2);
	});
});
