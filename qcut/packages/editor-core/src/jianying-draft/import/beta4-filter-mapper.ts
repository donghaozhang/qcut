import type {
	InteropDowngradeDeclaration,
	InteropFilterPreset,
} from "../../draft-interop/document.js";
import type { RawGraphMaterialNode } from "./graph-reader.js";

/**
 * JianYing native filter resource ids → QCut's fitted recipe presets (L6).
 * Ids and titles come from the local ressdk_db catalog (http_cache
 * effect_item_list, effect_type 12, read 2026-08-19); presets are the
 * committed `jy-*` FilterPreset recipes in
 * apps/web/src/lib/filters/jianying-parity/ (least-squares fitted, machine
 * independent). The table stores only id → QCut preset references — no
 * JianYing assets. Names with two catalog ids (去雾, 黑金) list both; the
 * material's name must still match exactly. Unknown ids keep today's opaque
 * path.
 */
const BETA4_FILTER_PRESETS: Readonly<
	Record<string, { name: string; presetId: string; presetVersion: number }>
> = {
	// 美食
	"7478181967532543259": {
		name: "食光II",
		presetId: "jy-foodlight-ii",
		presetVersion: 1,
	},
	"7525074000846802227": {
		name: "高级质感",
		presetId: "jy-premium-food-texture",
		presetVersion: 1,
	},
	"7409674549467352374": {
		name: "通透暖食",
		presetId: "jy-clear-warm-food",
		presetVersion: 1,
	},
	"7127608379056459015": {
		name: "赏味",
		presetId: "jy-taste",
		presetVersion: 1,
	},
	"7330581892510649636": {
		name: "鲜美",
		presetId: "jy-delicious",
		presetVersion: 1,
	},
	"7403664465390013735": {
		name: "美食增色",
		presetId: "jy-food-color-boost",
		presetVersion: 1,
	},
	"7403664041945681191": {
		name: "清透美食",
		presetId: "jy-clear-food",
		presetVersion: 1,
	},
	"7533181577170373934": {
		name: "暖食增色",
		presetId: "jy-warm-food-color",
		presetVersion: 1,
	},
	// 胶片
	"7494564488704806198": {
		name: "怀旧",
		presetId: "jy-nostalgia",
		presetVersion: 1,
	},
	"7632707882093382974": {
		name: "旧时光帧",
		presetId: "jy-old-time-frame",
		presetVersion: 1,
	},
	"7479800436778732863": {
		name: "复古电影感",
		presetId: "jy-retro-cinema",
		presetVersion: 1,
	},
	"7511971221785922826": {
		name: "国民旧照",
		presetId: "jy-vintage-portrait",
		presetVersion: 1,
	},
	"7295599414180138250": {
		name: "琥珀",
		presetId: "jy-amber",
		presetVersion: 1,
	},
	// 相机
	"7654621267676466451": {
		name: "大疆Pocket4P",
		presetId: "jy-dji-pocket-4p",
		presetVersion: 1,
	},
	"7268563047776587020": {
		name: "徕卡II",
		presetId: "jy-leica-ii",
		presetVersion: 1,
	},
	"7604153795639135497": {
		name: "影石4k",
		presetId: "jy-insta360-4k",
		presetVersion: 1,
	},
	"7361792068475325735": {
		name: "奥林巴斯",
		presetId: "jy-olympus",
		presetVersion: 1,
	},
	"7512706064693988645": {
		name: "大疆电影感",
		presetId: "jy-dji-cinema",
		presetVersion: 1,
	},
	"7535108076081335606": {
		name: "富士XT5",
		presetId: "jy-fuji-xt5",
		presetVersion: 1,
	},
	// 风景
	"7471501728546966835": {
		name: "高清修复",
		presetId: "jy-landscape-hd-repair",
		presetVersion: 1,
	},
	"7272341241893768506": {
		name: "梦暮",
		presetId: "jy-dream-dusk",
		presetVersion: 1,
	},
	"7497919307628825866": {
		name: "富士电影",
		presetId: "jy-fuji-cinema",
		presetVersion: 1,
	},
	"7166480345666260263": {
		name: "魔都",
		presetId: "jy-magic-city",
		presetVersion: 1,
	},
	"7525722154726329650": {
		name: "画质增蓝",
		presetId: "jy-blue-quality",
		presetVersion: 1,
	},
	"7625638577468165426": {
		name: "质感影片",
		presetId: "jy-texture-film",
		presetVersion: 1,
	},
	"7473437502787816740": {
		name: "去雾",
		presetId: "jy-dehaze",
		presetVersion: 1,
	},
	"7564322465548274968": {
		name: "去雾",
		presetId: "jy-dehaze",
		presetVersion: 1,
	},
	// 户外
	"7410401136387132724": {
		name: "荒原",
		presetId: "jy-wasteland",
		presetVersion: 1,
	},
	"7194091413728922941": {
		name: "石山",
		presetId: "jy-stone-mountain",
		presetVersion: 1,
	},
	"7196927862056701240": {
		name: "冰瀑",
		presetId: "jy-ice-falls",
		presetVersion: 1,
	},
	"7275698024892943655": {
		name: "旷野",
		presetId: "jy-wildland",
		presetVersion: 1,
	},
	"7196917591909109052": {
		name: "雨空",
		presetId: "jy-rain-sky",
		presetVersion: 1,
	},
	"7195931118166609190": {
		name: "越野",
		presetId: "jy-offroad",
		presetVersion: 1,
	},
	// 夜景
	"7525110001959030042": {
		name: "夜景去雾",
		presetId: "jy-night-dehaze",
		presetVersion: 1,
	},
	"7411477748130139403": {
		name: "夜景增色II",
		presetId: "jy-night-boost-ii",
		presetVersion: 1,
	},
	"7406976302122618123": {
		name: "都市电影II",
		presetId: "jy-urban-cinema-ii",
		presetVersion: 1,
	},
	"7617817263307066667": {
		name: "冷烟花",
		presetId: "jy-cool-fireworks",
		presetVersion: 1,
	},
	// 风格化
	"7127561047048850718": {
		name: "橙蓝",
		presetId: "jy-orange-teal",
		presetVersion: 1,
	},
	"7145394266209127694": {
		name: "银蓝",
		presetId: "jy-silver-blue",
		presetVersion: 1,
	},
	"7127670164996295972": {
		name: "黑金",
		presetId: "jy-black-gold",
		presetVersion: 1,
	},
	"7414902721733479699": {
		name: "黑金",
		presetId: "jy-black-gold",
		presetVersion: 1,
	},
	"7592199246766542104": {
		name: "水墨意境",
		presetId: "jy-ink-wash",
		presetVersion: 1,
	},
	// 黑白
	"7533265997478808841": {
		name: "黑白记忆",
		presetId: "jy-mono-memory",
		presetVersion: 1,
	},
	"7127838224344435981": {
		name: "江浙沪",
		presetId: "jy-jiangnan-mono",
		presetVersion: 1,
	},
	"7429744855724641545": {
		name: "高清黑白",
		presetId: "jy-hd-mono",
		presetVersion: 1,
	},
	"7242215081663008056": {
		name: "森山",
		presetId: "jy-forest-mountain",
		presetVersion: 1,
	},
	"7127664822921022734": {
		name: "蓝调",
		presetId: "jy-blue-tone-mono",
		presetVersion: 1,
	},
	// 人像
	"7127655008715230495": {
		name: "亮肤",
		presetId: "jy-bright-skin",
		presetVersion: 1,
	},
	"7426668776491453707": {
		name: "高清增强",
		presetId: "jy-portrait-hd-enhance",
		presetVersion: 1,
	},
	"7127614731187178783": {
		name: "冷白",
		presetId: "jy-cool-white",
		presetVersion: 1,
	},
	"7320436048134147340": {
		name: "高清",
		presetId: "jy-portrait-hd",
		presetVersion: 1,
	},
	"7626048649105165592": {
		name: "痞帅暗调",
		presetId: "jy-moody-dark",
		presetVersion: 1,
	},
	"7650536865895894282": {
		name: "情绪大片",
		presetId: "jy-emotional-cinema",
		presetVersion: 1,
	},
	"7169350167903112451": {
		name: "榄白",
		presetId: "jy-olive-white",
		presetVersion: 1,
	},
	"7172169921726565670": {
		name: "奶昔",
		presetId: "jy-milkshake",
		presetVersion: 1,
	},
	"7630501558370733321": {
		name: "静谧暗调",
		presetId: "jy-quiet-dark",
		presetVersion: 1,
	},
	"7580008561884040473": {
		name: "墨色胶卷",
		presetId: "jy-ink-film",
		presetVersion: 1,
	},
};

