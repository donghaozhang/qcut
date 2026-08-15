import { describe, expect, it } from "vitest";
import {
	collectCatalogItems,
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
}: {
	effectId: string;
	title: string;
	md5: string;
	extra?: Record<string, unknown>;
	sdkExtra?: string;
	requirements?: string[];
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
		},
		special_effect: { effect_duration: 3000 },
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
});
