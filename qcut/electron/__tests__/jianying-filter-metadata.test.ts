// @vitest-environment node
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
	findJianyingFilterCategories,
	findJianyingFilterTitle,
	listJianyingFilterCatalog,
	resolveJianyingFilterCategories,
	resolveJianyingFilterTitles,
	scanJianyingFilterMetadata,
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

	it("resolves filter-panel categories in Jianying's panel order", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-filter-metadata-"));
		const databaseDirectory = join(root, "catalog-a");
		const databasePath = join(databaseDirectory, "rp.db");
		await mkdir(databaseDirectory, { recursive: true });
		const database = new DatabaseSync(databasePath);
		try {
			database.exec(
				"CREATE TABLE http_cache (url TEXT UNIQUE NOT NULL, response_body TEXT NOT NULL);"
			);
			const insert = database.prepare(
				"INSERT INTO http_cache (url, response_body) VALUES (?, ?)"
			);
			// The filter panel: ordered categories plus the embedded first
			// category's resources, exactly like the real cache.
			insert.run(
				"/artist/v1/panel/get_panel_info_AAA__jianyingpro_0_filter_paid_type",
				JSON.stringify({
					data: {
						categories: [
							{ category_id: 5914475, category_name: "🍉夏日" },
							{ category_id: 10494, category_name: "人像" },
							{ category_id: 10496, category_name: "风景" },
						],
						category_resources: {
							"5914475": {
								effect_item_list: [
									{
										common_attr: {
											id: "7100000000000000001",
											category_ids: [5914475, 10496],
										},
									},
								],
							},
						},
					},
				})
			);
			// A text-animation panel that must NOT be picked as the filter panel.
			insert.run(
				"/artist/v1/panel/get_panel_info_BBB__jianyingpro_0_filter_paid_type",
				JSON.stringify({
					data: {
						categories: [
							{ category_id: 10577, category_name: "热门" },
							{ category_id: 10578, category_name: "入场" },
						],
					},
				})
			);
			// A paginated per-category filter listing carrying category_ids.
			insert.run(
				"/artist/v1/effect/get_resources_by_category_id_CCC_filter_jianyingpro_0",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: "7100000000000000002",
									category_ids: [10494],
								},
							},
							{
								common_attr: {
									id: "7999999999999999999",
									category_ids: [10494],
								},
							},
						],
					},
				})
			);
		} finally {
			database.close();
		}

		try {
			const summer = createReference({
				resourceId: "7100000000000000001",
				version: "aa000000000000000000000000000000",
			});
			const portrait = createReference({
				resourceId: "7100000000000000002",
				version: "bb000000000000000000000000000000",
			});
			const catalog = await resolveJianyingFilterCategories({
				references: [summer, portrait],
				databaseRoot: root,
			});
			expect(catalog.order).toEqual(["🍉夏日", "人像", "风景"]);
			expect(
				findJianyingFilterCategories({ reference: summer, catalog })
			).toEqual(["🍉夏日", "风景"]);
			expect(
				findJianyingFilterCategories({ reference: portrait, catalog })
			).toEqual(["人像"]);
			// Unrequested resources never enter the catalog.
			expect(catalog.byResourceId.has("7999999999999999999")).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("enumerates known filters from panel and per-category listings", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-filter-metadata-"));
		const databaseDirectory = join(root, "catalog-a");
		const databasePath = join(databaseDirectory, "rp.db");
		await mkdir(databaseDirectory, { recursive: true });
		const database = new DatabaseSync(databasePath);
		try {
			database.exec(
				"CREATE TABLE http_cache (url TEXT UNIQUE NOT NULL, response_body TEXT NOT NULL);"
			);
			const insert = database.prepare(
				"INSERT INTO http_cache (url, response_body) VALUES (?, ?)"
			);
			// The filter panel: embedded resources count only with effect_type 12.
			insert.run(
				"/artist/v1/panel/get_panel_info_AAA__jianyingpro_0_filter_paid_type",
				JSON.stringify({
					data: {
						categories: [
							{ category_id: 5914475, category_name: "🍉夏日" },
							{ category_id: 10494, category_name: "人像" },
							{ category_id: 10502, category_name: "影视级" },
						],
						category_resources: {
							"5914475": {
								effect_item_list: [
									{
										common_attr: {
											id: "7100000000000000001",
											title: "晴空",
											effect_type: 12,
											category_ids: [5914475],
											md5: "catalog-version",
											effect_id: 12001,
											third_resource_id_str: "third-1",
											requirements: ["skin_seg", "face_detect"],
											sdk_model: "portrait-filter",
											cover_url: {
												static_img:
													"https://p3-heycan-jy-sign.byteimg.com/filter.jpeg",
											},
										},
									},
									{
										common_attr: {
											id: "7100000000000000010",
											title: "白日梦",
											effect_type: 12,
											category_ids: [5914475, 10502],
										},
									},
									{
										common_attr: {
											id: "7100000000000000011",
											title: "非滤镜资源",
											effect_type: 5,
											category_ids: [5914475],
										},
									},
								],
							},
						},
					},
				})
			);
			// A text panel whose items must be excluded by panel discrimination
			// even when they carry effect_type 12.
			insert.run(
				"/artist/v1/panel/get_panel_info_BBB__jianyingpro_0_filter_paid_type",
				JSON.stringify({
					data: {
						categories: [{ category_id: 10577, category_name: "热门" }],
						category_resources: {
							"10577": {
								effect_item_list: [
									{
										common_attr: {
											id: "7200000000000000001",
											title: "打字机",
											effect_type: 12,
											category_ids: [10577],
										},
									},
								],
							},
						},
					},
				})
			);
			// A paginated filter listing: filters by construction (no effect_type),
			// with a duplicate (first title wins), an untitled item, and an item
			// outside the filter panel.
			insert.run(
				"/artist/v1/effect/get_resources_by_category_id_CCC_filter_jianyingpro_0",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: "7100000000000000002",
									title: "胶片",
									category_ids: [10502],
								},
							},
							{
								common_attr: {
									id: "7100000000000000001",
									title: "晴空复制",
									category_ids: [5914475],
								},
							},
							{
								common_attr: {
									id: "7100000000000000003",
									title: "  ",
									category_ids: [10502],
								},
							},
							{
								common_attr: {
									id: "7100000000000000004",
									title: "别的面板",
									category_ids: [999999],
								},
							},
						],
					},
				})
			);
		} finally {
			database.close();
		}

		try {
			const catalog = await listJianyingFilterCatalog({
				references: [
					createReference({
						resourceId: "7100000000000000001",
						version: "aa000000000000000000000000000000",
					}),
				],
				databaseRoot: root,
			});
			expect(catalog.filters).toEqual([
				{
					resourceId: "7100000000000000001",
					title: "晴空",
					categories: ["🍉夏日"],
					version: "catalog-version",
					effectId: "12001",
					thirdResourceId: "third-1",
					requirements: ["face_detect", "skin_seg"],
					sdkModel: "portrait-filter",
					thumbnailUrl: "https://p3-heycan-jy-sign.byteimg.com/filter.jpeg",
				},
				{
					resourceId: "7100000000000000010",
					title: "白日梦",
					categories: ["🍉夏日", "影视级"],
				},
				{
					resourceId: "7100000000000000002",
					title: "胶片",
					categories: ["影视级"],
				},
			]);
			// Panel order restricted to categories the kept filters use (人像 is
			// unused, the text panel never contributes).
			expect(catalog.order).toEqual(["🍉夏日", "影视级"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("returns an empty catalog when the database root is missing", async () => {
		const references = [
			createReference({
				resourceId: "7100000000000000001",
				version: "aa000000000000000000000000000000",
			}),
		];
		const catalog = await resolveJianyingFilterCategories({
			references,
			databaseRoot: "/nonexistent/qcut-filter-metadata",
		});
		expect(catalog.order).toEqual([]);
		expect(catalog.byResourceId.size).toBe(0);
		const knownCatalog = await listJianyingFilterCatalog({
			references,
			databaseRoot: "/nonexistent/qcut-filter-metadata",
		});
		expect(knownCatalog).toEqual({ order: [], filters: [] });
	});

	it("combined scan matches the three individual resolvers", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-filter-metadata-"));
		const databaseDirectory = join(root, "catalog-a");
		const databasePath = join(databaseDirectory, "rp.db");
		const resourceId = "7100000000000000001";
		const version = "aa000000000000000000000000000000";
		await mkdir(databaseDirectory, { recursive: true });
		const database = new DatabaseSync(databasePath);
		try {
			database.exec(
				"CREATE TABLE http_cache (url TEXT UNIQUE NOT NULL, response_body TEXT NOT NULL);"
			);
			const insert = database.prepare(
				"INSERT INTO http_cache (url, response_body) VALUES (?, ?)"
			);
			insert.run(
				"/artist/v1/panel/get_panel_info_AAA__jianyingpro_0_filter_paid_type",
				JSON.stringify({
					data: {
						categories: [
							{ category_id: 5914475, category_name: "🍉夏日" },
							{ category_id: 10502, category_name: "影视级" },
						],
						category_resources: {
							"5914475": {
								effect_item_list: [
									{
										common_attr: {
											id: resourceId,
											title: "晴空",
											effect_type: 12,
											category_ids: [5914475],
											md5: version,
										},
									},
								],
							},
						},
					},
				})
			);
			// Titles resolve from top-level effect_item_list responses only.
			insert.run(
				"/artist/v1/effect/other_source_DDD",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: resourceId,
									title: "晴空",
									md5: version,
								},
							},
						],
					},
				})
			);
		} finally {
			database.close();
		}

		try {
			const references = [createReference({ resourceId, version })];
			const scan = await scanJianyingFilterMetadata({
				references,
				databaseRoot: root,
			});
			expect(scan.titles).toEqual(
				await resolveJianyingFilterTitles({ references, databaseRoot: root })
			);
			expect(scan.categories).toEqual(
				await resolveJianyingFilterCategories({
					references,
					databaseRoot: root,
				})
			);
			expect(scan.knownCatalog).toEqual(
				await listJianyingFilterCatalog({ references, databaseRoot: root })
			);
			expect(scan.titles.size).toBe(1);
			expect(scan.categories.order).toEqual(["🍉夏日"]);
			expect(scan.knownCatalog.filters).toHaveLength(1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
