// @vitest-environment node
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
	findJianyingResourceTitle,
	resolveJianyingResourceTitles,
} from "../jianying-resource-titles.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
	const directory = await mkdtemp(join(tmpdir(), "qcut-jianying-titles-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying resource titles", () => {
	it("resolves exact resource and version titles from local HTTP metadata", async () => {
		const databaseRoot = await createTemporaryDirectory();
		const accountDirectory = join(databaseRoot, "account");
		await mkdir(accountDirectory, { recursive: true });
		const database = new DatabaseSync(join(accountDirectory, "rp.db"));
		database.exec(`
			CREATE TABLE http_cache (
				id INTEGER PRIMARY KEY,
				url TEXT NOT NULL,
				response_body TEXT NOT NULL
			)
		`);
		const body = JSON.stringify({
			data: {
				effect_item_list: [
					{
						common_attr: {
							id: "7405879107424111910",
							md5: "a".repeat(32),
							title: "黄色花字",
						},
					},
				],
			},
		});
		database
			.prepare(
				"INSERT INTO http_cache (id, url, response_body) VALUES (?, ?, ?)"
			)
			.run(1, "/artist/flower", body);
		database.close();

		const reference = {
			resourceId: "7405879107424111910",
			version: "a".repeat(32),
		};
		const titles = await resolveJianyingResourceTitles({
			references: [reference],
			databaseRoot,
		});
		expect(findJianyingResourceTitle({ reference, titles })).toBe("黄色花字");
	});
});
