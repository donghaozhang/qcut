import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextDesignerAssetPackEntry,
	TextDesignerAssetPackManifest,
} from "./import-text-designer-assets";
import type { TextAssetGeneratedEntry } from "./verify-text-asset-cdn-manifest";
import {
	TEXT_DESIGNER_READY_CATEGORY_IDS,
	TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	inferTextAssetCategory,
	readGeneratedManifest,
} from "./verify-text-asset-cdn-manifest";

export type TextDesignerPackTemplateOptions = {
	assetIds: string[];
	categoryIds: string[];
	generatedManifestPath: string;
	includeCurrentFiles: boolean;
	includeAll: boolean;
	limit?: number;
	outDir: string;
	packageIds: string[];
	perCategoryLimit: number;
	provenance?: TextDesignerPackTemplateProvenanceFilter;
	publicDir: string;
};

export type TextDesignerPackTemplateProvenanceFilter =
	| "designer-imported"
	| "generated";

export type TextDesignerPackTemplateAssetContract = {
	assetId: string;
	cacheKey: string;
	category?: string;
	files: {
		qcutPackage: TextDesignerPackTemplateFileContract;
		source: TextDesignerPackTemplateFileContract;
		thumbnail: TextDesignerPackTemplateFileContract;
	};
	packageId: string;
	version: number;
};

export type TextDesignerPackTemplateFileContract = {
	currentByteSize: number;
	currentChecksumSha256: string;
	currentUrl: string;
	designerPath: string;
	mimeType: string;
};

export type TextDesignerPackTemplate = {
	contracts: TextDesignerPackTemplateAssetContract[];
	manifest: TextDesignerAssetPackManifest;
};

