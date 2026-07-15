import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
	TextDesignerAssetPackEntry,
	TextDesignerAssetPackManifest,
} from "./import-text-designer-assets";
import type { TextAssetGeneratedEntry } from "./verify-text-asset-cdn-manifest";
import {
	TEXT_DESIGNER_READY_CATEGORY_IDS,
	TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	buildDesignerAssetGapReport,
	inferTextAssetCategory,
	readGeneratedManifest,
	summarizeDesignerCategoryCoverage,
} from "./verify-text-asset-cdn-manifest";

export type TextDesignerPackTemplateOptions = {
	archivePath?: string;
	assetIds: string[];
	categoryIds: string[];
	generatedManifestPath: string;
	includeContactSheet: boolean;
	includeCurrentFiles: boolean;
	includeAll: boolean;
	limit?: number;
	outDir: string;
	packageIds: string[];
	perCategoryLimit: number;
	provenance?: TextDesignerPackTemplateProvenanceFilter;
	publicDir: string;
	useDesignerGapReport: boolean;
};

export type TextDesignerPackTemplateArchiveSummary = {
	archivePath: string;
	fileCount: number;
	format: "tar.gz";
};

export type TextDesignerPackTemplateProvenanceFilter =
	| "designer-imported"
	| "generated";

export type TextDesignerPackTemplateAssetContract = {
	assetId: string;
	cacheKey: string;
	category?: string;
	designBrief: TextDesignerPackTemplateCategoryDesignBrief;
	files: {
		qcutPackage: TextDesignerPackTemplateFileContract;
		source: TextDesignerPackTemplateFileContract;
		thumbnail: TextDesignerPackTemplateFileContract;
	};
	packageId: string;
	qctextResources: {
		source: TextDesignerPackTemplatePackageResourceContract;
		thumbnail: TextDesignerPackTemplatePackageResourceContract;
	};
	version: number;
};

export type TextDesignerPackTemplateFileContract = {
	currentByteSize: number;
	currentChecksumSha256: string;
	currentUrl: string;
	designerPath: string;
	mimeType: string;
	rejectsCurrentChecksumSha256: string;
	replacementRequired: true;
};

export type TextDesignerPackTemplatePackageResourceContract = {
	mimeType: string;
	path: string;
	role: "source" | "thumbnail";
	targetUrl: string;
};

export type TextDesignerPackTemplate = {
	contracts: TextDesignerPackTemplateAssetContract[];
	manifest: TextDesignerAssetPackManifest;
	summary: TextDesignerPackTemplateSummary;
};

export type TextDesignerPackTemplateSummary = {
	assets: number;
	categoryDesignBriefs: Record<
		string,
		TextDesignerPackTemplateCategoryDesignBrief
	>;
	categoryCounts: Record<string, number>;
	expectedDesignerImportedAssets: number;
	requiredReplacementFiles: number;
	schemaVersion: 1;
};