export interface MappedBeta4SegmentFilter {
	filterPreset: InteropFilterPreset;
	downgrade: InteropDowngradeDeclaration;
	reason: string;
}

/**
 * Maps one segment-attached beta4 filter material onto a fitted QCut recipe.
 *
 * Shape contract (fixture-defined; no plaintext beta4 filter draft exists
 * locally to fingerprint, so anything off-contract simply stays opaque and
 * never crosses): a `filters`-bucket material with type "filter", a
 * catalogued string resource_id, the exact catalogued name, and an optional
 * numeric `value` intensity in [0,1] (absent means full strength — the
 * fitting parity point). Returns undefined when the material is not an
 * admissible catalogued filter.
 */
export function mapBeta4SegmentFilter({
	material,
}: {
	material: RawGraphMaterialNode;
}): MappedBeta4SegmentFilter | undefined {
	if (material.bucket !== "filters") return undefined;
	const raw = material.raw;
	if (raw.type !== "filter") return undefined;
	const resourceId = raw.resource_id;
	if (typeof resourceId !== "string") return undefined;
	const catalogued = BETA4_FILTER_PRESETS[resourceId];
	if (catalogued === undefined || raw.name !== catalogued.name) {
		return undefined;
	}
	let intensity = 100;
	if (raw.value !== undefined) {
		if (
			typeof raw.value !== "number" ||
			!Number.isFinite(raw.value) ||
			raw.value < 0 ||
			raw.value > 1
		) {
			return undefined;
		}
		intensity = raw.value * 100;
	}
	return {
		filterPreset: {
			presetId: catalogued.presetId,
			presetVersion: catalogued.presetVersion,
			intensity,
		},
		downgrade: {
			approximation: `filter-lut-recipe:${catalogued.presetId}`,
			fidelityEvidence:
				"least-squares fitted FilterLutRecipe (apps/web jianying-parity presets; capture-vs-recipe residual 3-8 RMSE/255 at intensity 100, see filter-library parity tests)",
		},
		reason: `filter ${catalogued.name} maps to the fitted QCut recipe ${catalogued.presetId}`,
	};
}

/** Test-only view of the catalogue keys. */
export function listBeta4FilterPresetResourceIds(): string[] {
	return Object.keys(BETA4_FILTER_PRESETS);
}
