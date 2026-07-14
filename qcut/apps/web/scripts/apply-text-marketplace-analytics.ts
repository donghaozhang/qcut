import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTextMarketplaceConfigPayload } from "./generate-text-assets";
import {
	getTextTemplateMarketplaceMetadata,
	type TextTemplateMarketplaceRemoteConfig,
	type TextTemplateMarketplaceRemoteConfigAsset,
	type TextTemplateMarketplaceSection,
} from "../src/lib/text/text-marketplace-metadata";
import { getTextTemplateResource } from "../src/lib/text/text-resource-catalog";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	type TextTemplateDefinition,
} from "../src/lib/text/text-template-registry";

export type TextMarketplaceAnalyticsEvent = {
	assetId?: string;
	downloads?: number;
	favorites?: number;
	impressions?: number;
	remoteTags?: readonly string[];
	searchAliases?: readonly string[];
	searchClicks?: number;
	templateId?: string;
	uses?: number;
};

export type TextMarketplaceAnalyticsPayload = {
	events: readonly TextMarketplaceAnalyticsEvent[];
	generatedAt?: string;
	schemaVersion: 1;
};

type TextMarketplaceAnalyticsScore = {
	definition: TextTemplateDefinition;
	event: TextMarketplaceAnalyticsEvent;
	score: number;
};

const DEFAULT_ANALYTICS_PATH = "dist/text-marketplace-analytics.json";
const DEFAULT_MARKETPLACE_PATH = "public/text-assets/marketplace.json";
const TRENDING_SECTION_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;

export function buildTextMarketplaceConfigWithAnalytics({
	analytics,
	definitions,
}: {
	analytics: TextMarketplaceAnalyticsPayload;
	definitions: readonly TextTemplateDefinition[];
}): TextTemplateMarketplaceRemoteConfig {
	const baseConfig = buildTextMarketplaceConfigPayload({ definitions });
	const analyticsScores = textMarketplaceAnalyticsScores({
		analytics,
		definitions,
	});
	if (analyticsScores.length === 0) return baseConfig;

	const maxScore = Math.max(...analyticsScores.map((item) => item.score));
	const analyticsAssets = new Map<
		string,
		TextTemplateMarketplaceRemoteConfigAsset
	>();
	for (const [index, item] of analyticsScores.entries()) {
		const resource = getTextTemplateResource({ definition: item.definition });
		const baseMetadata = getTextTemplateMarketplaceMetadata({
			definition: item.definition,
		});
		const normalized = normalizedAnalyticsHeat({
			maxScore,
			score: item.score,
		});
		analyticsAssets.set(item.definition.id, {
			assetId: resource.assetId,
			editorialRank: index + 1,
			heatScore: normalized,
			remoteTags: uniqueValues({
				values: [
					...baseMetadata.remoteTags,
					"analytics:observed",
					...(index < TRENDING_SECTION_LIMIT ? ["analytics:trending"] : []),
					...(item.event.remoteTags ?? []),
				],
			}),
			searchAliases: uniqueValues({
				values: [
					...baseMetadata.searchAliases,
					...(item.event.searchAliases ?? []),
				],
			}),
			templateId: item.definition.id,
		});
	}

	const baseAssetByTemplateId = new Map(
		baseConfig.assets.map((asset) => [asset.templateId, asset])
	);
	const assets = definitions.map((definition) => {
		const analyticsAsset = analyticsAssets.get(definition.id);
		return analyticsAsset ?? baseAssetByTemplateId.get(definition.id);
	});
	const presentAssets = assets.filter(
		(asset): asset is TextTemplateMarketplaceRemoteConfigAsset =>
			asset !== undefined
	);
	return {
		assets: presentAssets,
		schemaVersion: 1,
		sections: analyticsMarketplaceSections({
			baseSections: baseConfig.sections,
			scores: analyticsScores,
		}),
	};
}

export function parseTextMarketplaceAnalyticsPayload({
	value,
}: {
	value: unknown;
}): TextMarketplaceAnalyticsPayload {
	if (!isRecord({ value }) || value.schemaVersion !== 1) {
		throw new Error("Text marketplace analytics must use schemaVersion 1");
	}
	if (!Array.isArray(value.events)) {
		throw new Error("Text marketplace analytics requires an events array");
	}
	return {
		events: value.events.map((event, index) =>
			parseTextMarketplaceAnalyticsEvent({ event, index })
		),
		generatedAt: optionalIsoDateString({ field: "generatedAt", value }),
		schemaVersion: 1,
	};
}