export type TextDesignerPackTemplateCategoryDesignBrief = {
	templateDirection: string;
	thumbnailDirection: string;
	visualGoal: string;
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
const execFileAsync = promisify(execFile);
const REQUIRED_REPLACEMENT_FILES_PER_ASSET = 3;

const DEFAULT_CATEGORY_DESIGN_BRIEF = {
	templateDirection:
		"Keep the text editable, centered in the safe area, and reusable across short-video canvases.",
	thumbnailDirection:
		"Export a transparent or dark-compatible WebP preview that clearly shows the final text effect at library-card size.",
	visualGoal:
		"Create a polished designer text asset that is visibly distinct from the generated fallback.",
} as const satisfies TextDesignerPackTemplateCategoryDesignBrief;

const CATEGORY_DESIGN_BRIEFS: Readonly<
	Record<string, TextDesignerPackTemplateCategoryDesignBrief>
> = {
	"black-white": {
		templateDirection:
			"Use high-contrast strokes, cutout shadows, or editorial poster typography without adding color dependency.",
		thumbnailDirection:
			"Show crisp white/black layering with visible contour, shadow, and edge separation.",
		visualGoal:
			"Classic high-contrast title cards for serious, review, and comparison content.",
	},
	blue: {
		templateDirection:
			"Use cool highlights, tech panels, ice edges, or knowledge-video accents while keeping text legible.",
		thumbnailDirection:
			"Make the blue tone immediately recognizable with glow, bevel, or frosted edges.",
		visualGoal:
			"Tech, tutorial, and knowledge-video text with a cool premium feel.",
	},
	glow: {
		templateDirection:
			"Use layered bloom, neon outlines, and luminous shadows without flattening the editable text.",
		thumbnailDirection:
			"Show a clear neon halo and dark-scene contrast, similar to marketplace glow assets.",
		visualGoal:
			"Night-scene and high-energy glowing text that reads at small card size.",
	},
	gradient: {
		templateDirection:
			"Use multi-stop color fills, shine passes, bevels, or glassy overlays with consistent edge contrast.",
		thumbnailDirection:
			"Make the gradient direction and highlight treatment obvious in the thumbnail.",
		visualGoal:
			"Glossy gradient text for modern creator covers and promotional moments.",
	},
	green: {
		templateDirection:
			"Use fresh, natural, outdoor, or lifestyle accents while avoiding low-contrast green-on-dark text.",
		thumbnailDirection:
			"Show freshness through leaf-like shapes, soft highlights, or clean green outlines.",
		visualGoal: "Fresh lifestyle, travel, food, and shop-visit text assets.",
	},
	guofeng: {
		templateDirection:
			"Use ink, seal, brush, paper, or guochao motifs while keeping the text editable and modern.",
		thumbnailDirection:
			"Make brush texture, seal red, or ink-paper contrast visible without muddy edges.",
		visualGoal:
			"Chinese-style designer text with cultural texture and short-video punch.",
	},
	latest: {
		templateDirection:
			"Use launch, badge, new-arrival, or editorial accents that work for release announcements.",
		thumbnailDirection:
			"Make the asset feel new and sharp through badge shapes, shine, or clean announcement framing.",
		visualGoal: "New-arrival and update text assets for fast browsing.",
	},
	pink: {
		templateDirection:
			"Use sweet, cute, heart, candy, or soft sticker styling without sacrificing stroke readability.",
		thumbnailDirection:
			"Show pink softness with clear white edge separation and playful accent shapes.",
		visualGoal: "Cute lifestyle and sweet creator text assets.",
	},
	popular: {
		templateDirection:
			"Use bold cover-style hierarchy, stickers, burst shapes, or strong outlines for high click-through contexts.",
		thumbnailDirection:
			"Make the thumbnail feel like a finished hot-list asset, not a plain styled word.",
		visualGoal:
			"Hot, recommended, and cover-ready text assets that look marketplace-selected.",
	},
	purple: {
		templateDirection:
			"Use dreamy, premium, or fantasy accents with enough contrast for small previews.",
		thumbnailDirection:
			"Show purple depth through glow, bevel, glass, or gradient layers.",
		visualGoal:
			"Dreamy premium text for beauty, mood, and polished creator videos.",
	},
	red: {
		templateDirection:
			"Use sale, warning, fire, or hot-list treatments with strong edges and energetic emphasis.",
		thumbnailDirection:
			"Make red urgency obvious with burst, flame, sticker, or price-promo accents.",
		visualGoal:
			"Commerce, live-selling, and urgent cover text with strong red impact.",
	},
	summer: {
		templateDirection:
			"Use fresh seasonal colors, water, sun, fruit, or travel accents while keeping text reusable.",
		thumbnailDirection:
			"Show a bright seasonal feeling with clean contrast and light decorative elements.",
		visualGoal: "Summer campaign and travel/lifestyle text assets.",
	},
	texture: {
		templateDirection:
			"Use material surfaces such as grain, paper, chrome, torn edges, or tactile shadows.",
		thumbnailDirection:
			"Make the texture readable at asset-card scale with visible surface detail.",
		visualGoal:
			"Premium material text assets with clear designer-made texture.",
	},
	variety: {
		templateDirection:
			"Use pop-show, reaction, comic, barrage, or exaggerated entertainment styling.",
		thumbnailDirection:
			"Show motion-like energy through bursts, offsets, stickers, or layered comic shapes.",
		visualGoal: "Variety-show and entertainment text with playful high energy.",
	},
	yellow: {
		templateDirection:
			"Use highlight, price, warning, or bright-cover styling with strong dark or white outlines.",
		thumbnailDirection:
			"Make the yellow pop while preserving edge contrast and small-size readability.",
		visualGoal:
			"Eye-catching highlight text for cover, price, and callout moments.",
	},
	"headline-template": {
		templateDirection:
			"Design a complete title group with kicker, headline, subhead, and decorations aligned as one reusable pack.",
		thumbnailDirection:
			"Preview the full title/subtitle/decorative composition, not only the headline word.",
		visualGoal:
			"Editorial headline template packs with clear multi-line hierarchy.",
	},
	"list-template": {
		templateDirection:
			"Design repeatable list rows, numbering, check marks, or bullets with editable line text.",
		thumbnailDirection:
			"Show at least two list rows and the decorative list system in the thumbnail.",
		visualGoal:
			"List and checklist template packs for explainers and recommendations.",
	},
	"quote-template": {
		templateDirection:
			"Design quotation marks, speaker labels, or pull-quote framing around editable quote text.",
		thumbnailDirection:
			"Show the quote frame and text relationship clearly at card size.",
		visualGoal: "Pull-quote and citation template packs with refined framing.",
	},
	"split-template": {
		templateDirection:
			"Design two-column or before/after structures with clear visual separation and editable labels.",
		thumbnailDirection:
			"Show both sides of the comparison with visible divider or panel treatment.",
		visualGoal:
			"Split-screen comparison template packs for contrast and analysis.",
	},
	"timeline-template": {
		templateDirection:
			"Design staged steps, dots, connectors, or timeline labels with editable milestone text.",
		thumbnailDirection:
			"Show the connector structure and at least three timeline points in the card preview.",
		visualGoal:
			"Timeline and process template packs for structured storytelling.",
	},
};

export function parseTextDesignerPackTemplateArgs({
	argv,
}: {
	argv: string[];
}): TextDesignerPackTemplateOptions {
	const options: TextDesignerPackTemplateOptions = {
		assetIds: [],
		categoryIds: [],
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		includeContactSheet: false,
		includeCurrentFiles: false,
		includeAll: false,
		outDir: DEFAULT_OUT_DIR,
		packageIds: [],
		perCategoryLimit: 5,
		publicDir: DEFAULT_PUBLIC_DIR,
		useDesignerGapReport: false,
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
		if (arg === "--include-contact-sheet") {
			options.includeContactSheet = true;
			continue;
		}
		if (arg === "--designer-ready") {
			options.categoryIds = [...TEXT_DESIGNER_READY_CATEGORY_IDS];
			options.includeContactSheet = true;
			options.includeCurrentFiles = true;
			options.perCategoryLimit = TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY;
			options.useDesignerGapReport = true;
			continue;
		}
		if (arg === "--from-designer-gap-report") {
			options.useDesignerGapReport = true;
			continue;
		}
		if (arg === "--asset-id") {
			options.assetIds.push(requireValue({ argv, index, name: arg }));
			index += 1;
			continue;
		}
		if (arg === "--archive-path") {
			options.archivePath = requireValue({ argv, index, name: arg });
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
	useDesignerGapReport = false,
}: {
	assetIds: readonly string[];
	categoryIds?: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	includeAll: boolean;
	limit?: number;
	packageIds: readonly string[];
	perCategoryLimit?: number;
	provenance?: TextDesignerPackTemplateProvenanceFilter;
	useDesignerGapReport?: boolean;
}): string[] {
	const selectedIds = new Set<string>();
	for (const assetId of assetIds) {
		selectedIds.add(assetId);
	}
	const selectedCategoryAssetIds = useDesignerGapReport
		? selectTextDesignerGapReportAssetIds({
				categoryIds: categoryIds ?? [],
				generatedManifest,
				perCategoryLimit: perCategoryLimit ?? 1,
			})
		: selectTextDesignerPackCategoryAssetIds({
				categoryIds: categoryIds ?? [],
				generatedManifest,
				perCategoryLimit: perCategoryLimit ?? Number.POSITIVE_INFINITY,
				provenance,
			});
	for (const assetId of selectedCategoryAssetIds) {
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

function selectTextDesignerGapReportAssetIds({
	categoryIds,
	generatedManifest,
	perCategoryLimit,
}: {
	categoryIds: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	perCategoryLimit: number;
}): string[] {
	if (categoryIds.length === 0) return [];
	const coverage = summarizeDesignerCategoryCoverage({
		generatedManifest,
		minDesignerAssetsPerCategory: perCategoryLimit,
		requiredDesignerCategories: categoryIds,
	});
	const report = buildDesignerAssetGapReport({
		coverage,
		generatedAt: new Date(0).toISOString(),
		generatedManifest,
		minDesignerAssetsPerCategory: perCategoryLimit,
		requiredDesignerCategories: categoryIds,
	});
	return report.categories.flatMap((category) =>
		category.suggestedImports
			.map((slot) => slot.assetId)
			.filter((assetId) => generatedManifest[assetId])
	);
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
	const contracts = resolvedAssets.map(({ entry, packEntry }) =>
		buildAssetContract({ entry, packEntry })
	);
	return {
		contracts,
		manifest: {
			assets: resolvedAssets.map(({ packEntry }) => packEntry),
			schemaVersion: 1,
		},
		summary: buildPackTemplateSummary({ contracts }),
	};
}

export async function writeTextDesignerPackTemplate({
	includeContactSheet = false,
	includeCurrentFiles = false,
	outDir,
	publicDir = DEFAULT_PUBLIC_DIR,
	template,
}: {
	includeContactSheet?: boolean;
	includeCurrentFiles?: boolean;
	outDir: string;
	publicDir?: string;
	template: TextDesignerPackTemplate;
}): Promise<void> {
	const manifestPath = join(outDir, "manifest.json");
	const summaryPath = join(outDir, "pack-summary.json");
	const readmePath = join(outDir, "README.md");
	const checklistPath = join(outDir, "replacement-checklist.csv");
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
		writeFile(
			summaryPath,
			`${JSON.stringify(template.summary, null, "\t")}\n`,
			"utf8"
		),
		writeFile(readmePath, renderReadme({ template }), "utf8"),
		writeFile(
			checklistPath,
			renderReplacementChecklistCsv({ template }),
			"utf8"
		),
		...contractWrites.map(({ contract, path }) =>
			writeFile(path, `${JSON.stringify(contract, null, "\t")}\n`, "utf8")
		),
		includeContactSheet
			? writeFile(
					join(outDir, "CONTACT_SHEET.html"),
					renderContactSheetHtml({ template }),
					"utf8"
				)
			: Promise.resolve(),
	]);
	if (includeCurrentFiles) {
		await copyCurrentGeneratedFiles({
			outDir,
			publicDir,
			template,
		});
	}
}

export async function createTextDesignerPackTemplateArchive({
	archivePath,
	command = "tar",
	outDir,
}: {
	archivePath: string;
	command?: string;
	outDir: string;
}): Promise<TextDesignerPackTemplateArchiveSummary> {
	const resolvedOutDir = resolve(outDir);
	const resolvedArchivePath = resolve(archivePath);
	const archiveRelativeToOutDir = relative(resolvedOutDir, resolvedArchivePath);
	if (
		archiveRelativeToOutDir === "" ||
		(!archiveRelativeToOutDir.startsWith("..") &&
			!archiveRelativeToOutDir.startsWith("/"))
	) {
		throw new Error("--archive-path must be outside --out-dir");
	}
	await mkdir(dirname(resolvedArchivePath), { recursive: true });
	const fileCount = await countFiles({ dir: resolvedOutDir });
	await execFileAsync(
		command,
		["-czf", resolvedArchivePath, "-C", outDir, "."],
		{
			maxBuffer: 1024 * 1024,
		}
	);
	return {
		archivePath: resolvedArchivePath,
		fileCount,
		format: "tar.gz",
	};
}

async function countFiles({ dir }: { dir: string }): Promise<number> {
	const entries = await readdir(dir, { withFileTypes: true });
	const counts = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return countFiles({ dir: path });
			return entry.isFile() ? 1 : 0;
		})
	);
	return counts.reduce((total, count) => total + count, 0);
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
	const category = inferTextAssetCategory({ entry });
	return {
		assetId: entry.assetId,
		cacheKey: entry.cacheKey,
		category,
		designBrief: getCategoryDesignBrief({ category }),
		files: {
			qcutPackage: {
				currentByteSize: entry.qcutPackage.byteSize,
				currentChecksumSha256: entry.qcutPackage.checksumSha256,
				currentUrl: entry.qcutPackage.url,
				designerPath: packEntry.qcutPackage,
				mimeType: entry.qcutPackage.mimeType,
				rejectsCurrentChecksumSha256: entry.qcutPackage.checksumSha256,
				replacementRequired: true,
			},
			source: {
				currentByteSize: entry.source.byteSize,
				currentChecksumSha256: entry.source.checksumSha256,
				currentUrl: entry.source.url,
				designerPath: packEntry.source,
				mimeType: entry.source.mimeType,
				rejectsCurrentChecksumSha256: entry.source.checksumSha256,
				replacementRequired: true,
			},
			thumbnail: {
				currentByteSize: entry.thumbnail.byteSize,
				currentChecksumSha256: entry.thumbnail.checksumSha256,
				currentUrl: entry.thumbnail.url,
				designerPath: packEntry.thumbnail,
				mimeType: entry.thumbnail.mimeType,
				rejectsCurrentChecksumSha256: entry.thumbnail.checksumSha256,
				replacementRequired: true,
			},
		},
		packageId: entry.packageId,
		qctextResources: {
			source: {
				mimeType: entry.source.mimeType,
				path: basename(entry.source.url),
				role: "source",
				targetUrl: entry.source.url,
			},
			thumbnail: {
				mimeType: entry.thumbnail.mimeType,
				path: basename(entry.thumbnail.url),
				role: "thumbnail",
				targetUrl: entry.thumbnail.url,
			},
		},
		version: entry.version,
	};
}

