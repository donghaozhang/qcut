import { describe, expect, it } from "vitest";
import { buildFilterCube } from "../filter-lut";
import { JIANYING_PARITY_FILTER_PRESETS } from "../jianying-parity";

const EXPECTED_LOCALIZED_NAMES = [
	"亮肤",
	"高清增强",
	"冷白",
	"高清",
	"痞帅暗调",
	"情绪大片",
	"榄白",
	"奶昔",
	"高清修复",
	"梦暮",
	"富士电影",
	"魔都",
	"画质增蓝",
	"质感影片",
	"去雾",
	"荒原",
	"食光II",
	"高级质感",
	"通透暖食",
	"赏味",
	"鲜美",
	"美食增色",
	"清透美食",
	"暖食增色",
	"大疆Pocket4P",
	"徕卡II",
	"影石4k",
	"奥林巴斯",
	"大疆电影感",
	"富士XT5",
	"怀旧",
	"旧时光帧",
	"复古电影感",
	"国民旧照",
	"琥珀",
	"黑白记忆",
	"江浙沪",
	"高清黑白",
	"森山",
	"蓝调",
	"夜景去雾",
	"夜景增色II",
	"都市电影II",
	"冷烟花",
	"橙蓝",
	"石山",
	"冰瀑",
	"旷野",
	"雨空",
	"越野",
	"静谧暗调",
	"墨色胶卷",
	"银蓝",
	"黑金",
	"水墨意境",
];

const UPGRADED_PRESET_VERSIONS: Record<string, number> = {
	"jy-black-gold": 2,
	"jy-ink-film": 2,
	"jy-ink-wash": 2,
	"jy-quiet-dark": 2,
};

describe("Jianying parity filter presets", () => {
	it("ships all fifty-five validated looks with stable metadata", () => {
		expect(JIANYING_PARITY_FILTER_PRESETS).toHaveLength(55);
		expect(
			JIANYING_PARITY_FILTER_PRESETS.map((preset) => preset.localizedName)
		).toEqual(EXPECTED_LOCALIZED_NAMES);
		expect(
			new Set(JIANYING_PARITY_FILTER_PRESETS.map((preset) => preset.id)).size
		).toBe(55);

		const categoryCounts = new Map<string, number>();
		for (const preset of JIANYING_PARITY_FILTER_PRESETS) {
			const expectedVersion = UPGRADED_PRESET_VERSIONS[preset.id] ?? 1;
			categoryCounts.set(
				preset.category,
				(categoryCounts.get(preset.category) ?? 0) + 1
			);
			expect(preset.version).toBe(expectedVersion);
			expect(preset.defaultIntensity).toBe(100);
			expect(preset.isNew).toBe(true);
			expect(preset.thumbnail).toBe(
				`/images/filter-previews/${preset.id}.webp`
			);
			expect(preset.lutAssetId).toBe(
				`qcut/filter/${preset.id}/v${expectedVersion}`
			);
		}

		expect(Object.fromEntries(categoryCounts)).toEqual({
			portrait: 8,
			landscape: 8,
			food: 8,
			camera: 6,
			film: 5,
			monochrome: 5,
			night: 5,
			outdoor: 5,
			stylized: 5,
		});
	});

	it("renders every fitted recipe into a bounded production cube", () => {
		for (const preset of JIANYING_PARITY_FILTER_PRESETS) {
			const cube = buildFilterCube({ preset });
			expect(cube.size).toBe(17);
			expect(cube.values).toHaveLength(17 ** 3 * 3);
			expect(cube.values.every(Number.isFinite)).toBe(true);
			expect(cube.values.every((value) => value >= 0 && value <= 1)).toBe(true);
		}
	});
});
