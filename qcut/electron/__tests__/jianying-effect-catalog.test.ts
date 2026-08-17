import { describe, expect, it } from "vitest";
import {
	collectCatalogItems,
	collectPanelCategories,
	collectReferenceVerdicts,
	findUnsafeZipEntries,
	readAdjustParameters,
} from "../jianying-effect/catalog-parsing.js";

function catalogRow({ panel, items }: { panel: string; items: unknown[] }) {
	return {
		url: `/artist/v1/effect/get_resources_by_category_id_ABC_${panel}_jianyingpro_0`,
		responseBody: JSON.stringify({ data: { effect_item_list: items } }),
	};
}

function catalogItem({
	effectId,
	title,
	md5,
	extra = {},
	sdkExtra,
	requirements,
	categoryIds,
	coverUrl,
}: {
	effectId: string;
	title: string;
	md5: string;
	extra?: Record<string, unknown>;
	sdkExtra?: string;
	requirements?: string[];
	categoryIds?: Array<number | string>;
	coverUrl?: string;
}) {
	return {
		common_attr: {
			effect_id: effectId,
			title,
			md5,
			third_resource_id_str: `resource-${effectId}`,
			extra: JSON.stringify(extra),
			sdk_extra: sdkExtra,
			requirements,
			category_ids: categoryIds,
			cover_url: coverUrl ? { small: coverUrl } : undefined,
		},
		special_effect: { effect_duration: 3000 },
	};
}

function panelRow({
	categories,
}: {
	categories: Array<{ id: number; name: string }>;
}) {
	return {
		url: "/artist/v1/panel/get_panel_info_ABCDEF__jianyingpro_0",
		responseBody: JSON.stringify({
			data: {
				categories: categories.map((category) => ({
					category_id: category.id,
					category_name: category.name,
				})),
			},
		}),
	};
}

describe("Jianying effect catalog", () => {
	it("reads effects from both 特效 panels", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [catalogItem({ effectId: "1", title: "抖动", md5: "aaa" })],
				}),
				catalogRow({
					panel: "face-prop",
					items: [catalogItem({ effectId: "2", title: "电光眼", md5: "bbb" })],
				}),
			],
		});

		expect(items.map((item) => [item.panel, item.title])).toEqual([
			["effects2", "抖动"],
			["face-prop", "电光眼"],
		]);
	});

	it("ignores rows from panels that are not 特效", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "transitions",
					items: [catalogItem({ effectId: "1", title: "叠化", md5: "aaa" })],
				}),
			],
		});

		expect(items).toEqual([]);
	});

	it("keeps one entry per effect when a page is cached twice", () => {
		const item = catalogItem({ effectId: "1", title: "抖动", md5: "aaa" });
		const items = collectCatalogItems({
			rows: [
				catalogRow({ panel: "effects2", items: [item] }),
				catalogRow({ panel: "effects2", items: [item] }),
			],
		});

		expect(items).toHaveLength(1);
	});

	it("reads the slider schema the package declares", () => {
		const parameters = readAdjustParameters({
			sdkExtra: JSON.stringify({
				setting: {
					effect_adjust_params: [
						{
							effect_key: "effects_adjust_speed",
							default: 0.5,
							min: 0,
							max: 1,
						},
						{
							effect_key: "effects_adjust_luminance",
							default: 1.7,
							min: 0,
							max: 2.3,
						},
					],
				},
			}),
		});

		expect(parameters).toEqual([
			{
				key: "effects_adjust_speed",
				defaultValue: 0.5,
				minimum: 0,
				maximum: 1,
			},
			{
				key: "effects_adjust_luminance",
				defaultValue: 1.7,
				minimum: 0,
				maximum: 2.3,
			},
		]);
	});

	it("survives a row whose body is not catalog JSON", () => {
		expect(() =>
			collectCatalogItems({
				rows: [{ url: "/x_effects2_jianyingpro_0", responseBody: "not json" }],
			})
		).not.toThrow();
	});

	it("keeps only https download urls", () => {
		const item = catalogItem({ effectId: "1", title: "星火", md5: "aaa" });
		(item.common_attr as Record<string, unknown>).item_urls = [
			"https://p9-artist.example/pkg.zip",
			"http://insecure.example/pkg.zip",
			42,
		];
		const items = collectCatalogItems({
			rows: [catalogRow({ panel: "effects2", items: [item] })],
		});

		expect(items[0].itemUrls).toEqual(["https://p9-artist.example/pkg.zip"]);
	});

	it("reads category ids and https covers", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [
						catalogItem({
							effectId: "1",
							title: "抖动",
							md5: "aaa",
							categoryIds: [7730, "39654"],
							coverUrl: "https://p3.byteimg.example/cover.image",
						}),
					],
				}),
			],
		});

		expect(items[0].categoryIds).toEqual(["7730", "39654"]);
		expect(items[0].coverUrl).toBe("https://p3.byteimg.example/cover.image");
	});

	it("defaults item urls to empty when the catalog omits them", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [catalogItem({ effectId: "1", title: "抖动", md5: "aaa" })],
				}),
			],
		});

		expect(items[0].itemUrls).toEqual([]);
	});
});

