// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { verifyQCutJianyingTextCatalogCache } from "../jianying-text-private-catalog-cache.js";
import type { QCutJianyingTextPrivateArchive } from "../jianying-text-private-archive.js";
import { JIANYING_PRIVATE_CATALOG_ARCHIVE_FILE_NAME } from "../jianying-text-runtime/resource-recovery-installer.js";

const temporaryDirectories: string[] = [];

function emptyContainerSummary() {
	return { fileCount: 0, byteCount: 0, latestMtimeMs: 0 };
}

async function createFixture() {
	const archiveRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-private-text-catalog-")
	);
	temporaryDirectories.push(archiveRoot);
	const cacheRoot = path.join(archiveRoot, "Cache");
	const databaseRoot = path.join(cacheRoot, "ressdk_db");
	const accountRoot = path.join(databaseRoot, "account");
	await mkdir(accountRoot, { recursive: true });
	const styleResourceId = "7405879107424111910";
	const styleHash = "a".repeat(32);
	const animationResourceId = "7168819879183651359";
	const animationArchive = Buffer.from("verified-animation-catalog-archive");
	const animationHash = createHash("md5")
		.update(animationArchive)
		.digest("hex");
	const database = new DatabaseSync(path.join(accountRoot, "rp.db"));
	try {
		database.exec(`
			CREATE TABLE http_cache (
				url TEXT NOT NULL,
				response_body TEXT NOT NULL,
				timestamp INTEGER NOT NULL
			)
		`);
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"https://example.test/flower",
			JSON.stringify({
				data: {
					effect_item_list: [
						{
							common_attr: {
								id: styleResourceId,
								md5: styleHash,
								item_urls: ["https://example.test/style.zip"],
							},
						},
					],
				},
			}),
			1
		);
		insert.run(
			"https://example.test/text-animation",
			JSON.stringify({
				data: {
					effect_item_list: [
						{
							common_attr: {
								id: animationResourceId,
								md5: animationHash,
								item_urls: ["https://example.test/animation.zip"],
							},
							text_animation: { animation_type: "loop" },
						},
					],
				},
			}),
			2
		);
	} finally {
		database.close();
	}
	const stylePath = path.join(
		cacheRoot,
		"artistEffect",
		styleResourceId,
		styleHash
	);
	const animationPath = path.join(
		cacheRoot,
		"effect",
		animationResourceId,
		animationHash
	);
	await Promise.all([
		mkdir(stylePath, { recursive: true }),
		mkdir(animationPath, { recursive: true }),
	]);
	await Promise.all([
		writeFile(
			path.join(stylePath, "config.json"),
			JSON.stringify({ effect: { Link: [{ type: "TextStyle" }] } })
		),
		writeFile(
			path.join(animationPath, JIANYING_PRIVATE_CATALOG_ARCHIVE_FILE_NAME),
			animationArchive
		),
	]);
	const archive = {
		archiveRoot,
		cacheRoot,
		packageRoot: path.join(cacheRoot, "artistEffect"),
		animationPackageRoot: path.join(cacheRoot, "effect"),
		databaseRoot,
		recoveryRoot: path.join(cacheRoot, "recovered-resources"),
		projectEvidenceRoot: path.join(cacheRoot, "project-evidence"),
		manifest: {
			schemaVersion: 3,
			completedAt: "2026-08-22T00:00:00.000Z",
			containers: {
				artistEffect: emptyContainerSummary(),
				effect: emptyContainerSummary(),
				ressdk_db: emptyContainerSummary(),
				"recovered-resources": emptyContainerSummary(),
				"project-evidence": emptyContainerSummary(),
			},
		},
	} satisfies QCutJianyingTextPrivateArchive;
	return { animationArchive, animationPath, archive };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("QCut private text catalog verification", () => {
	it("verifies extracted styles and MD5-matched raw animation archives", async () => {
		const { animationPath, archive } = await createFixture();
		const verified = await verifyQCutJianyingTextCatalogCache({ archive });

		expect(verified).toMatchObject({
			complete: true,
			styles: {
				catalogEntries: 1,
				exactDirectories: 1,
				extractedPackages: 1,
				rawArchives: 0,
			},
			animations: {
				catalogEntries: 1,
				exactDirectories: 1,
				extractedPackages: 0,
				rawArchives: 1,
				hashMismatches: 0,
			},
		});

		await writeFile(
			path.join(animationPath, JIANYING_PRIVATE_CATALOG_ARCHIVE_FILE_NAME),
			Buffer.from("tampered-archive")
		);
		const tampered = await verifyQCutJianyingTextCatalogCache({ archive });
		expect(tampered.complete).toBe(false);
		expect(tampered.animations.hashMismatches).toBe(1);
	});

	it("accepts an extracted legacy effectStyle package without config.json", async () => {
		const { archive } = await createFixture();
		const styleRoot = archive.packageRoot;
		const [resourceId] = await import("node:fs/promises").then(({ readdir }) =>
			readdir(styleRoot)
		);
		if (!resourceId) throw new Error("Missing style fixture resource");
		const [packageHash] = await import("node:fs/promises").then(({ readdir }) =>
			readdir(path.join(styleRoot, resourceId))
		);
		if (!packageHash) throw new Error("Missing style fixture package");
		const packagePath = path.join(styleRoot, resourceId, packageHash);
		await rm(path.join(packagePath, "config.json"));
		await writeFile(
			path.join(packagePath, "effectStyle.json"),
			JSON.stringify({ version: "3.0", fill: {} })
		);

		const verified = await verifyQCutJianyingTextCatalogCache({ archive });

		expect(verified.styles).toMatchObject({
			extractedPackages: 1,
			invalid: 0,
		});
	});
});
