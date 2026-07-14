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

type SearchIntentGroup = {
	terms: readonly WeightedSearchTerm[];
};

type PinyinAlias = {
	full: string;
	acronym: string;
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
	兰: "lan",
	粉: "fen",
	绿: "lv",
	紫: "zi",
	色: "se",
	瑟: "se",
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
	活: "huo",
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
	炎: "yan",
	疯: "feng",
	朝: "chao",
	建: "jian",
	义: "yi",
	业: "ye",
	开: "kai",
	促: "cu",
	销: "xiao",
	卖: "mai",
	货: "huo",
	高: "gao",
	级: "ji",
	推: "tui",
	荐: "jian",
	甜: "tian",
	心: "xin",
	水: "shui",
	墨: "mo",
	印: "yin",
	爽: "shuang",
	拼: "pin",
	张: "zhang",
	材: "cai",
	探: "tan",
	店: "dian",
	直: "zhi",
	播: "bo",
	封: "feng",
	面: "mian",
	口: "kou",
	价: "jia",
	格: "ge",
	优: "you",
	惠: "hui",
	折: "zhe",
	扣: "kou",
	品: "pin",
	上: "shang",
	教: "jiao",
	程: "cheng",
	知: "zhi",
	识: "shi",
	旅: "lv",
	行: "xing",
	美: "mei",
	食: "shi",
	搞: "gao",
	笑: "xiao",
	种: "zhong",
	草: "cao",
	测: "ce",
	评: "ping",
	课: "ke",
	小: "xiao",
	书: "shu",
	抖: "dou",
	音: "yin",
	快: "kuai",
	手: "shou",
	站: "zhan",
	倒: "dao",
	计: "ji",
	招: "zhao",
	聘: "pin",
	喜: "xi",
	报: "bao",
	券: "quan",
	限: "xian",
	秒: "miao",
	杀: "sha",
	团: "tuan",
	购: "gou",
	会: "hui",
	员: "yuan",
	铺: "pu",
	餐: "can",
	饮: "yin",
	电: "dian",
	商: "shang",
};

const CHINESE_PHRASE_PINYIN_ALIASES: Readonly<Record<string, PinyinAlias>> = {
	必看: { full: "bikan", acronym: "bk" },
	带货: { full: "daihuo", acronym: "dh" },
	到手价: { full: "daoshoujia", acronym: "dsj" },
	地点: { full: "didian", acronym: "dd" },
	电商: { full: "dianshang", acronym: "ds" },
	福利: { full: "fuli", acronym: "fl" },
	高能预警: { full: "gaonengyujing", acronym: "gnyj" },
	感谢观看: { full: "ganxieguankan", acronym: "gxgk" },
	关注: { full: "guanzhu", acronym: "gz" },
	活动: { full: "huodong", acronym: "hd" },
	今日推荐: { full: "jinrituijian", acronym: "jrtj" },
	小红书: { full: "xiaohongshu", acronym: "xhs" },
	抖音: { full: "douyin", acronym: "dy" },
	快手: { full: "kuaishou", acronym: "ks" },
	"b站": { full: "bilibili", acronym: "bz" },
	哔哩哔哩: { full: "bilibili", acronym: "bz" },
	开场: { full: "kaichang", acronym: "kc" },
	片头: { full: "piantou", acronym: "pt" },
	片尾: { full: "pianwei", acronym: "pw" },
	人物介绍: { full: "renwujieshao", acronym: "rwjs" },
	三秒讲清: { full: "sanmiaojiangqing", acronym: "smjq" },
	上新: { full: "shangxin", acronym: "sx" },
	同款链接: { full: "tongkuanlianjie", acronym: "tklj" },
	卖货: { full: "maihuo", acronym: "mh" },
	下期见: { full: "xiaqijian", acronym: "xqj" },
	信息条: { full: "xinxitiao", acronym: "xxt" },
	醒目: { full: "xingmu", acronym: "xm" },
	资料来源: { full: "ziliaolaiyuan", acronym: "zlly" },
};