export function assertTextMarketplaceAnalyticsFreshness({
	analytics,
	maxAgeHours,
	now = Date.now,
}: {
	analytics: TextMarketplaceAnalyticsPayload;
	maxAgeHours?: number;
	now?: () => number;
}): void {
	if (maxAgeHours === undefined) return;
	if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
		throw new Error("--max-age-hours must be a non-negative number");
	}
	if (!analytics.generatedAt) {
		throw new Error(
			"Text marketplace analytics requires generatedAt when --max-age-hours is set"
		);
	}
	const generatedAtMs = Date.parse(analytics.generatedAt);
	const ageMs = now() - generatedAtMs;
	if (ageMs < -5 * 60 * 1000) {
		throw new Error(
			`Text marketplace analytics generatedAt is in the future: ${analytics.generatedAt}`
		);
	}
	const maxAgeMs = maxAgeHours * HOUR_MS;
	if (ageMs > maxAgeMs) {
		throw new Error(
			`Text marketplace analytics is stale: generatedAt ${analytics.generatedAt} exceeds ${maxAgeHours} hours`
		);
	}
}

function analyticsMarketplaceSections({
	baseSections,
	scores,
}: {
	baseSections: readonly TextTemplateMarketplaceSection[];
	scores: readonly TextMarketplaceAnalyticsScore[];
}): TextTemplateMarketplaceSection[] {
	const trendingScores = scores.slice(0, TRENDING_SECTION_LIMIT);
	const trendingAssetIds = trendingScores.map(
		(item) => getTextTemplateResource({ definition: item.definition }).assetId
	);
	const trendingTemplateIds = trendingScores.map((item) => item.definition.id);
	const sectionsById = new Map(
		baseSections.map((section) => [section.id, section])
	);
	const recommended = sectionsById.get("recommended");
	const mergedRecommendedAssetIds = uniqueValues({
		values: [...trendingAssetIds, ...(recommended?.assetIds ?? [])],
	}).slice(0, TRENDING_SECTION_LIMIT);
	const mergedRecommendedTemplateIds = uniqueValues({
		values: [...trendingTemplateIds, ...(recommended?.templateIds ?? [])],
	}).slice(0, TRENDING_SECTION_LIMIT);
	return [
		{
			assetIds: mergedRecommendedAssetIds,
			id: "recommended",
			templateIds: mergedRecommendedTemplateIds,
			title: recommended?.title ?? "推荐",
		},
		{
			assetIds: trendingAssetIds,
			id: "trending",
			templateIds: trendingTemplateIds,
			title: "实时热门",
		},
		...baseSections.filter((section) => section.id !== "recommended"),
	];
}

function textMarketplaceAnalyticsScores({
	analytics,
	definitions,
}: {
	analytics: TextMarketplaceAnalyticsPayload;
	definitions: readonly TextTemplateDefinition[];
}): TextMarketplaceAnalyticsScore[] {
	const definitionByTemplateId = new Map(
		definitions.map((definition) => [definition.id, definition])
	);
	const definitionByAssetId = new Map(
		definitions.flatMap(
			(definition): Array<[string, TextTemplateDefinition]> => {
				const resource = getTextTemplateResource({ definition });
				return [[resource.assetId, definition]];
			}
		)
	);
	const scoresByDefinitionId = new Map<string, TextMarketplaceAnalyticsScore>();
	for (const event of analytics.events) {
		const definition =
			(event.templateId
				? definitionByTemplateId.get(event.templateId)
				: undefined) ??
			(event.assetId ? definitionByAssetId.get(event.assetId) : undefined);
		if (!definition) continue;
		const score = analyticsScore({ event });
		if (score <= 0) continue;
		const existing = scoresByDefinitionId.get(definition.id);
		scoresByDefinitionId.set(
			definition.id,
			existing
				? {
						definition,
						event: mergeAnalyticsEvents({
							definition,
							events: [existing.event, event],
						}),
						score: existing.score + score,
					}
				: { definition, event, score }
		);
	}
	return Array.from(scoresByDefinitionId.values()).sort((left, right) => {
		if (left.score !== right.score) return right.score - left.score;
		return left.definition.id.localeCompare(right.definition.id);
	});
}

function mergeAnalyticsEvents({
	definition,
	events,
}: {
	definition: TextTemplateDefinition;
	events: readonly TextMarketplaceAnalyticsEvent[];
}): TextMarketplaceAnalyticsEvent {
	return {
		remoteTags: uniqueValues({
			values: events.flatMap((event) => event.remoteTags ?? []),
		}),
		searchAliases: uniqueValues({
			values: events.flatMap((event) => event.searchAliases ?? []),
		}),
		templateId: definition.id,
	};
}

function analyticsScore({
	event,
}: {
	event: TextMarketplaceAnalyticsEvent;
}): number {
	return (
		metric({ value: event.uses }) * 9 +
		metric({ value: event.favorites }) * 7 +
		metric({ value: event.downloads }) * 5 +
		metric({ value: event.searchClicks }) * 3 +
		metric({ value: event.impressions }) * 0.04
	);
}