function buildPackTemplateSummary({
	contracts,
}: {
	contracts: readonly TextDesignerPackTemplateAssetContract[];
}): TextDesignerPackTemplateSummary {
	const categoryCounts: Record<string, number> = {};
	const categoryDesignBriefs: Record<
		string,
		TextDesignerPackTemplateCategoryDesignBrief
	> = {};
	for (const contract of contracts) {
		const category = contract.category ?? "unknown";
		categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
		categoryDesignBriefs[category] = contract.designBrief;
	}
	return {
		assets: contracts.length,
		categoryDesignBriefs,
		categoryCounts,
		expectedDesignerImportedAssets: contracts.length,
		requiredReplacementFiles:
			contracts.length * REQUIRED_REPLACEMENT_FILES_PER_ASSET,
		schemaVersion: 1,
	};
}

function getCategoryDesignBrief({
	category,
}: {
	category?: string;
}): TextDesignerPackTemplateCategoryDesignBrief {
	if (!category) return DEFAULT_CATEGORY_DESIGN_BRIEF;
	return CATEGORY_DESIGN_BRIEFS[category] ?? DEFAULT_CATEGORY_DESIGN_BRIEF;
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
bun run assets:text:import-designer -- --pack-archive <designer-pack.tar.gz> --dry-run --write-plan dist/text-designer-import-plan.json
bun run assets:text:import-designer-ready -- --pack-dir <this-folder> --dry-run
bun run assets:text:verify-cdn
bun run assets:text:verify-designer-ready
bun run assets:text:release-stage
bun run assets:text:verify-stage
bun run assets:text:verify-archive
\`\`\`

Each asset folder contains \`asset-contract.json\` with the required target identity and per-file \`replacementRequired\` plus \`rejectsCurrentChecksumSha256\` fields. \`pack-summary.json\` records the expected imported asset count and replacement file count for handoff review. Keep \`assetId\`, \`packageId\`, \`version\`, and \`cacheKey\` unchanged inside \`template.json\` and \`template.qctext\`. The import step rejects unchanged files by default, so every listed asset must be replaced with a real designer payload.

Use \`replacement-checklist.csv\` as the production handoff tracker. It lists each replacement target folder, category, cache key, and the three required file paths so design, generation, and import review can reconcile the same 100-slot checklist.

Use \`--include-current-files\` when creating the pack to include the current generated files at the exact replacement paths. They are references only; designers still need to replace or edit them before import.

Designer-ready pack templates use the same actionable replacement slots as \`assets:text:designer-gap-report\`, so the exported folders match the assets that currently block \`assets:text:verify-designer-ready\`.

When \`CONTACT_SHEET.html\` is present, open it to review the selected categories, current thumbnails, and exact replacement folders.

## Required Files

| file | requirement |
| --- | --- |
| \`thumbnail.webp\` | Must be a non-empty WebP payload. |
| \`template.json\` | Must keep the target \`assetId\`, \`packageId\`, and text template identity. |
| \`template.qctext\` | Must use \`kind: "qcut-text-template-package"\`, keep the same \`cacheKey\`, reference \`template.json\` plus \`thumbnail.webp\`, and keep \`resources[]\` in sync with the replacement files. |

Inside \`template.qctext\`, \`resources[]\` must include exactly the source and thumbnail companion files described by each asset's \`asset-contract.json.qctextResources\`. The import, stage, and archive verifiers all reject packages whose resource byte size, SHA-256, MIME type, path, or URL drifts from the actual files.

The dry-run import writes \`dist/text-designer-import-plan.json\`; review that plan before applying. The import step syncs \`text-assets/marketplace.json\` from the imported source files by default; pass \`--skip-marketplace-sync\` only when intentionally updating it separately. After import, \`assets:text:release-stage\` builds the CDN handoff folder and archive, while \`assets:text:verify-archive\` verifies the tarball itself.

## Category Quotas

| category | assets | required files | visual goal |
| --- | ---: | ---: | --- |
${categoryRows}

## Asset Contracts

| assetId | category | packageId | version | cacheKey |
| --- | --- | --- | --- | --- |
${assetRows}
`;
}