const QUERY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
	ai: ["智能", "自动", "摘要", "重点"],
	biaoti: ["标题", "封面", "爆款", "醒目"],
	bilibili: ["B站", "教程", "知识", "清单"],
	bling: ["发光", "流光", "鎏金", "梦幻"],
	boom: ["爆红", "漫画", "综艺", "爆炸"],
	bz: ["B站", "教程", "知识", "清单"],
	caption: ["字幕", "文字", "文本", "标题", "花字"],
	captions: ["字幕", "文字", "文本", "标题", "花字"],
	cover: ["封面", "标题", "爆款", "醒目"],
	cyber: ["故障", "赛博", "霓虹"],
	douyin: ["抖音", "口播", "直播", "热门", "综艺"],
	dy: ["抖音", "口播", "直播", "热门", "综艺"],
	glitch: ["故障", "赛博", "抖动"],
	gold: ["金色", "鎏金", "黄色", "高级"],
	hot: ["火焰", "熔岩", "红色", "热血"],
	kuaishou: ["快手", "直播", "带货", "促销"],
	ks: ["快手", "直播", "带货", "促销"],
	live: ["直播", "促销", "价格", "限时"],
	neon: ["发光", "霓虹", "流光"],
	paper: ["撕纸", "纸张", "贴纸"],
	pop: ["综艺", "弹幕", "漫画", "爆款"],
	price: ["价格", "促销", "优惠", "秒杀"],
	purple: ["紫色", "梦幻", "高级"],
	review: ["测评", "对比", "种草", "推荐"],
	red: ["红色", "促销", "热血"],
	sticker: ["贴纸", "白边", "可爱"],
	subtitle: ["字幕", "文字", "文本", "标题", "花字"],
	subtitles: ["字幕", "文字", "文本", "标题", "花字"],
	text: ["文字", "文本", "花字", "标题"],
	thumbnail: ["封面", "标题", "爆款", "醒目"],
	wenzi: ["文字", "文本", "花字", "标题"],
	white: ["白色", "黑白", "干净"],
	xhs: ["小红书", "种草", "探店", "测评", "封面"],
	xiaohongshu: ["小红书", "种草", "探店", "测评", "封面"],
	yellow: ["黄色", "醒目", "高亮"],
	zimu: ["字幕", "文字", "文本", "标题", "花字"],
	b站: ["教程", "知识", "清单"],
	black: ["黑色", "黑白", "高对比"],
	blue: ["蓝色", "科技", "教程"],
	green: ["绿色", "清新", "自然"],
	pink: ["粉色", "可爱", "甜心"],
	冰: ["冰蓝", "玻璃", "蓝色"],
	可爱: ["贴纸", "糖果", "甜心", "气泡"],
	国潮: ["国风", "水墨", "印章", "鎏金"],
	故障: ["glitch", "赛博", "抖动"],
	火: ["火焰", "熔岩", "热血", "红色"],
	价格: ["促销", "优惠", "秒杀", "直播"],
	促销: ["红色", "爆款", "价格", "优惠", "限时"],
	字幕: ["文字", "文本", "标题", "花字"],
	口播: ["标题", "重点", "说明", "字幕"],
	封面: ["标题", "爆款", "醒目", "综艺"],
	探店: ["门店", "美食", "种草", "推荐"],
	教育: ["知识", "教程", "清单", "重点"],
	新品: ["上新", "最新", "推荐", "活动"],
	旅行: ["夏日", "清爽", "自然", "活动"],
	爆款: ["爆红", "热门", "综艺", "漫画"],
	直播: ["促销", "价格", "优惠", "限时"],
	甜: ["粉色", "糖果", "甜心", "气泡"],
	种草: ["推荐", "测评", "探店", "热门"],
	赛博: ["故障", "霓虹", "发光"],
	金: ["金色", "鎏金", "黄色", "高级"],
};

const QUERY_CORRECTIONS: Readonly<Record<string, readonly string[]>> = {
	兰: ["蓝"],
	兰色: ["蓝色"],
	文理: ["纹理"],
	质感文理: ["质感纹理"],
	火炎: ["火焰"],
	故章: ["故障"],
	国疯: ["国风"],
	国朝: ["国潮"],
	建变: ["渐变"],
	综义: ["综艺"],
	只播: ["直播"],
	扣播: ["口播"],
	口波: ["口播"],
	封免: ["封面"],
	丰面: ["封面"],
	探电: ["探店"],
	价各: ["价格"],
	介格: ["价格"],
	粉瑟: ["粉色"],
	红瑟: ["红色"],
	黄瑟: ["黄色"],
	蓝瑟: ["蓝色"],
	紫瑟: ["紫色"],
};

