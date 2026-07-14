import {
	getTextTemplateDownloadStatus,
	isTextTemplateFavorite,
	type TextLibraryState,
} from "./text-library-state";
import {
	getTextTemplateMarketplaceMetadata,
	type TextTemplateMarketplaceMetadataOverrides,
} from "./text-marketplace-metadata";
import type { TextTemplateDefinition } from "./text-template-registry";

type WeightedSearchTerm = {
	term: string;
	weight: number;
};

type SearchFieldVariant = {
	value: string;
	weight: number;
};

const CHINESE_PINYIN: Readonly<Record<string, string>> = {
	字: "zi",
	花: "hua",
	库: "ku",
	热: "re",
	门: "men",
	最: "zui",
	新: "xin",
	夏: "xia",
	日: "ri",
	综: "zong",
	艺: "yi",
	感: "gan",
	国: "guo",
	风: "feng",
	发: "fa",
	光: "guang",
	渐: "jian",
	变: "bian",
	纹: "wen",
	理: "li",
	红: "hong",
	黄: "huang",
	黑: "hei",
	白: "bai",
	蓝: "lan",
	粉: "fen",
	绿: "lv",
	紫: "zi",
	色: "se",
	标: "biao",
	题: "ti",
	模: "mo",
	板: "ban",
	引: "yin",
	用: "yong",
	列: "lie",
	表: "biao",
	清: "qing",
	单: "dan",
	分: "fen",
	屏: "ping",
	对: "dui",
	比: "bi",
	时: "shi",
	间: "jian",
	线: "xian",
	阶: "jie",
	段: "duan",
	智: "zhi",
	能: "neng",
	文: "wen",
	本: "ben",
	自: "zi",
	动: "dong",
	摘: "zhai",
	要: "yao",
	重: "zhong",
	点: "dian",
	提: "ti",
	取: "qu",
	章: "zhang",
	节: "jie",
	幕: "mu",
	转: "zhuan",
	改: "gai",
	写: "xie",
	基: "ji",
	础: "chu",
	说: "shuo",
	明: "ming",
	角: "jiao",
	贴: "tie",
	纸: "zhi",
	火: "huo",
	焰: "yan",
	熔: "rong",
	岩: "yan",
	故: "gu",
	障: "zhang",
	赛: "sai",
	博: "bo",
	霓: "ni",
	虹: "hong",
	鎏: "liu",
	金: "jin",
	糖: "tang",
	果: "guo",
	气: "qi",
	泡: "pao",
	可: "ke",
	爱: "ai",
	漫: "man",
	画: "hua",
	爆: "bao",
	款: "kuan",
};

const QUERY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
	ai: ["智能", "自动", "摘要", "重点"],
	bling: ["发光", "流光", "鎏金", "梦幻"],
	boom: ["爆红", "漫画", "综艺", "爆炸"],
	cyber: ["故障", "赛博", "霓虹"],
	glitch: ["故障", "赛博", "抖动"],
	gold: ["金色", "鎏金", "黄色", "高级"],
	hot: ["火焰", "熔岩", "红色", "热血"],
	neon: ["发光", "霓虹", "流光"],
	paper: ["撕纸", "纸张", "贴纸"],
	pop: ["综艺", "弹幕", "漫画", "爆款"],
	sticker: ["贴纸", "白边", "可爱"],
	冰: ["冰蓝", "玻璃", "蓝色"],
	可爱: ["贴纸", "糖果", "甜心", "气泡"],
	国潮: ["国风", "水墨", "印章", "鎏金"],
	故障: ["glitch", "赛博", "抖动"],
	火: ["火焰", "熔岩", "热血", "红色"],
	爆款: ["爆红", "热门", "综艺", "漫画"],
	甜: ["粉色", "糖果", "甜心", "气泡"],
	赛博: ["故障", "霓虹", "发光"],
	金: ["金色", "鎏金", "黄色", "高级"],
};

export function rankTextTemplateSearchResults({
	definitions,
	marketplaceOverrides,
	query,
	state,
}: {
	definitions: readonly TextTemplateDefinition[];
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
	query: string;
	state: TextLibraryState;
}): TextTemplateDefinition[] {
	const terms = buildWeightedSearchTerms({ query });
	if (terms.length === 0) return [...definitions];

	return definitions
		.map((definition, index) => ({
			definition,
			index,
			score: scoreTextTemplateDefinition({
				definition,
				marketplaceOverrides,
				state,
				terms,
			}),
		}))
		.filter((result) => result.score > 0)
		.sort((left, right) => {
			if (right.score !== left.score) return right.score - left.score;
			return left.index - right.index;
		})
		.map((result) => result.definition);
}

