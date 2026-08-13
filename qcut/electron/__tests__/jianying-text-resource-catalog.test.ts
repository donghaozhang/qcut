// @vitest-environment node
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { findJianyingTextResourceCatalogCandidates } from "../jianying-text-runtime/resource-catalog.js";

const temporaryDirectories: string[] = [];

async function createCatalogDatabase() {
	const root = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-resource-catalog-")
	);
	temporaryDirectories.push(root);
	const accountRoot = path.join(root, "account");
	await mkdir(accountRoot, { recursive: true });
	const database = new DatabaseSync(path.join(accountRoot, "rp.db"));
	database.exec(`
		CREATE TABLE http_cache (
			url TEXT NOT NULL,
			response_body TEXT NOT NULL,
			timestamp TEXT NOT NULL
		)
	`);
	return { database, root };
}

function catalogResponse({
	resourceId,
	packageHash,
	downloadUrl,
	title,
}: {
	resourceId: string;
	packageHash: string;
	downloadUrl: string;
	title: string;
}) {
	return JSON.stringify({
		data: {
			categories: [{ id: "nested-unrelated" }],
			effect_item_list: [
				{
					common_attr: {
						id: resourceId,
						md5: packageHash,
						title,
						item_urls: [downloadUrl],
					},
				},
			],
		},
	});
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying text resource catalog", () => {
	it("finds nested 64-bit resource records and keeps newest versions first", async () => {
		const { database, root } = await createCatalogDatabase();
		const resourceId = "6897084405781631496";
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"/artist/new",
			catalogResponse({
				resourceId,
				packageHash: "b".repeat(32),
				downloadUrl: "https://lf26-faceu-file-sign.bytecdn.com/new-package.zip",
				title: "新版动画",
			}),
			"2026-08-12 12:00:00"
		);
		insert.run(
			"/artist/old",
			catalogResponse({
				resourceId,
				packageHash: "a".repeat(32),
				downloadUrl: "https://lf26-faceu-file-sign.bytecdn.com/old-package.zip",
				title: "旧版动画",
			}),
			"2026-08-11 12:00:00"
		);
		database.close();

		const candidates = await findJianyingTextResourceCatalogCandidates({
			resourceIds: [resourceId],
			databaseRoot: root,
		});

		expect(candidates.get(resourceId)).toEqual([
			{
				resourceId,
				packageHash: "b".repeat(32),
				title: "新版动画",
				downloadUrls: [
					"https://lf26-faceu-file-sign.bytecdn.com/new-package.zip",
				],
				timestamp: "2026-08-12 12:00:00",
			},
			{
				resourceId,
				packageHash: "a".repeat(32),
				title: "旧版动画",
				downloadUrls: [
					"https://lf26-faceu-file-sign.bytecdn.com/old-package.zip",
				],
				timestamp: "2026-08-11 12:00:00",
			},
		]);
	});

	it("ignores malformed resource identities and rows without archives", async () => {
		const { database, root } = await createCatalogDatabase();
		database
			.prepare(
				"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
			)
			.run(
				"/artist/malformed",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: "../outside",
									md5: "not-a-hash",
									item_urls: [],
								},
							},
						],
					},
				}),
				"2026-08-12 12:00:00"
			);
		database.close();

		await expect(
			findJianyingTextResourceCatalogCandidates({
				resourceIds: ["../outside"],
				databaseRoot: root,
			})
		).resolves.toEqual(new Map());
	});

	it("resolves legacy third-resource IDs through current catalog cards", async () => {
		const { database, root } = await createCatalogDatabase();
		const legacyResourceId = "7021831463867781662";
		const catalogResourceId = "7426685437122497827";
		const packageHash = "c".repeat(32);
		const downloadUrl =
			"https://lf26-faceu-file-sign.bytecdn.com/aliased-package.zip";
		database
			.prepare(
				"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
			)
			.run(
				"/artist/aliased",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: catalogResourceId,
									third_resource_id_str: legacyResourceId,
									md5: packageHash,
									title: "随机弹跳",
									item_urls: [downloadUrl],
								},
							},
						],
					},
				}),
				"2026-08-13 12:00:00"
			);
		database.close();

		const candidates = await findJianyingTextResourceCatalogCandidates({
			resourceIds: [legacyResourceId],
			databaseRoot: root,
		});

		expect(candidates.get(legacyResourceId)).toEqual([
			{
				resourceId: legacyResourceId,
				catalogResourceId,
				packageHash,
				title: "随机弹跳",
				downloadUrls: [downloadUrl],
				timestamp: "2026-08-13 12:00:00",
			},
		]);
	});
});