describe("panel categories", () => {
	it("rebuilds the sidebar from the best-overlapping panel row", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [
						catalogItem({
							effectId: "1",
							title: "抖动",
							md5: "aaa",
							categoryIds: [7730, 39654],
						}),
						catalogItem({
							effectId: "2",
							title: "开幕",
							md5: "bbb",
							categoryIds: [7728],
						}),
					],
				}),
			],
		});
		const panelRows = [
			// The sticker panel shares no ids and must lose.
			panelRow({ categories: [{ id: 111, name: "贴纸" }] }),
			panelRow({
				categories: [
					{ id: 39654, name: "热门" },
					{ id: 7728, name: "基础" },
					{ id: 7730, name: "动感" },
					{ id: 999, name: "无关" },
				],
			}),
		];

		expect(collectPanelCategories({ panelRows, items })).toEqual([
			{ id: "39654", name: "热门", panel: "effects2", categoryIds: ["39654"] },
			{ id: "7728", name: "基础", panel: "effects2", categoryIds: ["7728"] },
			{ id: "7730", name: "动感", panel: "effects2", categoryIds: ["7730"] },
		]);
	});

	it("keeps used ids the winning panel misses", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [
						catalogItem({
							effectId: "1",
							title: "抖动",
							md5: "aaa",
							categoryIds: [7730, 424242],
						}),
					],
				}),
			],
		});
		const panelRows = [
			panelRow({ categories: [{ id: 7730, name: "动感" }] }),
			panelRow({ categories: [{ id: 424242, name: "综艺" }] }),
		];

		expect(collectPanelCategories({ panelRows, items })).toEqual([
			{ id: "7730", name: "动感", panel: "effects2", categoryIds: ["7730"] },
			{
				id: "424242",
				name: "综艺",
				panel: "effects2",
				categoryIds: ["424242"],
			},
		]);
	});

	it("drops an unnamed category whose effects are reachable elsewhere", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [
						catalogItem({
							effectId: "1",
							title: "抖动",
							md5: "aaa",
							categoryIds: [7730, 999999],
						}),
					],
				}),
			],
		});
		const panelRows = [panelRow({ categories: [{ id: 7730, name: "动感" }] })];

		// 999999 has no name anywhere, but its only member also sits in 动感,
		// so a raw-id tab would be noise.
		expect(collectPanelCategories({ panelRows, items })).toEqual([
			{ id: "7730", name: "动感", panel: "effects2", categoryIds: ["7730"] },
		]);
	});

	it("folds unnamed categories holding unreachable effects into 其他", () => {
		const items = collectCatalogItems({
			rows: [
				catalogRow({
					panel: "effects2",
					items: [
						catalogItem({
							effectId: "1",
							title: "抖动",
							md5: "aaa",
							categoryIds: [7730],
						}),
						catalogItem({
							effectId: "2",
							title: "孤儿",
							md5: "bbb",
							categoryIds: [888888],
						}),
					],
				}),
			],
		});
		const panelRows = [panelRow({ categories: [{ id: 7730, name: "动感" }] })];

		expect(collectPanelCategories({ panelRows, items })).toEqual([
			{ id: "7730", name: "动感", panel: "effects2", categoryIds: ["7730"] },
			{
				id: "effects2-other",
				name: "其他",
				panel: "effects2",
				categoryIds: ["888888"],
			},
		]);
	});
});

describe("reference verdicts", () => {
	it("keeps the last verdict per effect and survives torn lines", () => {
		const jsonl = [
			JSON.stringify({ effectId: "1", ok: false }),
			JSON.stringify({ effectId: "2", ok: true }),
			'{"effectId": "3", "ok"', // torn line from an interrupted run
			JSON.stringify({ effectId: "1", ok: true }),
			"",
		].join("\n");

		const verdicts = collectReferenceVerdicts({ jsonl });
		expect(verdicts.get("1")).toBe(true);
		expect(verdicts.get("2")).toBe(true);
		expect(verdicts.has("3")).toBe(false);
	});
});

describe("zip entry safety", () => {
	it("accepts ordinary package entries", () => {
		expect(
			findUnsafeZipEntries({
				entries: [
					"config.json",
					"extra.json",
					"amazingfeature/main.scene",
					"amazingfeature/xshader/pass.frag",
				],
			})
		).toEqual([]);
	});

	it("flags entries that could escape the extraction directory", () => {
		expect(
			findUnsafeZipEntries({
				entries: [
					"../outside.txt",
					"nested/../../outside.txt",
					"/etc/passwd",
					"\\windows\\system32",
					"C:evil.txt",
					"safe.txt",
				],
			})
		).toEqual([
			"../outside.txt",
			"nested/../../outside.txt",
			"/etc/passwd",
			"\\windows\\system32",
			"C:evil.txt",
		]);
	});
});
