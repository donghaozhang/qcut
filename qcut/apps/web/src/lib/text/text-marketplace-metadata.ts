import type { TextTemplateDefinition } from "./text-template-registry";

export type TextTemplateMarketplaceMetadata = {
	editorialRank: number;
	heatScore: number;
	remoteTags: readonly string[];
	searchAliases: readonly string[];
};

type MarketplaceFacet = {
	aliases: readonly string[];
	heat: number;
	rank: number;
	tags: readonly string[];
};

const CATEGORY_FACETS: Readonly<Record<string, MarketplaceFacet>> = {
	"black-white": {
		aliases: ["黑白", "高对比", "经典", "bw"],
		heat: 78,
		rank: 42,
		tags: ["color:black-white", "tone:classic"],
	},
	blue: {
		aliases: ["蓝色", "冰蓝", "科技", "blue"],
		heat: 82,
		rank: 30,
		tags: ["color:blue", "scene:tech"],
	},
	glow: {
		aliases: ["发光", "霓虹", "夜景", "neon"],
		heat: 90,
		rank: 14,
		tags: ["effect:glow", "scene:night"],
	},
	gradient: {
		aliases: ["渐变", "流光", "梦幻", "gradient"],
		heat: 92,
		rank: 12,
		tags: ["effect:gradient", "tone:dreamy"],
	},
	green: {
		aliases: ["绿色", "清新", "自然", "green"],
		heat: 72,
		rank: 54,
		tags: ["color:green", "tone:fresh"],
	},
	guofeng: {
		aliases: ["国风", "国潮", "水墨", "chinoiserie"],
		heat: 86,
		rank: 20,
		tags: ["style:guofeng", "scene:culture"],
	},
	latest: {
		aliases: ["最新", "上新", "new"],
		heat: 88,
		rank: 16,
		tags: ["collection:latest", "market:new"],
	},
	pink: {
		aliases: ["粉色", "甜心", "可爱", "pink"],
		heat: 76,
		rank: 46,
		tags: ["color:pink", "tone:cute"],
	},
	popular: {
		aliases: ["热门", "爆款", "推荐", "popular"],
		heat: 96,
		rank: 4,
		tags: ["collection:popular", "market:recommended"],
	},
	purple: {
		aliases: ["紫色", "梦幻", "高级", "purple"],
		heat: 74,
		rank: 50,
		tags: ["color:purple", "tone:dreamy"],
	},
	red: {
		aliases: ["红色", "爆红", "促销", "red"],
		heat: 94,
		rank: 8,
		tags: ["color:red", "scene:commerce"],
	},
	summer: {
		aliases: ["夏日", "清爽", "活动", "summer"],
		heat: 80,
		rank: 34,
		tags: ["season:summer", "tone:fresh"],
	},
	texture: {
		aliases: ["纹理", "材质", "质感", "texture"],
		heat: 91,
		rank: 13,
		tags: ["effect:texture", "market:premium-look"],
	},
	variety: {
		aliases: ["综艺", "弹幕", "爆笑", "variety"],
		heat: 89,
		rank: 18,
		tags: ["scene:variety", "effect:pop"],
	},
	yellow: {
		aliases: ["黄色", "醒目", "高亮", "yellow"],
		heat: 84,
		rank: 26,
		tags: ["color:yellow", "tone:bright"],
	},
};

const VARIANT_FACETS: Readonly<Record<string, MarketplaceFacet>> = {
	candy: {
		aliases: ["糖果", "甜", "可爱"],
		heat: 74,
		rank: 58,
		tags: ["style:candy", "tone:cute"],
	},
	chrome: {
		aliases: ["金属", "银色", "质感"],
		heat: 82,
		rank: 32,
		tags: ["material:chrome", "tone:premium"],
	},
	comic: {
		aliases: ["漫画", "爆炸", "综艺"],
		heat: 88,
		rank: 19,
		tags: ["style:comic", "effect:burst"],
	},
	fire: {
		aliases: ["火焰", "热血", "燃"],
		heat: 93,
		rank: 9,
		tags: ["effect:fire", "tone:hot"],
	},
	glitch: {
		aliases: ["故障", "赛博", "抖动"],
		heat: 87,
		rank: 21,
		tags: ["effect:glitch", "scene:cyber"],
	},
	glow: {
		aliases: ["发光", "霓虹", "夜景"],
		heat: 90,
		rank: 15,
		tags: ["effect:glow", "scene:night"],
	},
	gold: {
		aliases: ["金色", "鎏金", "高级"],
		heat: 86,
		rank: 22,
		tags: ["material:gold", "tone:premium"],
	},
	"gradient-shine": {
		aliases: ["流光", "渐变", "高光"],
		heat: 92,
		rank: 11,
		tags: ["effect:shine", "effect:gradient"],
	},
	lava: {
		aliases: ["熔岩", "热血", "火"],
		heat: 89,
		rank: 17,
		tags: ["effect:lava", "tone:hot"],
	},
	"red-burst": {
		aliases: ["爆红", "爆款", "放射"],
		heat: 98,
		rank: 2,
		tags: ["effect:burst", "market:hero"],
	},
	sticker: {
		aliases: ["贴纸", "白边", "可爱"],
		heat: 85,
		rank: 24,
		tags: ["style:sticker", "tone:cute"],
	},
	"texture-grain": {
		aliases: ["颗粒", "纹理", "质感"],
		heat: 91,
		rank: 13,
		tags: ["material:grain", "effect:texture"],
	},
	"torn-paper": {
		aliases: ["撕纸", "纸张", "拼贴"],
		heat: 83,
		rank: 28,
		tags: ["material:paper", "style:collage"],
	},
};

export function getTextTemplateMarketplaceMetadata({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplateMarketplaceMetadata {
	const categoryFacet = CATEGORY_FACETS[definition.category];
	const variantFacet = VARIANT_FACETS[definition.variantId];
	const heatScore = clampHeatScore({
		value:
			42 +
			(categoryFacet?.heat ?? 48) * 0.34 +
			(variantFacet?.heat ?? 44) * 0.42 +
			(definition.premium ? 4 : 0),
	});
	const editorialRank = Math.min(
		categoryFacet?.rank ?? 120,
		variantFacet?.rank ?? 120
	);
	return {
		editorialRank,
		heatScore,
		remoteTags: uniqueValues({
			values: [
				`category:${definition.category}`,
				`group:${definition.groupId}`,
				`variant:${definition.variantId}`,
				...(categoryFacet?.tags ?? []),
				...(variantFacet?.tags ?? []),
			],
		}),
		searchAliases: uniqueValues({
			values: [
				...(categoryFacet?.aliases ?? []),
				...(variantFacet?.aliases ?? []),
			],
		}),
	};
}

export function compareTextTemplatesByMarketplaceOrder({
	left,
	right,
}: {
	left: TextTemplateDefinition;
	right: TextTemplateDefinition;
}): number {
	const leftMetadata = getTextTemplateMarketplaceMetadata({ definition: left });
	const rightMetadata = getTextTemplateMarketplaceMetadata({
		definition: right,
	});
	if (leftMetadata.editorialRank !== rightMetadata.editorialRank) {
		return leftMetadata.editorialRank - rightMetadata.editorialRank;
	}
	if (leftMetadata.heatScore !== rightMetadata.heatScore) {
		return rightMetadata.heatScore - leftMetadata.heatScore;
	}
	return left.name.localeCompare(right.name);
}

function clampHeatScore({ value }: { value: number }): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueValues({ values }: { values: readonly string[] }): string[] {
	return [...new Set(values.filter(Boolean))];
}
