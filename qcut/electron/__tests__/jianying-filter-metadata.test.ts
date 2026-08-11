// @vitest-environment node
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
	findJianyingFilterTitle,
	resolveJianyingFilterTitles,
} from "../jianying-filter-metadata";
import type { JianyingLutReference } from "../native-pipeline/filters/filter-lab-lut";

function createReference({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}): JianyingLutReference {
	return {
		lutId: `${resourceId}/${version}/filter.cube.vf`,
		resourceId,
		version,
		fileName: "filter.cube.vf",
		filePath: "/private/filter.cube.vf",
		role: "single",
		size: 16,
	};
}

describe("Jianying filter metadata", () => {
	it("maps an exact cached resource version to its local Chinese title", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-filter-metadata-"));
		const databaseDirectory = join(root, "catalog-a");
		const databasePath = join(databaseDirectory, "rp.db");
		const resourceId = "7429744855724641545";
		const version = "f4d46cb5bca43ef171199ea673d53b00";
		await mkdir(databaseDirectory, { recursive: true });
		const database = new DatabaseSync(databasePath);
		try {
			database.exec(
				"CREATE TABLE http_cache (response_body TEXT); CREATE TABLE effect (id TEXT, title TEXT, name TEXT, md5 TEXT);"
			);
			const response = JSON.stringify({
				data: {
					effect_item_list: [
						{
							common_attr: {
								id: resourceId,
								title: "高清黑白",
								md5: version,
							},
						},
					],
				},
			});
			database
				.prepare("INSERT INTO http_cache (response_body) VALUES (?)")
				.run(response);
		} finally {
			database.close();
		}

		try {
			const reference = createReference({ resourceId, version });
			const titles = await resolveJianyingFilterTitles({
				references: [reference],
				databaseRoot: root,
			});
			expect(findJianyingFilterTitle({ reference, titles })).toBe("高清黑白");
			expect(titles.size).toBe(1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