const COMPACT_PINYIN_SEGMENT_PHRASES = [
	"小红书",
	"哔哩哔哩",
	"直播",
	"口播",
	"封面",
	"标题",
	"红色",
	"蓝色",
	"绿色",
	"粉色",
	"紫色",
	"黄色",
	"黑白",
	"价格",
	"促销",
	"优惠",
	"秒杀",
	"带货",
	"电商",
	"种草",
	"探店",
	"测评",
	"教程",
	"知识",
	"清单",
	"综艺",
	"国风",
	"国潮",
	"发光",
	"霓虹",
	"渐变",
	"纹理",
	"质感",
	"高级",
	"火焰",
	"故障",
	"贴纸",
] as const;

const COMPACT_PINYIN_SEGMENT_TERMS = buildCompactPinyinSegmentTerms();

const REMOTE_TAG_SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
	"color:black-white": ["黑白", "高对比", "经典"],
	"color:blue": ["蓝色", "科技", "教程"],
	"color:green": ["绿色", "清新", "自然"],
	"color:pink": ["粉色", "可爱", "甜心"],
	"color:purple": ["紫色", "梦幻", "高级"],
	"color:red": ["红色", "促销", "带货", "电商"],
	"color:yellow": ["黄色", "醒目", "高亮"],
	"effect:fire": ["火焰", "热血", "燃"],
	"effect:glitch": ["故障", "赛博", "抖动"],
	"effect:glow": ["发光", "霓虹", "夜景"],
	"effect:gradient": ["渐变", "流光", "梦幻"],
	"effect:pop": ["综艺", "弹幕", "爆款"],
	"effect:texture": ["纹理", "材质", "质感"],
	"market:hero": ["封面", "标题", "爆款", "醒目"],
	"market:premium-look": ["质感", "高级", "金属"],
	"market:recommended": ["推荐", "热门", "爆款"],
	"scene:commerce": ["电商", "带货", "卖货", "促销", "价格", "优惠"],
	"scene:night": ["夜景", "霓虹", "发光"],
	"scene:variety": ["综艺", "搞笑", "弹幕"],
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
	const intentGroups = buildSearchIntentGroups({ query });
	const minimumIntentCoverage = getMinimumSearchIntentCoverage({
		total: intentGroups.length,
	});

	return definitions
		.map((definition, index) => {
			const scoreResult = scoreTextTemplateDefinition({
				definition,
				intentGroups,
				marketplaceOverrides,
				state,
				terms,
			});
			return {
				definition,
				index,
				intentCoverage: scoreResult.intentCoverage,
				score: scoreResult.score,
			};
		})
		.filter(
			(result) =>
				result.score > 0 && result.intentCoverage >= minimumIntentCoverage
		)
		.sort((left, right) => {
			if (right.intentCoverage !== left.intentCoverage) {
				return right.intentCoverage - left.intentCoverage;
			}
			if (right.score !== left.score) return right.score - left.score;
			return left.index - right.index;
		})
		.map((result) => result.definition);
}

function getMinimumSearchIntentCoverage({ total }: { total: number }): number {
	if (total < 3) return 0;
	return Math.ceil(total / 2);
}

export function buildWeightedSearchTerms({
	query,
}: {
	query: string;
}): WeightedSearchTerm[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return [];
	const rawTerms = tokenizeSearchQuery({ query: normalizedQuery });
	const baseTerms = rawTerms.length > 0 ? rawTerms : [normalizedQuery];
	const weightedTerms = new Map<string, number>();

	for (const term of [normalizedQuery, ...baseTerms]) {
		addSearchTermExpansions({ term, weight: 1, weightedTerms });
		for (const segment of getSegmentedQueryTerms({ term })) {
			addSearchTermExpansions({ term: segment, weight: 0.82, weightedTerms });
		}
	}

	return [...weightedTerms.entries()].map(([term, weight]) => ({
		term,
		weight,
	}));
}

