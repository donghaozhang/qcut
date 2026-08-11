// @vitest-environment node
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { resolveJianyingFlowerResourceMetadata } from "../jianying-flower-resource-metadata.js";

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
	resourceId,
	title,
	version,
}: {
	categoryIds: number[];
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
});