export function buildWeightedSearchTerms({
	query,
}: {
	query: string;
}): WeightedSearchTerm[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return [];
	const rawTerms = normalizedQuery.split(/\s+/).filter(Boolean);
	const baseTerms = rawTerms.length > 0 ? rawTerms : [normalizedQuery];
	const weightedTerms = new Map<string, number>();

	for (const term of [normalizedQuery, ...baseTerms]) {
		addWeightedTerm({ term, weight: 1, weightedTerms });
		addQueryAliases({ term, weight: 0.95, weightedTerms });
		for (const synonym of QUERY_SYNONYMS[term] ?? []) {
			addWeightedTerm({
				term: synonym.toLocaleLowerCase(),
				weight: 0.72,
				weightedTerms,
			});
			addQueryAliases({
				term: synonym.toLocaleLowerCase(),
				weight: 0.64,
				weightedTerms,
			});
		}
	}

	return [...weightedTerms.entries()].map(([term, weight]) => ({
		term,
		weight,
	}));
}

function addQueryAliases({
	term,
	weight,
	weightedTerms,
}: {
	term: string;
	weight: number;
	weightedTerms: Map<string, number>;
}) {
	const compactTerm = compactLatinTerm({ value: term });
	if (compactTerm && compactTerm !== term) {
		addWeightedTerm({ term: compactTerm, weight, weightedTerms });
	}
	const pinyin = chineseToPinyinAliases({ value: term });
	if (!pinyin) return;
	addWeightedTerm({ term: pinyin.full, weight, weightedTerms });
	addWeightedTerm({
		term: pinyin.acronym,
		weight: weight * 0.92,
		weightedTerms,
	});
}

function addWeightedTerm({
	term,
	weight,
	weightedTerms,
}: {
	term: string;
	weight: number;
	weightedTerms: Map<string, number>;
}) {
	if (!term) return;
	weightedTerms.set(term, Math.max(weightedTerms.get(term) ?? 0, weight));
}

function scoreTextTemplateDefinition({
	definition,
	marketplaceOverrides,
	state,
	terms,
}: {
	definition: TextTemplateDefinition;
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
	state: TextLibraryState;
	terms: readonly WeightedSearchTerm[];
}): number {
	let score = 0;
	for (const term of terms) {
		score += scoreWeightedTerm({ definition, marketplaceOverrides, term });
	}
	if (score <= 0) return 0;
	return (
		score + getStateAwareBoost({ definition, marketplaceOverrides, state })
	);
}

function scoreWeightedTerm({
	definition,
	marketplaceOverrides,
	term,
}: {
	definition: TextTemplateDefinition;
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
	term: WeightedSearchTerm;
}): number {
	const normalizedFields = {
		category: definition.category.toLocaleLowerCase(),
		content: definition.content.toLocaleLowerCase(),
		groupId: definition.groupId.toLocaleLowerCase(),
		id: definition.id.toLocaleLowerCase(),
		name: definition.name.toLocaleLowerCase(),
		variantId: definition.variantId.toLocaleLowerCase(),
	};
	const metadata = getTextTemplateMarketplaceMetadata({
		definition,
		overrides: marketplaceOverrides,
	});
	const keywordScore = definition.keywords.reduce(
		(total, keyword) =>
			total +
			scoreField({ field: keyword.toLocaleLowerCase(), term: term.term }),
		0
	);
	const resourceScore = definition.resource
		? scoreField({ field: definition.resource.assetId, term: term.term }) +
			scoreField({ field: definition.resource.packageId, term: term.term }) *
				0.5
		: 0;
	const marketplaceScore = [
		...metadata.remoteTags,
		...metadata.searchAliases,
	].reduce(
		(total, value) =>
			total + scoreField({ field: value.toLocaleLowerCase(), term: term.term }),
		0
	);
	const fieldScore =
		scoreField({ field: normalizedFields.name, term: term.term }) * 4 +
		scoreField({ field: normalizedFields.content, term: term.term }) * 3 +
		scoreField({ field: normalizedFields.variantId, term: term.term }) * 2.5 +
		scoreField({ field: normalizedFields.category, term: term.term }) * 2 +
		scoreField({ field: normalizedFields.groupId, term: term.term }) +
		scoreField({ field: normalizedFields.id, term: term.term });

	return (
		(fieldScore + keywordScore + resourceScore + marketplaceScore * 1.35) *
		term.weight
	);
}

