import {
	getTextTemplateDownloadStatus,
	isTextTemplateFavorite,
	type TextLibraryState,
} from "./text-library-state";
import type { TextTemplateDefinition } from "./text-template-registry";

type WeightedSearchTerm = {
	term: string;
	weight: number;
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

const HOT_CATEGORY_BOOSTS: Readonly<Record<string, number>> = {
	popular: 18,
	latest: 12,
	red: 10,
	texture: 10,
	gradient: 10,
	glow: 8,
	variety: 8,
};

const HOT_VARIANT_BOOSTS: Readonly<Record<string, number>> = {
	"red-burst": 20,
	fire: 18,
	"gradient-shine": 17,
	"gradient-duotone": 16,
	"texture-grain": 16,
	sticker: 14,
	glitch: 14,
	comic: 13,
	gold: 13,
	lava: 13,
};

export function rankTextTemplateSearchResults({
	definitions,
	query,
	state,
}: {
	definitions: readonly TextTemplateDefinition[];
	query: string;
	state: TextLibraryState;
}): TextTemplateDefinition[] {
	const terms = buildWeightedSearchTerms({ query });
	if (terms.length === 0) return [...definitions];

	return definitions
		.map((definition, index) => ({
			definition,
			index,
			score: scoreTextTemplateDefinition({ definition, state, terms }),
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
		for (const synonym of QUERY_SYNONYMS[term] ?? []) {
			addWeightedTerm({
				term: synonym.toLocaleLowerCase(),
				weight: 0.72,
				weightedTerms,
			});
		}
	}

	return [...weightedTerms.entries()].map(([term, weight]) => ({
		term,
		weight,
	}));
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
	state,
	terms,
}: {
	definition: TextTemplateDefinition;
	state: TextLibraryState;
	terms: readonly WeightedSearchTerm[];
}): number {
	let score = 0;
	for (const term of terms) {
		score += scoreWeightedTerm({ definition, term });
	}
	if (score <= 0) return 0;
	return score + getStateAwareBoost({ definition, state });
}

function scoreWeightedTerm({
	definition,
	term,
}: {
	definition: TextTemplateDefinition;
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
	const fieldScore =
		scoreField({ field: normalizedFields.name, term: term.term }) * 4 +
		scoreField({ field: normalizedFields.content, term: term.term }) * 3 +
		scoreField({ field: normalizedFields.variantId, term: term.term }) * 2.5 +
		scoreField({ field: normalizedFields.category, term: term.term }) * 2 +
		scoreField({ field: normalizedFields.groupId, term: term.term }) +
		scoreField({ field: normalizedFields.id, term: term.term });

	return (fieldScore + keywordScore + resourceScore) * term.weight;
}

function scoreField({ field, term }: { field: string; term: string }): number {
	if (field === term) return 24;
	if (field.startsWith(term)) return 16;
	if (field.includes(term)) return 10;
	return 0;
}

function getStateAwareBoost({
	definition,
	state,
}: {
	definition: TextTemplateDefinition;
	state: TextLibraryState;
}): number {
	const recentIndex = state.recentIds.indexOf(definition.id);
	const recentBoost = recentIndex >= 0 ? Math.max(0, 18 - recentIndex * 2) : 0;
	const downloadedBoost =
		getTextTemplateDownloadStatus({ definition, state }) === "cached" ? 14 : 0;
	const favoriteBoost = isTextTemplateFavorite({ definition, state }) ? 16 : 0;
	const premiumBoost = definition.premium ? 3 : 0;
	const heatBoost =
		(HOT_CATEGORY_BOOSTS[definition.category] ?? 0) +
		(HOT_VARIANT_BOOSTS[definition.variantId] ?? 0);

	return (
		recentBoost + downloadedBoost + favoriteBoost + premiumBoost + heatBoost
	);
}