function buildSearchIntentGroups({
	query,
}: {
	query: string;
}): SearchIntentGroup[] {
	const terms = tokenizeSearchQuery({ query });
	const segmentTerms =
		terms.length > 1
			? terms
			: getSegmentedQueryTerms({ term: query.toLocaleLowerCase().trim() });
	if (segmentTerms.length <= 1) return [];
	return segmentTerms.map((term) => ({
		terms: buildWeightedSearchTerms({ query: term }),
	}));
}

function tokenizeSearchQuery({ query }: { query: string }): string[] {
	return query
		.trim()
		.toLocaleLowerCase()
		.split(/[\s,，、/|+_-]+/)
		.filter(Boolean);
}

function addSearchTermExpansions({
	term,
	weight,
	weightedTerms,
}: {
	term: string;
	weight: number;
	weightedTerms: Map<string, number>;
}) {
	addWeightedTerm({ term, weight, weightedTerms });
	addQueryAliases({ term, weight: weight * 0.95, weightedTerms });
	addQueryCorrections({ term, weight: weight * 0.7, weightedTerms });
	for (const synonym of QUERY_SYNONYMS[term] ?? []) {
		addWeightedTerm({
			term: synonym.toLocaleLowerCase(),
			weight: weight * 0.72,
			weightedTerms,
		});
		addQueryAliases({
			term: synonym.toLocaleLowerCase(),
			weight: weight * 0.64,
			weightedTerms,
		});
	}
	for (const reverseAlias of getReversePinyinQueryAliases({ term })) {
		const normalizedAlias = reverseAlias.toLocaleLowerCase();
		addWeightedTerm({
			term: normalizedAlias,
			weight: weight * 0.76,
			weightedTerms,
		});
		addQueryAliases({
			term: normalizedAlias,
			weight: weight * 0.68,
			weightedTerms,
		});
	}
}

