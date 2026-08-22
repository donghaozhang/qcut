// @vitest-environment node
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
	listJianyingFlowerCatalogPackageReferences,
	resolveJianyingFlowerCatalogMetadata,
	resolveJianyingFlowerResourceMetadata,
} from "../jianying-flower-resource-metadata.js";

const temporaryDirectories: string[] = [];

async function createDatabaseRoot() {
	const root = await mkdtemp(join(tmpdir(), "qcut-flower-metadata-"));
	temporaryDirectories.push(root);
	const accountDirectory = join(root, "account-one");
	await mkdir(accountDirectory, { recursive: true });
	const database = new DatabaseSync(join(accountDirectory, "rp.db"));
	database.exec(`
		CREATE TABLE http_cache (
			url TEXT NOT NULL,
			response_body TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		)
	`);
	return { database, root };
}

function flowerResponse({
	categoryIds,
	downloadUrls = [],
	resourceId,
	title,
	version,
}: {
	categoryIds: number[];
	downloadUrls?: string[];
	resourceId: string;
	title: string;
	version: string;
}) {
	return JSON.stringify({
		data: {
			effect_item_list: [
				{
					common_attr: {
						id: resourceId,
						title,
						md5: version,
						item_urls: downloadUrls,
						category_ids: categoryIds,
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

describe("Jianying flower resource metadata", () => {
	it("lists the newest package identity for every cached flower card", async () => {
		const { database, root } = await createDatabaseRoot();
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			flowerResponse({
				categoryIds: [10721],
				downloadUrls: ["https://example.test/new.zip"],
				resourceId: "7405879107424111910",
				title: "新版花字",
				version: "b".repeat(32),
			}),
			2
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			flowerResponse({
				categoryIds: [10721],
				downloadUrls: ["https://example.test/backup.zip"],
				resourceId: "7405879107424111910",
				title: "新版花字备用地址",
				version: "b".repeat(32),
			}),
			2
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			flowerResponse({
				categoryIds: [10721],
				resourceId: "7405879107424111910",
				title: "旧版花字",
				version: "a".repeat(32),
			}),
			1
		);
		database.close();

		await expect(
			listJianyingFlowerCatalogPackageReferences({ databaseRoot: root })
		).resolves.toEqual([
			{
				resourceId: "7405879107424111910",
				packageHash: "b".repeat(32),
				title: "新版花字",
				downloadUrls: [
					"https://example.test/new.zip",
					"https://example.test/backup.zip",
				],
				timestamp: "2",
			},
		]);
	});

	it("keeps exact 64-bit identities and merges only flower categories", async () => {
		const { database, root } = await createDatabaseRoot();
		const resourceId = "7405879107424111910";
		const version = "a".repeat(32);
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			flowerResponse({
				categoryIds: [10721, 10727],
				resourceId,
				title: "黄色花字",
				version,
			}),
			2
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			flowerResponse({
				categoryIds: [10729],
				resourceId,
				title: "旧标题",
				version,
			}),
			1
		);
		insert.run(
			"https://example.test/filter",
			flowerResponse({
				categoryIds: [11886],
				resourceId,
				title: "不应读取",
				version,
			}),
			3
		);
		database.close();

		const metadata = await resolveJianyingFlowerResourceMetadata({
			databaseRoot: root,
			references: [{ resourceId, version }],
		});
		expect(metadata.get(`${resourceId}/${version}`)).toEqual({
			title: "黄色花字",
			categoryIds: ["popular", "glow", "yellow"],
		});
	});

	it("reads every category and parent group from the current flower panel", async () => {
		const { database, root } = await createDatabaseRoot();
		const resourceId = "7405879107424111911";
		const version = "b".repeat(32);
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			flowerResponse({
				categoryIds: [10721, 99999],
				resourceId,
				title: "动态分类花字",
				version,
			}),
			1
		);
		insert.run(
			"https://example.test/get_panel_info",
			JSON.stringify({
				data: {
					categories: [
						{
							category_id: 80000,
							category_name: "动态分组",
							sub_categories: [
								{ category_id: 10721, category_name: "实时热门" },
								{ category_id: 99999, category_name: "新增分类" },
							],
						},
					],
				},
			}),
			2
		);
		database.close();

		const catalog = await resolveJianyingFlowerCatalogMetadata({
			databaseRoot: root,
			references: [{ resourceId, version }],
		});
		expect(catalog.categories).toEqual([
			expect.objectContaining({
				id: "popular",
				label: "实时热门",
				groupId: "panel-80000",
			}),
			expect.objectContaining({
				id: "source-99999",
				label: "新增分类",
				groupId: "panel-80000",
			}),
		]);
		expect(catalog.categoryGroups).toEqual([
			expect.objectContaining({
				id: "panel-80000",
				label: "动态分组",
				categoryIds: ["popular", "source-99999"],
			}),
		]);
		expect(
			catalog.metadata.get(`${resourceId}/${version}`)?.categoryIds
		).toEqual(["popular", "source-99999"]);
	});
});