function scoreField({ field, term }: { field: string; term: string }): number {
	const normalizedTerm = normalizeSearchValue({ value: term });
	if (!normalizedTerm) return 0;
	let bestScore = 0;
	for (const variant of getSearchFieldVariants({ field })) {
		const value = normalizeSearchValue({ value: variant.value });
		if (!value) continue;
		const score = scoreSearchVariant({ field: value, term: normalizedTerm });
		bestScore = Math.max(bestScore, score * variant.weight);
	}
	return bestScore;
}

function scoreSearchVariant({
	field,
	term,
}: {
	field: string;
	term: string;
}): number {
	if (field === term) return 24;
	if (field.startsWith(term)) return 16;
	if (field.includes(term)) return 10;
	if (shouldUseFuzzyMatch({ field, term })) {
		const distance = boundedLevenshteinDistance({ left: field, right: term });
		if (distance === 1) return 8;
		if (distance === 2 && term.length >= 6) return 5;
	}
	return 0;
}

function getSearchFieldVariants({
	field,
}: {
	field: string;
}): SearchFieldVariant[] {
	const variants: SearchFieldVariant[] = [{ value: field, weight: 1 }];
	const compact = compactLatinTerm({ value: field });
	if (compact && compact !== field) {
		variants.push({ value: compact, weight: 0.94 });
	}
	const pinyin = chineseToPinyinAliases({ value: field });
	if (pinyin) {
		variants.push({ value: pinyin.full, weight: 0.86 });
		variants.push({ value: pinyin.acronym, weight: 0.78 });
	}
	return variants;
}

function chineseToPinyinAliases({
	value,
}: {
	value: string;
}): { full: string; acronym: string } | undefined {
	const fullParts: string[] = [];
	const acronymParts: string[] = [];
	let matchedChinese = false;

	for (const character of Array.from(value)) {
		const pinyin = CHINESE_PINYIN[character];
		if (pinyin) {
			matchedChinese = true;
			fullParts.push(pinyin);
			acronymParts.push(pinyin[0]);
			continue;
		}
		const normalized = normalizeSearchValue({ value: character });
		if (normalized && /^[a-z0-9]+$/.test(normalized)) {
			fullParts.push(normalized);
			acronymParts.push(normalized[0]);
		}
	}

	if (!matchedChinese) return;
	return {
		full: fullParts.join(""),
		acronym: acronymParts.join(""),
	};
}

function compactLatinTerm({ value }: { value: string }): string {
	return normalizeSearchValue({ value }).replace(/[^a-z0-9]/g, "");
}

function normalizeSearchValue({ value }: { value: string }): string {
	return value
		.toLocaleLowerCase()
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.trim();
}

function shouldUseFuzzyMatch({
	field,
	term,
}: {
	field: string;
	term: string;
}): boolean {
	if (term.length < 4 || field.length < 4) return false;
	if (!/^[a-z0-9]+$/.test(term) || !/^[a-z0-9]+$/.test(field)) return false;
	return Math.abs(field.length - term.length) <= 2;
}

function boundedLevenshteinDistance({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	const previous = Array.from(
		{ length: right.length + 1 },
		(_, index) => index
	);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		let rowMinimum = current[0];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitutionCost =
				left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
			const value = Math.min(
				current[rightIndex - 1] + 1,
				previous[rightIndex] + 1,
				previous[rightIndex - 1] + substitutionCost
			);
			current[rightIndex] = value;
			rowMinimum = Math.min(rowMinimum, value);
		}
		if (rowMinimum > 2) return rowMinimum;
		previous.splice(0, previous.length, ...current);
	}
	return previous[right.length];
}

function getStateAwareBoost({
	definition,
	marketplaceOverrides,
	state,
}: {
	definition: TextTemplateDefinition;
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
	state: TextLibraryState;
}): number {
	const recentIndex = state.recentIds.indexOf(definition.id);
	const recentBoost = recentIndex >= 0 ? Math.max(0, 18 - recentIndex * 2) : 0;
	const downloadedBoost =
		getTextTemplateDownloadStatus({ definition, state }) === "cached" ? 14 : 0;
	const favoriteBoost = isTextTemplateFavorite({ definition, state }) ? 16 : 0;
	const premiumBoost = definition.premium ? 3 : 0;
	const metadata = getTextTemplateMarketplaceMetadata({
		definition,
		overrides: marketplaceOverrides,
	});
	const heatBoost = metadata.heatScore * 0.34;
	const editorialBoost = Math.max(0, 16 - metadata.editorialRank * 0.12);

	return (
		recentBoost +
		downloadedBoost +
		favoriteBoost +
		premiumBoost +
		heatBoost +
		editorialBoost
	);
}
