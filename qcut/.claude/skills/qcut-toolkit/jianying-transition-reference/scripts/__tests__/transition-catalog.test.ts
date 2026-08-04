import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
	findTransitionCategories,
	findTransitionRecords,
	resolveTransitionDatabasePaths,
	transitionInventory,
} from "../transition-catalog";
import { createTempRoot } from "./test-helpers";

const tempRoots: string[] = [];

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

function transitionItem({
	resourceId,
	metadataMd5,
}: {
	resourceId: string;
	metadataMd5: string;
}) {
	return {
		common_attr: {
			title: "叠化",
			id: resourceId,
			effect_id: "catalog-effect-9001",
			third_resource_id_str: "third-1",
			md5: metadataMd5,
			publish_source: "loki",
			category_ids: ["39862"],
			effect_type: 19,
			sdk_extra: JSON.stringify({
				transition: { defaultDura: 1.5, isOverlap: true },
				setting: {
					lumiai_material_properties: [{ effect_key: "progress" }],
				},
			}),
			extra: JSON.stringify({ transition_type: "mix" }),
			business_info: { json_str: JSON.stringify({ is_vip: false }) },
			business_scope: ["commercial"],
			requirements: ["gpu"],
			status: 1,
		},
		author: { name: "Jianying", uid: "author-1" },
	};
}

function createCatalogFixture() {
	const tempRoot = createTempRoot({ prefix: "jy-transition-catalog-" });
	tempRoots.push(tempRoot);
	const databasePath = path.join(tempRoot, "ressdk_db", "fixture", "rp.db");
	mkdirSync(path.dirname(databasePath), { recursive: true });
	const database = new Database(databasePath, { create: true });
	database.run(
		"CREATE TABLE http_cache (url TEXT, response_body TEXT, timestamp TEXT)"
	);
	const resourceId = "90071992547409931234";
	const insert = database.query(
		"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
	);
	insert.run(
		"https://example.test/v1/transitions_panel",
		JSON.stringify({
			data: {
				categories: [
					{
						category_id: "39862",
						category_name: "叠化",
						category_key: "diehua123",
						category_extra: "{}",
					},
				],
				effect_item_list: [
					transitionItem({ resourceId, metadataMd5: "version-a" }),
				],
			},
		}),
		"2026-08-01 01:00:00"
	);
	insert.run(
		"https://example.test/v1/transitions_category",
		JSON.stringify({
			data: {
				category_resources: {
					"39862": {
						effect_item_list: [
							transitionItem({ resourceId, metadataMd5: "version-b" }),
						],
					},
				},
			},
		}),
		"2026-08-01 02:00:00"
	);
	database.close();
	return { tempRoot, databasePath, resourceId };
}

describe("transition catalog", () => {
	test("preserves 64-bit IDs and cached package versions", () => {
		const fixture = createCatalogFixture();
		const databasePaths = resolveTransitionDatabasePaths({
			cacheRoot: fixture.tempRoot,
		});
		const records = findTransitionRecords({
			databasePaths,
			title: "叠化",
		});
		const categories = findTransitionCategories({ databasePaths });

		expect(databasePaths).toEqual([fixture.databasePath]);
		expect(records).toHaveLength(2);
		expect(records.map((record) => record.resourceId)).toEqual([
			fixture.resourceId,
			fixture.resourceId,
		]);
		expect(records.map((record) => record.metadataMd5)).toEqual([
			"version-a",
			"version-b",
		]);
		expect(records[0]?.catalogEffectId).toBe("catalog-effect-9001");
		expect(records[0]?.defaultDurationSeconds).toBe(1.5);
		expect(records[0]?.isOverlap).toBe(true);
		expect(records[0]?.parameterKeys).toEqual(["progress"]);
		expect(categories.map((category) => category.name)).toEqual(["叠化"]);
		expect(transitionInventory({ records, categories })).toMatchObject({
			categoryCount: 1,
			uniqueResourceVersions: 2,
			uniqueResourceIds: 1,
			missingMetadataMd5: 0,
		});
	});
});