function normalizedAnalyticsHeat({
	maxScore,
	score,
}: {
	maxScore: number;
	score: number;
}): number {
	if (maxScore <= 0) return 0;
	const ratio = Math.log1p(score) / Math.log1p(maxScore);
	return Math.max(0, Math.min(100, Math.round(40 + ratio * 60)));
}

function metric({ value }: { value: number | undefined }): number {
	if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
	return value;
}

function parseTextMarketplaceAnalyticsEvent({
	event,
	index,
}: {
	event: unknown;
	index: number;
}): TextMarketplaceAnalyticsEvent {
	if (!isRecord({ value: event })) {
		throw new Error(
			`Text marketplace analytics event ${index} must be an object`
		);
	}
	const templateId = optionalString({
		field: "templateId",
		index,
		record: event,
	});
	const assetId = optionalString({ field: "assetId", index, record: event });
	if (!templateId && !assetId) {
		throw new Error(
			`Text marketplace analytics event ${index} requires templateId or assetId`
		);
	}
	return {
		assetId,
		downloads: optionalNumber({ field: "downloads", index, record: event }),
		favorites: optionalNumber({ field: "favorites", index, record: event }),
		impressions: optionalNumber({ field: "impressions", index, record: event }),
		remoteTags: optionalStringList({
			field: "remoteTags",
			index,
			record: event,
		}),
		searchAliases: optionalStringList({
			field: "searchAliases",
			index,
			record: event,
		}),
		searchClicks: optionalNumber({
			field: "searchClicks",
			index,
			record: event,
		}),
		templateId,
		uses: optionalNumber({ field: "uses", index, record: event }),
	};
}

function optionalNumber({
	field,
	index,
	record,
}: {
	field: string;
	index: number;
	record: Record<string, unknown>;
}): number | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(
			`Text marketplace analytics event ${index} has invalid ${field}`
		);
	}
	return value;
}

function optionalString({
	field,
	index,
	record,
}: {
	field: string;
	index: number;
	record: Record<string, unknown>;
}): string | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(
			`Text marketplace analytics event ${index} has invalid ${field}`
		);
	}
	return value;
}

function optionalIsoDateString({
	field,
	value,
}: {
	field: string;
	value: Record<string, unknown>;
}): string | undefined {
	const fieldValue = value[field];
	if (fieldValue === undefined) return undefined;
	if (
		typeof fieldValue !== "string" ||
		fieldValue.length === 0 ||
		Number.isNaN(Date.parse(fieldValue))
	) {
		throw new Error(`Text marketplace analytics has invalid ${field}`);
	}
	return fieldValue;
}

function optionalStringList({
	field,
	index,
	record,
}: {
	field: string;
	index: number;
	record: Record<string, unknown>;
}): string[] | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== "string" || item.length === 0)
	) {
		throw new Error(
			`Text marketplace analytics event ${index} has invalid ${field}`
		);
	}
	return value;
}

function uniqueValues({ values }: { values: readonly string[] }): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function isRecord({
	value,
}: {
	value: unknown;
}): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cliArgValue({
	args,
	name,
}: {
	args: readonly string[];
	name: string;
}): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) return undefined;
	return args[index + 1];
}

function optionalPositiveNumberArg({
	args,
	name,
}: {
	args: readonly string[];
	name: string;
}): number | undefined {
	const value = cliArgValue({ args, name });
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative number`);
	}
	return parsed;
}

async function main() {
	const args = process.argv.slice(2);
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const appDir = resolve(scriptDir, "..");
	const analyticsPath = resolve(
		appDir,
		cliArgValue({ args, name: "--analytics" }) ?? DEFAULT_ANALYTICS_PATH
	);
	const outPath = resolve(
		appDir,
		cliArgValue({ args, name: "--out" }) ?? DEFAULT_MARKETPLACE_PATH
	);
	const analytics = parseTextMarketplaceAnalyticsPayload({
		value: JSON.parse(await readFile(analyticsPath, "utf8")),
	});
	assertTextMarketplaceAnalyticsFreshness({
		analytics,
		maxAgeHours: optionalPositiveNumberArg({
			args,
			name: "--max-age-hours",
		}),
	});
	const config = buildTextMarketplaceConfigWithAnalytics({
		analytics,
		definitions: TEXT_TEMPLATE_DEFINITIONS,
	});
	await writeFile(outPath, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
	const matchedTemplateCount =
		config.sections.find((section) => section.id === "trending")?.assetIds
			?.length ?? 0;
	console.log(
		`Wrote text marketplace config with ${analytics.events.length} analytics rows (${matchedTemplateCount} matched assets) to ${outPath}`
	);
}

if (
	process.env.VITEST !== "true" &&
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}