function renderReplacementChecklistCsv({
	template,
}: {
	template: TextDesignerPackTemplate;
}): string {
	const header = [
		"assetId",
		"category",
		"packageId",
		"version",
		"cacheKey",
		"targetDirectory",
		"visualGoal",
		"thumbnailPath",
		"sourcePath",
		"qcutPackagePath",
		"requiredFiles",
	];
	const rows = template.contracts.map((contract) => {
		const targetDirectory = dirname(contract.files.thumbnail.designerPath);
		return [
			contract.assetId,
			contract.category ?? "unknown",
			contract.packageId,
			String(contract.version),
			contract.cacheKey,
			targetDirectory,
			contract.designBrief.visualGoal,
			contract.files.thumbnail.designerPath,
			contract.files.source.designerPath,
			contract.files.qcutPackage.designerPath,
			"thumbnail.webp;template.json;template.qctext",
		];
	});
	return [header, ...rows]
		.map((row) => row.map((value) => escapeCsvValue({ value })).join(","))
		.join("\n")
		.concat("\n");
}

function escapeCsvValue({ value }: { value: string }): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function renderContactSheetHtml({
	template,
}: {
	template: TextDesignerPackTemplate;
}): string {
	const categorySections = renderContactSheetCategorySections({ template });
	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>QCut Text Designer Pack Contact Sheet</title>
	<style>
		:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1f1f1f; color: #f6f6f6; }
		body { margin: 0; background: #1f1f1f; }
		main { max-width: 1180px; margin: 0 auto; padding: 24px; }
		header { display: grid; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid #343434; padding-bottom: 16px; }
		h1 { margin: 0; font-size: 22px; }
		p { margin: 0; color: #adadad; font-size: 13px; }
		.category { margin-top: 22px; }
		h2 { margin: 0 0 10px; font-size: 14px; color: #e8e8e8; }
		.brief { margin: -4px 0 12px; display: grid; gap: 4px; color: #c7c7c7; font-size: 12px; line-height: 1.45; }
		.brief strong { color: #f4f4f4; font-weight: 600; }
		.grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
		.card { overflow: hidden; border: 1px solid #3a3a3a; border-radius: 8px; background: #2e2e2e; }
		.thumb { aspect-ratio: 1 / 1; background: #3a3a3a; display: grid; place-items: center; }
		.thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
		.meta { display: grid; gap: 3px; padding: 8px; border-top: 1px solid #3a3a3a; }
		.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #f2f2f2; }
		.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #9ddbe4; }
		@media (max-width: 860px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
		@media (max-width: 560px) { main { padding: 14px; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	</style>
</head>
<body>
	<main>
		<header>
			<h1>QCut Text Designer Pack Contact Sheet</h1>
			<p>${template.contracts.length} selected text assets. Replace each thumbnail.webp, template.json, and template.qctext in place.</p>
		</header>
${categorySections}
	</main>
</body>
</html>
`;
}

function renderContactSheetCategorySections({
	template,
}: {
	template: TextDesignerPackTemplate;
}): string {
	const contractsByCategory = new Map<
		string,
		TextDesignerPackTemplateAssetContract[]
	>();
	for (const contract of template.contracts) {
		const category = contract.category ?? "unknown";
		contractsByCategory.set(category, [
			...(contractsByCategory.get(category) ?? []),
			contract,
		]);
	}
	return [...contractsByCategory.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([category, contracts]) => {
			const brief = getCategoryDesignBrief({ category });
			return `		<section class="category">
			<h2>${escapeHtml({ value: category })} / ${contracts.length}</h2>
			<div class="brief">
				<div><strong>Goal:</strong> ${escapeHtml({ value: brief.visualGoal })}</div>
				<div><strong>Thumbnail:</strong> ${escapeHtml({ value: brief.thumbnailDirection })}</div>
			</div>
			<div class="grid">
${contracts.map((contract) => renderContactSheetCard({ contract })).join("\n")}
			</div>
		</section>`;
		})
		.join("\n");
}

function renderContactSheetCard({
	contract,
}: {
	contract: TextDesignerPackTemplateAssetContract;
}): string {
	return `				<article class="card">
					<div class="thumb"><img src="${escapeAttribute({ value: contract.files.thumbnail.designerPath })}" alt="${escapeAttribute({ value: contract.assetId })}" loading="lazy" /></div>
					<div class="meta">
						<div class="name">${escapeHtml({ value: contract.assetId })}</div>
						<div class="path">${escapeHtml({ value: contract.files.thumbnail.designerPath })}</div>
					</div>
				</article>`;
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
	const rows = [...countsByCategory.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([category, count]) => {
			const brief = getCategoryDesignBrief({ category });
			return `| ${category} | ${count} | ${count * REQUIRED_REPLACEMENT_FILES_PER_ASSET} | ${brief.visualGoal} |`;
		});
	rows.push(
		`| total | ${template.summary.assets} | ${template.summary.requiredReplacementFiles} | (see category rows) |`
	);
	return rows.join("\n");
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
		useDesignerGapReport: options.useDesignerGapReport,
	});
	if (assetIds.length === 0) {
		throw new Error("No text assets matched the designer pack selection.");
	}
	const template = buildTextDesignerPackTemplate({
		assetIds,
		generatedManifest,
	});
	await writeTextDesignerPackTemplate({
		includeContactSheet: options.includeContactSheet,
		includeCurrentFiles: options.includeCurrentFiles,
		outDir: options.outDir,
		publicDir: options.publicDir,
		template,
	});
	const archive = options.archivePath
		? await createTextDesignerPackTemplateArchive({
				archivePath: options.archivePath,
				outDir: options.outDir,
			})
		: undefined;
	console.log(
		JSON.stringify(
			{
				archivePath: archive?.archivePath,
				archivedFiles: archive?.fileCount ?? 0,
				assets: template.contracts.length,
				includeContactSheet: options.includeContactSheet,
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
