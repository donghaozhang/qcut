// @vitest-environment node
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { JianyingTextStyleCatalogEntry } from "../jianying-text-style-lab-catalog.js";
import {
	attachJianyingTextStyleCoverUrls,
	resolveJianyingTextStyleCoverUrls,
} from "../jianying-text-style-cover-metadata.js";

const temporaryDirectories: string[] = [];

async function createDatabaseRoot() {
	const root = await mkdtemp(join(tmpdir(), "qcut-text-cover-metadata-"));
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

function catalogEntry({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	return {
		styleId: `${resourceId}/${version}`,
		resourceId,
		version,
		hasCover: false,
	} as JianyingTextStyleCatalogEntry;
}

function catalogResponse({
	coverUrl,
	resourceId,
	version,
}: {
	coverUrl: string;
	resourceId: string;
	version: string;
}) {
	return JSON.stringify({
		data: {
			items: [
				{
					common_attr: {
						id: resourceId,
						md5: version,
						cover_url: { static_img: coverUrl },
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

describe("Jianying text style cover metadata", () => {
	it("resolves the newest trusted static cover for an exact package", async () => {
		const { database, root } = await createDatabaseRoot();
		const resourceId = "7212166583127379258";
		const version = "a".repeat(32);
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"https://example.test/text-template",
			catalogResponse({
				coverUrl: "https://p3-heycan-jy-sign.byteimg.com/new.png?token=2",
				resourceId,
				version,
			}),
			2
		);
		insert.run(
			"https://example.test/text-template",
			catalogResponse({
				coverUrl: "https://p3-heycan-jy-sign.byteimg.com/old.png?token=1",
				resourceId,
				version,
			}),
			1
		);
		insert.run(
			"https://example.test/text-template",
			catalogResponse({
				coverUrl: "https://example.com/untrusted.png",
				resourceId: "7212166583127379259",
				version: "b".repeat(32),
			}),
			3
		);
		database.close();

		const covers = await resolveJianyingTextStyleCoverUrls({
			databaseRoot: root,
			references: [
				catalogEntry({ resourceId, version }),
				catalogEntry({
					resourceId: "7212166583127379259",
					version: "b".repeat(32),
				}),
			],
		});

		expect([...covers]).toEqual([
			[
				`${resourceId}/${version}`,
				"https://p3-heycan-jy-sign.byteimg.com/new.png?token=2",
			],
		]);
	});

	it("attaches covers without replacing titles or categories", () => {
		const styleId = `7212166583127379258/${"a".repeat(32)}`;
		const metadata = attachJianyingTextStyleCoverUrls({
			coverUrls: new Map([
				[styleId, "https://p3-heycan-jy-sign.byteimg.com/cover.png"],
			]),
			metadata: new Map([
				[
					styleId,
					{ title: "脚本模板", categoryIds: ["source-qcut-script-template"] },
				],
			]),
		});

		expect(metadata.get(styleId)).toEqual({
			title: "脚本模板",
			categoryIds: ["source-qcut-script-template"],
			coverUrl: "https://p3-heycan-jy-sign.byteimg.com/cover.png",
		});
	});
});
