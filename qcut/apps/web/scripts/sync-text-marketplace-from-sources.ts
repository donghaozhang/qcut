import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextTemplateMarketplaceRemoteConfig,
	TextTemplateMarketplaceRemoteConfigAsset,
	TextTemplateMarketplaceSection,
} from "../src/lib/text/text-marketplace-metadata";
import {
	inferTextAssetCategory,
	readGeneratedManifest,
	type TextAssetGeneratedEntry,
} from "./verify-text-asset-cdn-manifest";

export type TextMarketplaceSourceSyncOptions = {
	generatedManifestPath: string;
	outPath: string;
	publicDir: string;
};

type TextMarketplaceSourceEntry = {
	assetId: string;
	category?: string;
	entry: TextAssetGeneratedEntry;
	marketplace?: TextTemplateMarketplaceRemoteConfigAsset;
	templateId: string;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GENERATED_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_PUBLIC_DIR = join(SCRIPT_DIR, "../public");
const DEFAULT_OUT_PATH = join(
	DEFAULT_PUBLIC_DIR,
	"text-assets/marketplace.json"
);
const SECTION_LIMIT = 30;

export function parseTextMarketplaceSourceSyncArgs({
	argv,
}: {
	argv: string[];
}): TextMarketplaceSourceSyncOptions {
	const options: TextMarketplaceSourceSyncOptions = {
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		outPath: DEFAULT_OUT_PATH,
		publicDir: DEFAULT_PUBLIC_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--generated-manifest") {
			options.generatedManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--out") {
			options.outPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--public-dir") {
			options.publicDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

export async function buildTextMarketplaceConfigFromSources({
	generatedManifest,
	publicDir,
}: {
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	publicDir: string;
}): Promise<TextTemplateMarketplaceRemoteConfig> {
	const sourceEntries = await Promise.all(
		Object.values(generatedManifest).map((entry) =>
			readMarketplaceSourceEntry({ entry, publicDir })
		)
	);
	const assets = sourceEntries.map((sourceEntry) =>
		marketplaceSourceConfigAsset({ sourceEntry })
	);
	return {
		assets,
		schemaVersion: 1,
		sections: buildMarketplaceSourceSections({ sourceEntries }),
	};
}

export async function writeTextMarketplaceConfigFromSources({
	generatedManifestPath,
	outPath,
	publicDir,
}: TextMarketplaceSourceSyncOptions): Promise<TextTemplateMarketplaceRemoteConfig> {
	const generatedManifest = await readGeneratedManifest({
		manifestPath: generatedManifestPath,
	});
	const config = await buildTextMarketplaceConfigFromSources({
		generatedManifest,
		publicDir,
	});
	await writeFile(outPath, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
	return config;
}

async function readMarketplaceSourceEntry({
	entry,
	publicDir,
}: {
	entry: TextAssetGeneratedEntry;
	publicDir: string;
}): Promise<TextMarketplaceSourceEntry> {
	const sourcePath = join(publicDir, entry.source.url.replace(/^\/+/, ""));
	const payload = parseJsonRecord({
		label: `text marketplace source ${entry.assetId}`,
		text: await readFile(sourcePath, "utf8"),
	});
	const definition = recordValue({ record: payload, field: "definition" });
	const templateId =
		stringValue({ record: definition, field: "id" }) ??
		stringValue({ record: payload, field: "templateId" }) ??
		entry.assetId;
	const marketplace = parseMarketplaceAsset({
		assetId: entry.assetId,
		marketplace: recordValue({ record: payload, field: "marketplace" }),
		templateId,
	});
	return {
		assetId: entry.assetId,
		category: inferTextAssetCategory({ entry }),
		entry,
		marketplace,
		templateId,
	};
}

function marketplaceSourceConfigAsset({
	sourceEntry,
}: {
	sourceEntry: TextMarketplaceSourceEntry;
}): TextTemplateMarketplaceRemoteConfigAsset {
	return {
		assetId: sourceEntry.assetId,
		editorialRank: sourceEntry.marketplace?.editorialRank,
		heatScore: sourceEntry.marketplace?.heatScore,
		remoteTags: uniqueValues({
			values: [
				`category:${sourceEntry.category ?? "unknown"}`,
				...(sourceEntry.entry.provenance?.source === "designer-imported"
					? ["source:designer-imported"]
					: []),
				...(sourceEntry.marketplace?.remoteTags ?? []),
			],
		}),
		searchAliases: uniqueValues({
			values: sourceEntry.marketplace?.searchAliases ?? [],
		}),
		templateId: sourceEntry.templateId,
	};
}

function buildMarketplaceSourceSections({
	sourceEntries,
}: {
	sourceEntries: readonly TextMarketplaceSourceEntry[];
}): TextTemplateMarketplaceSection[] {
	const ranked = [...sourceEntries].sort(compareMarketplaceSourceEntries);
	return [
		{
			id: "recommended",
			templateIds: ranked
				.filter((entry) => isRecommendedSourceEntry({ entry }))
				.slice(0, SECTION_LIMIT)
				.map((entry) => entry.templateId),
			title: "推荐",
		},
		{
			id: "designer-imported",
			templateIds: ranked
				.filter(
					(entry) => entry.entry.provenance?.source === "designer-imported"
				)
				.slice(0, SECTION_LIMIT)
				.map((entry) => entry.templateId),
			title: "设计师精选",
		},
		{
			id: "commerce",
			templateIds: ranked
				.filter((entry) =>
					hasMarketplaceTagOrAlias({
						entry,
						values: ["scene:commerce", "直播", "秒杀", "促销", "价格"],
					})
				)
				.slice(0, SECTION_LIMIT)
				.map((entry) => entry.templateId),
			title: "带货促销",
		},
		{
			id: "cover",
			templateIds: ranked
				.filter((entry) =>
					hasMarketplaceTagOrAlias({
						entry,
						values: ["market:hero", "封面"],
					})
				)
				.slice(0, SECTION_LIMIT)
				.map((entry) => entry.templateId),
			title: "封面标题",
		},
	].filter((section) => section.templateIds.length > 0);
}

function compareMarketplaceSourceEntries(
	left: TextMarketplaceSourceEntry,
	right: TextMarketplaceSourceEntry
): number {
	const leftRank = left.marketplace?.editorialRank ?? Number.POSITIVE_INFINITY;
	const rightRank =
		right.marketplace?.editorialRank ?? Number.POSITIVE_INFINITY;
	if (leftRank !== rightRank) return leftRank - rightRank;
	const leftHeat = left.marketplace?.heatScore ?? 0;
	const rightHeat = right.marketplace?.heatScore ?? 0;
	if (leftHeat !== rightHeat) return rightHeat - leftHeat;
	return left.templateId.localeCompare(right.templateId);
}

function isRecommendedSourceEntry({
	entry,
}: {
	entry: TextMarketplaceSourceEntry;
}): boolean {
	if (entry.entry.provenance?.source === "designer-imported") return true;
	if ((entry.marketplace?.editorialRank ?? Number.POSITIVE_INFINITY) <= 12) {
		return true;
	}
	if ((entry.marketplace?.heatScore ?? 0) >= 92) return true;
	return entry.marketplace?.remoteTags?.includes("market:recommended") ?? false;
}

function hasMarketplaceTagOrAlias({
	entry,
	values,
}: {
	entry: TextMarketplaceSourceEntry;
	values: readonly string[];
}): boolean {
	const terms = new Set([
		...(entry.marketplace?.remoteTags ?? []),
		...(entry.marketplace?.searchAliases ?? []),
	]);
	return values.some((value) => terms.has(value));
}

function parseMarketplaceAsset({
	assetId,
	marketplace,
	templateId,
}: {
	assetId: string;
	marketplace?: Record<string, unknown>;
	templateId: string;
}): TextTemplateMarketplaceRemoteConfigAsset | undefined {
	if (!marketplace) return undefined;
	return {
		assetId,
		editorialRank: optionalNumber({ field: "editorialRank", marketplace }),
		heatScore: optionalNumber({ field: "heatScore", marketplace }),
		remoteTags: optionalStringList({ field: "remoteTags", marketplace }),
		searchAliases: optionalStringList({ field: "searchAliases", marketplace }),
		templateId,
	};
}

function parseJsonRecord({
	label,
	text,
}: {
	label: string;
	text: string;
}): Record<string, unknown> {
	const value = JSON.parse(text) as unknown;
	if (!isRecord({ value })) {
		throw new Error(`${label} must be a JSON object`);
	}
	return value;
}

function recordValue({
	field,
	record,
}: {
	field: string;
	record?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
	const value = record?.[field];
	return isRecord({ value }) ? value : undefined;
}

function stringValue({
	field,
	record,
}: {
	field: string;
	record?: Record<string, unknown>;
}): string | undefined {
	const value = record?.[field];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber({
	field,
	marketplace,
}: {
	field: string;
	marketplace: Record<string, unknown>;
}): number | undefined {
	const value = marketplace[field];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function optionalStringList({
	field,
	marketplace,
}: {
	field: string;
	marketplace: Record<string, unknown>;
}): string[] | undefined {
	const value = marketplace[field];
	if (!Array.isArray(value)) return undefined;
	const strings = value.filter(
		(item): item is string => typeof item === "string" && item.length > 0
	);
	return strings.length > 0 ? strings : undefined;
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

function requireValue({
	argv,
	index,
	name,
}: {
	argv: readonly string[];
	index: number;
	name: string;
}): string {
	const value = argv[index + 1];
	if (!value) throw new Error(`Missing value for ${name}`);
	return value;
}

async function main() {
	const config = await writeTextMarketplaceConfigFromSources(
		parseTextMarketplaceSourceSyncArgs({ argv: process.argv.slice(2) })
	);
	console.log(
		`Synced text marketplace config from ${config.assets.length} source files`
	);
}

if (
	process.env.VITEST !== "true" &&
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}