function addQueryCorrections({
	term,
	weight,
	weightedTerms,
}: {
	term: string;
	weight: number;
	weightedTerms: Map<string, number>;
}) {
	for (const correction of QUERY_CORRECTIONS[term] ?? []) {
		const normalizedCorrection = correction.toLocaleLowerCase();
		addWeightedTerm({
			term: normalizedCorrection,
			weight,
			weightedTerms,
		});
		addQueryAliases({
			term: normalizedCorrection,
			weight: weight * 0.88,
			weightedTerms,
		});
		for (const synonym of QUERY_SYNONYMS[normalizedCorrection] ?? []) {
			addWeightedTerm({
				term: synonym.toLocaleLowerCase(),
				weight: weight * 0.72,
				weightedTerms,
			});
		}
	}
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
	for (const pinyin of getPinyinAliases({ value: term })) {
		addWeightedTerm({ term: pinyin.full, weight, weightedTerms });
		addWeightedTerm({
			term: pinyin.acronym,
			weight: weight * 0.92,
			weightedTerms,
		});
	}
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

function buildCompactPinyinSegmentTerms(): readonly string[] {
	const terms = new Set<string>();
	for (const phrase of COMPACT_PINYIN_SEGMENT_PHRASES) {
		for (const alias of getPinyinAliases({ value: phrase })) {
			terms.add(alias.full);
			terms.add(alias.acronym);
		}
	}
	for (const alias of Object.values(CHINESE_PHRASE_PINYIN_ALIASES)) {
		terms.add(alias.full);
		terms.add(alias.acronym);
	}
	return [...terms]
		.filter((term) => term.length >= 2)
		.sort((left, right) => right.length - left.length);
}

function getSegmentedQueryTerms({ term }: { term: string }): string[] {
	return [
		...splitCompactPinyinQuery({ term }),
		...splitMixedScriptQuery({ term }),
	];
}

function splitCompactPinyinQuery({ term }: { term: string }): string[] {
	const normalizedTerm = compactLatinTerm({ value: term });
	if (
		normalizedTerm.length < 6 ||
		normalizedTerm !== term ||
		!/^[a-z0-9]+$/.test(normalizedTerm)
	) {
		return [];
	}
	const segments = segmentCompactPinyinTerm({ term: normalizedTerm });
	return segments.length > 1 ? segments : [];
}

function segmentCompactPinyinTerm({ term }: { term: string }): string[] {
	const memo = new Map<number, string[] | undefined>();
	const segmentFrom = ({ index }: { index: number }): string[] | undefined => {
		if (index === term.length) return [];
		if (memo.has(index)) return memo.get(index);
		for (const segment of COMPACT_PINYIN_SEGMENT_TERMS) {
			if (!term.startsWith(segment, index)) continue;
			const next = segmentFrom({ index: index + segment.length });
			if (!next) continue;
			const result = [segment, ...next];
			memo.set(index, result);
			return result;
		}
		memo.set(index, undefined);
		return undefined;
	};
	return segmentFrom({ index: 0 }) ?? [];
}

function splitMixedScriptQuery({ term }: { term: string }): string[] {
	const runs: string[] = [];
	let currentRun = "";
	let currentScript: "han" | "latin" | undefined;

	for (const character of Array.from(term.toLocaleLowerCase().trim())) {
		const script = getSearchCharacterScript({ character });
		if (!script) {
			if (currentRun) runs.push(currentRun);
			currentRun = "";
			currentScript = undefined;
			continue;
		}
		if (currentScript && currentScript !== script) {
			runs.push(currentRun);
			currentRun = character;
			currentScript = script;
			continue;
		}
		currentRun += character;
		currentScript = script;
	}
	if (currentRun) runs.push(currentRun);

	const segments = runs.filter(isUsefulMixedScriptSegment);
	return segments.length > 1 ? segments : [];
}

function getReversePinyinQueryAliases({ term }: { term: string }): string[] {
	const normalizedTerm = compactLatinTerm({ value: term });
	if (normalizedTerm.length < 2) return [];
	const aliases = new Set<string>();
	for (const phrase of COMPACT_PINYIN_SEGMENT_PHRASES) {
		if (pinyinAliasMatchesTerm({ term: normalizedTerm, value: phrase })) {
			aliases.add(phrase);
		}
	}
	for (const [phrase, alias] of Object.entries(CHINESE_PHRASE_PINYIN_ALIASES)) {
		if (normalizedTerm === alias.full || normalizedTerm === alias.acronym) {
			aliases.add(phrase);
		}
	}
	return [...aliases];
}

function pinyinAliasMatchesTerm({
	term,
	value,
}: {
	term: string;
	value: string;
}): boolean {
	return getPinyinAliases({ value }).some(
		(alias) => term === alias.full || term === alias.acronym
	);
}

function getSearchCharacterScript({
	character,
}: {
	character: string;
}): "han" | "latin" | undefined {
	if (isChineseCharacter({ value: character })) return "han";
	return /^[a-z0-9]$/.test(character) ? "latin" : undefined;
}

function isUsefulMixedScriptSegment(segment: string): boolean {
	if (/^[a-z0-9]+$/.test(segment)) return segment.length >= 2;
	if (
		!Array.from(segment).every((character) =>
			isChineseCharacter({ value: character })
		)
	) {
		return false;
	}
	return segment.length >= 2 || Boolean(QUERY_SYNONYMS[segment]);
}

function scoreTextTemplateDefinition({
	definition,
	intentGroups,
	marketplaceOverrides,
	state,
	terms,
}: {
	definition: TextTemplateDefinition;
	intentGroups: readonly SearchIntentGroup[];
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
	state: TextLibraryState;
	terms: readonly WeightedSearchTerm[];
}): { intentCoverage: number; score: number } {
	let score = 0;
	for (const term of terms) {
		score += scoreWeightedTerm({ definition, marketplaceOverrides, term });
	}
	if (score <= 0) return { intentCoverage: 0, score: 0 };
	const intentCoverage = getSearchIntentCoverage({
		definition,
		intentGroups,
		marketplaceOverrides,
	});
	const intentBoost = getSearchIntentBoost({
		coverage: intentCoverage,
		total: intentGroups.length,
	});
	return {
		intentCoverage,
		score:
			score +
			intentBoost +
			getStateAwareBoost({ definition, marketplaceOverrides, state }),
	};
}

function getSearchIntentCoverage({
	definition,
	intentGroups,
	marketplaceOverrides,
}: {
	definition: TextTemplateDefinition;
	intentGroups: readonly SearchIntentGroup[];
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
}): number {
	if (intentGroups.length === 0) return 0;
	let coverage = 0;
	for (const group of intentGroups) {
		const matchesGroup = group.terms.some(
			(term) =>
				scoreWeightedTerm({ definition, marketplaceOverrides, term }) > 0
		);
		if (matchesGroup) coverage += 1;
	}
	return coverage;
}

function getSearchIntentBoost({
	coverage,
	total,
}: {
	coverage: number;
	total: number;
}): number {
	if (total <= 1 || coverage === 0) return 0;
	const completeCoverageBoost = coverage === total ? 48 : 0;
	return coverage * 20 + completeCoverageBoost;
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
	if (field.includes(term) && shouldUseSubstringMatch({ term })) return 10;
	if (shouldUseFuzzyMatch({ field, term })) {
		const distance = boundedLevenshteinDistance({ left: field, right: term });
		if (distance === 1) return 8;
		if (distance === 2 && term.length >= 6) return 5;
	}
	if (shouldUseFuzzySubstringMatch({ field, term })) {
		const distance = boundedSubstringLevenshteinDistance({ field, term });
		if (distance === 1) return 7;
		if (distance === 2 && term.length >= 6) return 4;
	}
	return 0;
}

function shouldUseSubstringMatch({ term }: { term: string }): boolean {
	if (!/^[a-z0-9]+$/.test(term)) return true;
	return term.length > 2;
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
	for (const alias of getRemoteTagSearchAliases({ field })) {
		variants.push({ value: alias, weight: 0.9 });
		for (const pinyin of getPinyinAliases({ value: alias })) {
			variants.push({ value: pinyin.full, weight: 0.78 });
			variants.push({ value: pinyin.acronym, weight: 0.7 });
		}
	}
	for (const pinyin of getPinyinAliases({ value: field })) {
		variants.push({ value: pinyin.full, weight: 0.86 });
		variants.push({ value: pinyin.acronym, weight: 0.78 });
	}
	return variants;
}

function getRemoteTagSearchAliases({
	field,
}: {
	field: string;
}): readonly string[] {
	const normalizedField = field.toLocaleLowerCase();
	return REMOTE_TAG_SEARCH_ALIASES[normalizedField] ?? [];
}

function getPinyinAliases({ value }: { value: string }): PinyinAlias[] {
	const aliases = new Map<string, PinyinAlias>();
	const directAlias = chineseToPinyinAliases({ value });
	if (directAlias) addPinyinAlias({ alias: directAlias, aliases });
	const normalizedValue = value.toLocaleLowerCase();
	for (const [phrase, alias] of Object.entries(CHINESE_PHRASE_PINYIN_ALIASES)) {
		if (normalizedValue.includes(phrase)) {
			addPinyinAlias({ alias, aliases });
		}
	}
	return [...aliases.values()];
}

function addPinyinAlias({
	alias,
	aliases,
}: {
	alias: PinyinAlias;
	aliases: Map<string, PinyinAlias>;
}) {
	aliases.set(`${alias.full}:${alias.acronym}`, alias);
}

function chineseToPinyinAliases({
	value,
}: {
	value: string;
}): PinyinAlias | undefined {
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
		if (isChineseCharacter({ value: character })) return;
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

function isChineseCharacter({ value }: { value: string }): boolean {
	return /\p{Script=Han}/u.test(value);
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

function shouldUseFuzzySubstringMatch({
	field,
	term,
}: {
	field: string;
	term: string;
}): boolean {
	if (term.length < 5 || field.length <= term.length) return false;
	if (!/^[a-z0-9]+$/.test(term) || !/^[a-z0-9]+$/.test(field)) return false;
	return field.length <= 48;
}

function boundedSubstringLevenshteinDistance({
	field,
	term,
}: {
	field: string;
	term: string;
}): number {
	let bestDistance = 3;
	const minimumLength = Math.max(1, term.length - 2);
	const maximumLength = Math.min(field.length, term.length + 2);
	for (let start = 0; start < field.length; start += 1) {
		for (
			let length = minimumLength;
			length <= maximumLength && start + length <= field.length;
			length += 1
		) {
			if (field[start] !== term[0]) continue;
			if (term.length >= 2 && field[start + 1] !== term[1]) continue;
			const distance = boundedLevenshteinDistance({
				left: field.slice(start, start + length),
				right: term,
			});
			bestDistance = Math.min(bestDistance, distance);
			if (bestDistance <= 1) return bestDistance;
		}
	}
	return bestDistance;
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