type ResolvedDesignerPackAsset = {
	entry: TextAssetGeneratedEntry;
	packEntry: TextDesignerAssetPackEntry;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GENERATED_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_OUT_DIR = join(SCRIPT_DIR, "../dist/text-designer-pack-template");
const DEFAULT_PUBLIC_DIR = join(SCRIPT_DIR, "../public");

export function parseTextDesignerPackTemplateArgs({
	argv,
}: {
	argv: string[];
}): TextDesignerPackTemplateOptions {
	const options: TextDesignerPackTemplateOptions = {
		assetIds: [],
		categoryIds: [],
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		includeCurrentFiles: false,
		includeAll: false,
		outDir: DEFAULT_OUT_DIR,
		packageIds: [],
		perCategoryLimit: 5,
		publicDir: DEFAULT_PUBLIC_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--all") {
			options.includeAll = true;
			continue;
		}
		if (arg === "--include-current-files") {
			options.includeCurrentFiles = true;
			continue;
		}
		if (arg === "--designer-ready") {
			options.categoryIds = [...TEXT_DESIGNER_READY_CATEGORY_IDS];
			options.includeCurrentFiles = true;
			options.perCategoryLimit = TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY;
			continue;
		}
		if (arg === "--asset-id") {
			options.assetIds.push(requireValue({ argv, index, name: arg }));
			index += 1;
			continue;
		}
		if (arg === "--package-id") {
			options.packageIds.push(requireValue({ argv, index, name: arg }));
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
		if (arg === "--limit") {
			options.limit = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
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
		if (arg === "--out-dir") {
			options.outDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--public-dir") {
			options.publicDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--only-designer-imported") {
			options.provenance = "designer-imported";
			continue;
		}
		if (arg === "--only-generated") {
			options.provenance = "generated";
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (
		options.assetIds.length === 0 &&
		options.categoryIds.length === 0 &&
		options.packageIds.length === 0 &&
		!options.includeAll
	) {
		throw new Error("Pass --asset-id, --package-id, --category, or --all.");
	}
	return {
		...options,
		assetIds: uniqueAssetIds({ assetIds: options.assetIds }),
		categoryIds: uniqueAssetIds({ assetIds: options.categoryIds }),
		packageIds: uniqueAssetIds({ assetIds: options.packageIds }),
	};
}

export function selectTextDesignerPackAssetIds({
	assetIds,
	categoryIds,
	generatedManifest,
	includeAll,
	limit,
	packageIds,
	perCategoryLimit,
	provenance,
}: {
	assetIds: readonly string[];
	categoryIds?: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	includeAll: boolean;
	limit?: number;
	packageIds: readonly string[];
	perCategoryLimit?: number;
	provenance?: TextDesignerPackTemplateProvenanceFilter;
}): string[] {
	const selectedIds = new Set<string>();
	for (const assetId of assetIds) {
		selectedIds.add(assetId);
	}
	for (const assetId of selectTextDesignerPackCategoryAssetIds({
		categoryIds: categoryIds ?? [],
		generatedManifest,
		perCategoryLimit: perCategoryLimit ?? Number.POSITIVE_INFINITY,
		provenance,
	})) {
		selectedIds.add(assetId);
	}
	const selectedPackageIds = new Set(packageIds);
	for (const entry of Object.values(generatedManifest)) {
		if (!entry) continue;
		const selectedByPackage = selectedPackageIds.has(entry.packageId);
		if (!includeAll && !selectedByPackage) continue;
		if (!matchesProvenance({ entry, provenance })) continue;
		selectedIds.add(entry.assetId);
		if (limit !== undefined && selectedIds.size >= limit) break;
	}
	const selected = [...selectedIds];
	return limit === undefined ? selected : selected.slice(0, limit);
}

function selectTextDesignerPackCategoryAssetIds({
	categoryIds,
	generatedManifest,
	perCategoryLimit,
	provenance,
}: {
	categoryIds: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	perCategoryLimit: number;
	provenance?: TextDesignerPackTemplateProvenanceFilter;
}): string[] {
	if (categoryIds.length === 0) return [];
	const selectedIds: string[] = [];
	const selectedCountByCategory = new Map<string, number>();
	const selectedCategories = new Set(categoryIds);
	for (const entry of Object.values(generatedManifest)) {
		if (!matchesProvenance({ entry, provenance })) continue;
		const category = inferTextAssetCategory({ entry });
		if (!category || !selectedCategories.has(category)) continue;
		const selectedCount = selectedCountByCategory.get(category) ?? 0;
		if (selectedCount >= perCategoryLimit) continue;
		selectedCountByCategory.set(category, selectedCount + 1);
		selectedIds.push(entry.assetId);
	}
	return selectedIds;
}

export function buildTextDesignerPackTemplate({
	assetIds,
	generatedManifest,
}: {
	assetIds: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
}): TextDesignerPackTemplate {
	const resolvedAssets = resolveDesignerPackAssets({
		assetIds: uniqueAssetIds({ assetIds }),
		generatedManifest,
	});
	return {
		contracts: resolvedAssets.map(({ entry, packEntry }) =>
			buildAssetContract({ entry, packEntry })
		),
		manifest: {
			assets: resolvedAssets.map(({ packEntry }) => packEntry),
			schemaVersion: 1,
		},
	};
}

export async function writeTextDesignerPackTemplate({
	includeCurrentFiles = false,
	outDir,
	publicDir = DEFAULT_PUBLIC_DIR,
	template,
}: {
	includeCurrentFiles?: boolean;
	outDir: string;
	publicDir?: string;
	template: TextDesignerPackTemplate;
}): Promise<void> {
	const manifestPath = join(outDir, "manifest.json");
	const readmePath = join(outDir, "README.md");
	const contractWrites = template.contracts.map((contract) => ({
		contract,
		path: join(outDir, "assets", contract.assetId, "asset-contract.json"),
	}));
	await Promise.all([
		mkdir(dirname(manifestPath), { recursive: true }),
		...contractWrites.map(({ path }) =>
			mkdir(dirname(path), { recursive: true })
		),
	]);
	await Promise.all([
		writeFile(
			manifestPath,
			`${JSON.stringify(template.manifest, null, "\t")}\n`,
			"utf8"
		),
		writeFile(readmePath, renderReadme({ template }), "utf8"),
		...contractWrites.map(({ contract, path }) =>
			writeFile(path, `${JSON.stringify(contract, null, "\t")}\n`, "utf8")
		),
	]);
	if (includeCurrentFiles) {
		await copyCurrentGeneratedFiles({
			outDir,
			publicDir,
			template,
		});
	}
}

async function copyCurrentGeneratedFiles({
	outDir,
	publicDir,
	template,
}: {
	outDir: string;
	publicDir: string;
	template: TextDesignerPackTemplate;
}): Promise<void> {
	await Promise.all(
		template.contracts.flatMap((contract) =>
			[
				contract.files.thumbnail,
				contract.files.source,
				contract.files.qcutPackage,
			].map(async (file) => {
				const sourcePath = join(publicDir, file.currentUrl.replace(/^\/+/, ""));
				const targetPath = join(outDir, file.designerPath);
				await mkdir(dirname(targetPath), { recursive: true });
				await copyFile(sourcePath, targetPath);
			})
		)
	);
}

function resolveDesignerPackAssets({
	assetIds,
	generatedManifest,
}: {
	assetIds: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
}): ResolvedDesignerPackAsset[] {
	return assetIds.map((assetId) => {
		const entry = generatedManifest[assetId];
		if (!entry) {
			throw new Error(`Unknown text asset id: ${assetId}`);
		}
		if (!entry.qcutPackage) {
			throw new Error(
				`Text asset is missing qcut package metadata: ${assetId}`
			);
		}
		const assetDir = `assets/${assetId}`;
		return {
			entry,
			packEntry: {
				assetId,
				qcutPackage: `${assetDir}/template.qctext`,
				source: `${assetDir}/template.json`,
				thumbnail: `${assetDir}/thumbnail.webp`,
			},
		};
	});
}

function buildAssetContract({
	entry,
	packEntry,
}: {
	entry: TextAssetGeneratedEntry;
	packEntry: TextDesignerAssetPackEntry;
}): TextDesignerPackTemplateAssetContract {
	if (!entry.qcutPackage) {
		throw new Error(
			`Text asset is missing qcut package metadata: ${entry.assetId}`
		);
	}
	return {
		assetId: entry.assetId,
		cacheKey: entry.cacheKey,
		category: inferTextAssetCategory({ entry }),
		files: {
			qcutPackage: {
				currentByteSize: entry.qcutPackage.byteSize,
				currentChecksumSha256: entry.qcutPackage.checksumSha256,
				currentUrl: entry.qcutPackage.url,
				designerPath: packEntry.qcutPackage,
				mimeType: entry.qcutPackage.mimeType,
			},
			source: {
				currentByteSize: entry.source.byteSize,
				currentChecksumSha256: entry.source.checksumSha256,
				currentUrl: entry.source.url,
				designerPath: packEntry.source,
				mimeType: entry.source.mimeType,
			},
			thumbnail: {
				currentByteSize: entry.thumbnail.byteSize,
				currentChecksumSha256: entry.thumbnail.checksumSha256,
				currentUrl: entry.thumbnail.url,
				designerPath: packEntry.thumbnail,
				mimeType: entry.thumbnail.mimeType,
			},
		},
		packageId: entry.packageId,
		version: entry.version,
	};
}

function renderReadme({
	template,
}: {
	template: TextDesignerPackTemplate;
}): string {
	const categoryRows = renderCategoryRows({ template });
	const assetRows = template.contracts
		.map(
			(contract) =>
				`| ${contract.assetId} | ${contract.category ?? "unknown"} | ${contract.packageId} | ${contract.version} | ${contract.cacheKey} |`
		)
		.join("\n");
	return `# QCut Text Designer Pack

Replace the files referenced by \`manifest.json\`, then run:

\`\`\`bash
bun run assets:text:import-designer -- --pack-dir <this-folder> --dry-run --write-plan dist/text-designer-import-plan.json
bun run assets:text:import-designer -- --pack-dir <this-folder>
bun run assets:text:import-designer-ready -- --pack-dir <this-folder> --dry-run
bun run assets:text:verify-cdn
bun run assets:text:verify-designer-ready
bun run assets:text:release-stage
bun run assets:text:verify-stage
bun run assets:text:verify-archive
\`\`\`

Each asset folder contains \`asset-contract.json\` with the required target identity. Keep \`assetId\`, \`packageId\`, \`version\`, and \`cacheKey\` unchanged inside \`template.json\` and \`template.qctext\`. The import step rejects unchanged files by default, so every listed asset must be replaced with a real designer payload.

Use \`--include-current-files\` when creating the pack to include the current generated files at the exact replacement paths. They are references only; designers still need to replace or edit them before import.

## Required Files

| file | requirement |
| --- | --- |
| \`thumbnail.webp\` | Must be a non-empty WebP payload. |
| \`template.json\` | Must keep the target \`assetId\`, \`packageId\`, and text template identity. |
| \`template.qctext\` | Must use \`kind: "qcut-text-template-package"\`, keep the same \`cacheKey\`, and reference \`template.json\` plus \`thumbnail.webp\`. |

The dry-run import writes \`dist/text-designer-import-plan.json\`; review that plan before applying. After import, \`assets:text:release-stage\` builds the CDN handoff folder and archive, while \`assets:text:verify-archive\` verifies the tarball itself.

## Category Quotas

| category | assets |
| --- | ---: |
${categoryRows}

## Asset Contracts

| assetId | category | packageId | version | cacheKey |
| --- | --- | --- | --- | --- |
${assetRows}
`;
}

function renderCategoryRows({
	template,
}: {
	template: TextDesignerPackTemplate;
}): string {
	const countsByCategory = new Map<string, number>();
	for (const contract of template.contracts) {
		const category = contract.category ?? "unknown";
		countsByCategory.set(category, (countsByCategory.get(category) ?? 0) + 1);
	}
	return [...countsByCategory.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([category, count]) => `| ${category} | ${count} |`)
		.join("\n");
}

function uniqueAssetIds({
	assetIds,
}: {
	assetIds: readonly string[];
}): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const assetId of assetIds) {
		if (seen.has(assetId)) {
			continue;
		}
		seen.add(assetId);
		unique.push(assetId);
	}
	return unique;
}

function matchesProvenance({
	entry,
	provenance,
}: {
	entry: TextAssetGeneratedEntry;
	provenance?: TextDesignerPackTemplateProvenanceFilter;
}): boolean {
	if (!provenance) return true;
	const source = entry.provenance?.source ?? "generated";
	return source === provenance;
}

function parsePositiveInteger({
	name,
	value,
}: {
	name: string;
	value: string;
}): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		throw new Error(`${name} requires a positive integer`);
	}
	return parsed;
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
	const options = parseTextDesignerPackTemplateArgs({
		argv: process.argv.slice(2),
	});
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.generatedManifestPath,
	});
	const assetIds = selectTextDesignerPackAssetIds({
		assetIds: options.assetIds,
		categoryIds: options.categoryIds,
		generatedManifest,
		includeAll: options.includeAll,
		limit: options.limit,
		packageIds: options.packageIds,
		perCategoryLimit: options.perCategoryLimit,
		provenance: options.provenance,
	});
	if (assetIds.length === 0) {
		throw new Error("No text assets matched the designer pack selection.");
	}
	const template = buildTextDesignerPackTemplate({
		assetIds,
		generatedManifest,
	});
	await writeTextDesignerPackTemplate({
		includeCurrentFiles: options.includeCurrentFiles,
		outDir: options.outDir,
		publicDir: options.publicDir,
		template,
	});
	console.log(
		JSON.stringify(
			{
				assets: template.contracts.length,
				includeCurrentFiles: options.includeCurrentFiles,
				ok: true,
				outDir: options.outDir,
			},
			null,
			"\t"
		)
	);
}

if (import.meta.main) {
	await main();
}
