import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	inferTextAssetCategory,
	buildDesignerAssetGapReport,
	parsePositiveInteger,
	readGeneratedManifest,
	summarizeDesignerCategoryCoverage,
	summarizeTextAssetProvenance,
	type TextAssetDesignerImportSlot,
	type TextAssetGeneratedEntry,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetContactSheetOptions = {
	assetBasePath: string;
	categoryIds: string[];
	designerAssetsPerCategory: number;
	generatedManifestPath: string;
	outPath: string;
	perCategoryLimit: number;
};

export type TextAssetContactSheetItem = {
	assetId: string;
	category: string;
	imageSrc: string;
	packageId: string;
	provenance: "designer-imported" | "generated" | "missing";
};

export type TextAssetContactSheetCategory = {
	category: string;
	currentDesignerAssets: number;
	requiredDesignerAssets: number;
	missingDesignerAssets: number;
	suggestedImports: TextAssetDesignerImportSlot[];
	items: TextAssetContactSheetItem[];
};

export type TextAssetContactSheetModel = {
	categories: TextAssetContactSheetCategory[];
	designerGapTotal: number;
	generatedAt: string;
	provenance: ReturnType<typeof summarizeTextAssetProvenance>;
	totalItems: number;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GENERATED_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_OUT_PATH = join(
	SCRIPT_DIR,
	"../dist/text-assets-contact-sheet.html"
);
const DEFAULT_ASSET_BASE_PATH = "../public";

export const DEFAULT_TEXT_ASSET_CONTACT_SHEET_CATEGORIES = [
	"popular",
	"latest",
	"summer",
	"variety",
	"guofeng",
	"glow",
	"gradient",
	"texture",
	"red",
	"yellow",
	"black-white",
	"blue",
	"pink",
	"green",
	"purple",
	"headline-template",
	"quote-template",
	"list-template",
	"split-template",
	"timeline-template",
] as const;

export function parseTextAssetContactSheetArgs({
	argv,
}: {
	argv: string[];
}): TextAssetContactSheetOptions {
	const options: TextAssetContactSheetOptions = {
		assetBasePath: DEFAULT_ASSET_BASE_PATH,
		categoryIds: [...DEFAULT_TEXT_ASSET_CONTACT_SHEET_CATEGORIES],
		designerAssetsPerCategory: 5,
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		outPath: DEFAULT_OUT_PATH,
		perCategoryLimit: 5,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--asset-base-path") {
			options.assetBasePath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--category") {
			options.categoryIds.push(requireValue({ argv, index, name: arg }));
			index += 1;
			continue;
		}
		if (arg === "--generated-manifest") {
			options.generatedManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--designer-assets-per-category") {
			options.designerAssetsPerCategory = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--out") {
			options.outPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--per-category-limit") {
			options.perCategoryLimit = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--reset-categories") {
			options.categoryIds = [];
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return {
		...options,
		categoryIds: uniqueStrings({ values: options.categoryIds }),
	};
}

export function buildTextAssetContactSheetModel({
	assetBasePath,
	categoryIds,
	designerAssetsPerCategory = 5,
	generatedAt,
	generatedManifest,
	perCategoryLimit,
}: {
	assetBasePath: string;
	categoryIds: readonly string[];
	designerAssetsPerCategory?: number;
	generatedAt: string;
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	perCategoryLimit: number;
}): TextAssetContactSheetModel {
	const assetsByCategory = groupTextAssetsByCategory({ generatedManifest });
	const designerCoverage = summarizeDesignerCategoryCoverage({
		generatedManifest,
		minDesignerAssetsPerCategory: designerAssetsPerCategory,
		requiredDesignerCategories: categoryIds,
	});
	const designerGapReport = buildDesignerAssetGapReport({
		coverage: designerCoverage,
		generatedAt,
		minDesignerAssetsPerCategory: designerAssetsPerCategory,
		requiredDesignerCategories: categoryIds,
	});
	const designerGapByCategory = new Map(
		designerGapReport.categories.map((category) => [
			category.category,
			category,
		])
	);
	const categories = categoryIds.map((category) => {
		const entries = assetsByCategory.get(category) ?? [];
		const designerGap = designerGapByCategory.get(category);
		return {
			category,
			currentDesignerAssets: designerGap?.current ?? 0,
			missingDesignerAssets: designerGap?.missing ?? designerAssetsPerCategory,
			requiredDesignerAssets:
				designerGap?.required ?? designerAssetsPerCategory,
			suggestedImports: designerGap?.suggestedImports ?? [],
			items: entries.slice(0, perCategoryLimit).map((entry) =>
				contactSheetItemForEntry({
					assetBasePath,
					category,
					entry,
				})
			),
		};
	});
	return {
		categories,
		designerGapTotal: designerGapReport.totalMissing,
		generatedAt,
		provenance: summarizeTextAssetProvenance({ generatedManifest }),
		totalItems: categories.reduce(
			(total, category) => total + category.items.length,
			0
		),
	};
}

function groupTextAssetsByCategory({
	generatedManifest,
}: {
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
}): Map<string, TextAssetGeneratedEntry[]> {
	const assetsByCategory = new Map<string, TextAssetGeneratedEntry[]>();
	for (const entry of Object.values(generatedManifest).sort((left, right) =>
		left.assetId.localeCompare(right.assetId)
	)) {
		const category = inferTextAssetCategory({ entry });
		if (!category) continue;
		const entries = assetsByCategory.get(category) ?? [];
		entries.push(entry);
		assetsByCategory.set(category, entries);
	}
	return assetsByCategory;
}

function contactSheetItemForEntry({
	assetBasePath,
	category,
	entry,
}: {
	assetBasePath: string;
	category: string;
	entry: TextAssetGeneratedEntry;
}): TextAssetContactSheetItem {
	return {
		assetId: entry.assetId,
		category,
		imageSrc: joinUrlPath({
			basePath: assetBasePath,
			url: entry.thumbnail.url,
		}),
		packageId: entry.packageId,
		provenance: entry.provenance?.source ?? "missing",
	};
}

export function renderTextAssetContactSheetHtml({
	model,
	title = "QCut Text Asset Contact Sheet",
}: {
	model: TextAssetContactSheetModel;
	title?: string;
}): string {
	const categorySections = model.categories
		.map((category) => renderCategorySection({ category }))
		.join("\n");
	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml({ value: title })}</title>
	<style>
		:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #181818; color: #f6f6f6; }
		body { margin: 0; background: #181818; }
		main { max-width: 1180px; margin: 0 auto; padding: 24px; }
		header { display: grid; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #303030; padding-bottom: 16px; }
		h1 { margin: 0; font-size: 22px; font-weight: 700; }
		p { margin: 0; color: #a8a8a8; font-size: 13px; }
		.summary { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
		.badge { border: 1px solid #3a3a3a; border-radius: 6px; padding: 5px 8px; background: #232323; color: #d7d7d7; font-size: 12px; }
		.category { margin: 22px 0 0; }
		.category h2 { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 10px; font-size: 14px; color: #e9e9e9; }
		.coverage { color: #8fdde5; font-size: 11px; font-weight: 600; }
		.coverage.missing { color: #fca5a5; }
		.grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
		.card { overflow: hidden; border-radius: 8px; background: #2d2d2d; border: 1px solid #3a3a3a; }
		.thumb { display: grid; place-items: center; aspect-ratio: 1 / 1; background: #3a3a3a; }
		.thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
		.meta { display: grid; gap: 3px; padding: 8px; border-top: 1px solid #3a3a3a; }
		.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #f3f3f3; }
		.provenance { font-size: 10px; color: #8fdde5; text-transform: uppercase; }
		.empty { border: 1px dashed #404040; border-radius: 8px; padding: 18px; color: #8a8a8a; font-size: 12px; }
		.slots { display: grid; gap: 6px; margin-top: 10px; border: 1px dashed #453636; border-radius: 8px; padding: 10px; background: #241f1f; }
		.slots-title { color: #fca5a5; font-size: 11px; font-weight: 700; }
		.slot-list { display: flex; flex-wrap: wrap; gap: 6px; }
		.slot { border-radius: 5px; background: #332727; padding: 4px 6px; color: #e6c7c7; font: 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
		@media (max-width: 860px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
		@media (max-width: 560px) { main { padding: 14px; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	</style>
</head>
<body>
	<main>
		<header>
			<h1>${escapeHtml({ value: title })}</h1>
			<p>Generated at ${escapeHtml({ value: model.generatedAt })}</p>
			<div class="summary">
				<span class="badge">items ${model.totalItems}</span>
				<span class="badge">designer ${model.provenance.designerImported}</span>
				<span class="badge">designer gap ${model.designerGapTotal}</span>
				<span class="badge">generated ${model.provenance.generated}</span>
				<span class="badge">missing provenance ${model.provenance.missingProvenance}</span>
			</div>
		</header>
${categorySections}
	</main>
</body>
</html>
`;
}

function renderCategorySection({
	category,
}: {
	category: TextAssetContactSheetCategory;
}): string {
	const heading = renderCategoryHeading({ category });
	const suggestedImports = renderSuggestedImports({ category });
	if (category.items.length === 0) {
		return `		<section class="category">
			${heading}
			<div class="empty">No assets selected for this category.</div>
${suggestedImports}
		</section>`;
	}
	const cards = category.items
		.map((item) => renderItemCard({ item }))
		.join("\n");
	return `		<section class="category">
			${heading}
			<div class="grid">
${cards}
			</div>
${suggestedImports}
		</section>`;
}

function renderCategoryHeading({
	category,
}: {
	category: TextAssetContactSheetCategory;
}): string {
	const coverageClass =
		category.missingDesignerAssets > 0 ? "coverage missing" : "coverage";
	return `<h2><span>${escapeHtml({ value: category.category })} · ${category.items.length}</span><span class="${coverageClass}">designer ${category.currentDesignerAssets}/${category.requiredDesignerAssets}</span></h2>`;
}

function renderSuggestedImports({
	category,
}: {
	category: TextAssetContactSheetCategory;
}): string {
	if (category.suggestedImports.length === 0) return "";
	const slots = category.suggestedImports
		.map(
			(slot) =>
				`<span class="slot">${escapeHtml({ value: slot.assetId })}</span>`
		)
		.join("");
	return `			<div class="slots">
				<div class="slots-title">Missing designer replacements: ${category.missingDesignerAssets}</div>
				<div class="slot-list">${slots}</div>
			</div>`;
}

function renderItemCard({ item }: { item: TextAssetContactSheetItem }): string {
	return `				<article class="card">
					<div class="thumb"><img src="${escapeAttribute({ value: item.imageSrc })}" alt="${escapeAttribute({ value: item.assetId })}" loading="lazy" /></div>
					<div class="meta">
						<div class="name">${escapeHtml({ value: item.assetId })}</div>
						<div class="provenance">${escapeHtml({ value: item.provenance })}</div>
					</div>
				</article>`;
}

export async function writeTextAssetContactSheet({
	html,
	outPath,
}: {
	html: string;
	outPath: string;
}): Promise<void> {
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, html, "utf8");
}

function joinUrlPath({
	basePath,
	url,
}: {
	basePath: string;
	url: string;
}): string {
	return `${basePath.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

function escapeHtml({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function escapeAttribute({ value }: { value: string }): string {
	return escapeHtml({ value });
}

function uniqueStrings({ values }: { values: readonly string[] }): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const value of values) {
		if (seen.has(value)) continue;
		seen.add(value);
		unique.push(value);
	}
	return unique;
}

function requireValue({
	argv,
	index,
	name,
}: {
	argv: string[];
	index: number;
	name: string;
}): string {
	const value = argv[index + 1];
	if (!value) throw new Error(`${name} requires a value`);
	return value;
}

async function main(): Promise<void> {
	const options = parseTextAssetContactSheetArgs({
		argv: process.argv.slice(2),
	});
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.generatedManifestPath,
	});
	const model = buildTextAssetContactSheetModel({
		assetBasePath: options.assetBasePath,
		categoryIds: options.categoryIds,
		designerAssetsPerCategory: options.designerAssetsPerCategory,
		generatedAt: new Date().toISOString(),
		generatedManifest,
		perCategoryLimit: options.perCategoryLimit,
	});
	await writeTextAssetContactSheet({
		html: renderTextAssetContactSheetHtml({ model }),
		outPath: options.outPath,
	});
	console.log(
		JSON.stringify(
			{
				categories: model.categories.length,
				ok: true,
				outPath: options.outPath,
				totalItems: model.totalItems,
			},
			null,
			"\t"
		)
	);
}

if (import.meta.main) {
	await main();
}
