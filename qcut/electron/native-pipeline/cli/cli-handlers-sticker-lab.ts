import {
	discoverLocalReferences,
	type LocalStickerLabCatalog,
	type LocalStickerLabCategory,
	type LocalStickerLabDiscovery,
	type LocalStickerLabReference,
} from "../stickers/local-reference-catalog/index.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const REFERENCE_ONLY_WARNING =
	"Private local reference only. Do not redistribute or upload these files.";

export interface StickerLabHandlerDependencies {
	discover: typeof discoverLocalReferences;
}

const DEFAULT_DEPENDENCIES: StickerLabHandlerDependencies = {
	discover: discoverLocalReferences,
};

interface StickerLabPagination {
	offset: number;
	limit: number;
}

interface StickerLabCategoryRow {
	batchId: string;
	id: string;
	label: string;
	sourcePanel: string;
	itemCount: number;
	totalBytes: number;
	referenceOnly: true;
}

interface StickerLabItemRow {
	batchId: string;
	categoryId: string;
	categoryLabel: string;
	id: string;
	displayName: string;
	fileName: string;
	mimeType: LocalStickerLabReference["mimeType"];
	sourceKind: LocalStickerLabReference["sourceKind"];
	playback: LocalStickerLabReference["playback"];
	asset: LocalStickerLabReference["asset"];
	referenceOnly: true;
}

function normalized({ value }: { value: string }): string {
	return value.trim().toLocaleLowerCase();
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function parsePagination({
	offset,
	limit,
}: {
	offset?: number;
	limit?: number;
}): StickerLabPagination {
	const resolvedOffset = offset ?? 0;
	const resolvedLimit = limit ?? DEFAULT_LIMIT;
	if (!Number.isSafeInteger(resolvedOffset) || resolvedOffset < 0) {
		throw new Error("--offset must be a non-negative integer.");
	}
	if (
		!Number.isSafeInteger(resolvedLimit) ||
		resolvedLimit <= 0 ||
		resolvedLimit > MAX_LIMIT
	) {
		throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}.`);
	}
	return { offset: resolvedOffset, limit: resolvedLimit };
}

function page<T>({
	items,
	pagination,
}: {
	items: T[];
	pagination: StickerLabPagination;
}): T[] {
	return items.slice(pagination.offset, pagination.offset + pagination.limit);
}

function matchesQuery({
	query,
	values,
}: {
	query: string;
	values: string[];
}): boolean {
	if (!query) return true;
	const searchable = normalized({ value: values.join(" ") });
	return query.split(/\s+/).every((term) => searchable.includes(term));
}

function selectedCatalogs({
	discovery,
	batchId,
}: {
	discovery: LocalStickerLabDiscovery;
	batchId?: string;
}): LocalStickerLabCatalog[] {
	const requestedBatch = batchId?.trim();
	if (!requestedBatch) return discovery.catalogs;
	return discovery.catalogs.filter(
		(catalog) => catalog.batchId === requestedBatch
	);
}

function matchesCategory({
	category,
	selector,
}: {
	category: LocalStickerLabCategory;
	selector?: string;
}): boolean {
	const requestedCategory = selector?.trim();
	if (!requestedCategory) return true;
	const needle = normalized({ value: requestedCategory });
	return (
		normalized({ value: category.id }) === needle ||
		normalized({ value: category.label }) === needle
	);
}

function categoryRows({
	catalogs,
	category,
	query,
}: {
	catalogs: LocalStickerLabCatalog[];
	category?: string;
	query: string;
}): StickerLabCategoryRow[] {
	return catalogs.flatMap((catalog) =>
		catalog.categories.flatMap((entry) => {
			if (!matchesCategory({ category: entry, selector: category })) return [];
			if (
				!matchesQuery({
					query,
					values: [catalog.batchId, entry.id, entry.label, entry.sourcePanel],
				})
			) {
				return [];
			}
			return [
				{
					batchId: catalog.batchId,
					id: entry.id,
					label: entry.label,
					sourcePanel: entry.sourcePanel,
					itemCount: entry.items.length,
					totalBytes: entry.items.reduce(
						(total, item) => total + item.asset.byteSize,
						0
					),
					referenceOnly: true as const,
				},
			];
		})
	);
}

function itemRows({
	catalogs,
	category,
	query,
}: {
	catalogs: LocalStickerLabCatalog[];
	category?: string;
	query: string;
}): StickerLabItemRow[] {
	return catalogs.flatMap((catalog) =>
		catalog.categories.flatMap((entry) => {
			if (!matchesCategory({ category: entry, selector: category })) return [];
			return entry.items.flatMap((item) => {
				if (
					!matchesQuery({
						query,
						values: [
							catalog.batchId,
							entry.id,
							entry.label,
							entry.sourcePanel,
							item.id,
							item.displayName,
							item.fileName,
							item.mimeType,
							item.sourceKind,
						],
					})
				) {
					return [];
				}
				return [
					{
						batchId: catalog.batchId,
						categoryId: entry.id,
						categoryLabel: entry.label,
						id: item.id,
						displayName: item.displayName,
						fileName: item.fileName,
						mimeType: item.mimeType,
						sourceKind: item.sourceKind,
						playback: item.playback,
						asset: item.asset,
						referenceOnly: true as const,
					},
				];
			});
		})
	);
}

function resultData({
	discovery,
	total,
	matching,
	pagination,
	rowsKey,
	rows,
}: {
	discovery: LocalStickerLabDiscovery;
	total: number;
	matching: number;
	pagination: StickerLabPagination;
	rowsKey: "catalogs" | "categories" | "items" | "results";
	rows: unknown[];
}): Record<string, unknown> {
	return {
		rootPath: discovery.rootPath,
		referenceOnly: true,
		warning: REFERENCE_ONLY_WARNING,
		warnings: discovery.warnings,
		provenance: {
			kind: "local-reference",
			rootPath: discovery.rootPath,
			redistribution: "prohibited",
		},
		summary: discovery.summary,
		total,
		matching,
		offset: pagination.offset,
		limit: pagination.limit,
		returned: rows.length,
		hasMore: pagination.offset + rows.length < matching,
		[rowsKey]: rows,
	};
}

async function discover({
	options,
	dependencies,
}: {
	options: CLIRunOptions;
	dependencies: StickerLabHandlerDependencies;
}): Promise<LocalStickerLabDiscovery> {
	return dependencies.discover({ rootPath: options.root });
}

export async function handleStickerLabCatalogs(
	options: CLIRunOptions,
	dependencies: StickerLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	try {
		const discovery = await discover({ options, dependencies });
		const pagination = parsePagination(options);
		const query = normalized({ value: options.query ?? "" });
		const matching = selectedCatalogs({
			discovery,
			batchId: options.batchId,
		}).filter((catalog) => matchesQuery({ query, values: [catalog.batchId] }));
		const rows = page({ items: matching, pagination }).map((catalog) => ({
			batchId: catalog.batchId,
			version: catalog.version,
			generatedAt: catalog.generatedAt,
			categoryCount: catalog.categories.length,
			itemCount: catalog.itemCount,
			totalBytes: catalog.totalBytes,
			referenceOnly: true as const,
		}));
		return {
			success: true,
			data: resultData({
				discovery,
				total: discovery.catalogs.length,
				matching: matching.length,
				pagination,
				rowsKey: "catalogs",
				rows,
			}),
		};
	} catch (error) {
		return {
			success: false,
			error: `Sticker Lab catalogs failed: ${errorMessage({ error })}`,
		};
	}
}

export async function handleStickerLabCategories(
	options: CLIRunOptions,
	dependencies: StickerLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	try {
		const discovery = await discover({ options, dependencies });
		const pagination = parsePagination(options);
		const matching = categoryRows({
			catalogs: selectedCatalogs({ discovery, batchId: options.batchId }),
			category: options.category,
			query: normalized({ value: options.query ?? "" }),
		});
		const rows = page({ items: matching, pagination });
		return {
			success: true,
			data: resultData({
				discovery,
				total: discovery.catalogs.reduce(
					(count, catalog) => count + catalog.categories.length,
					0
				),
				matching: matching.length,
				pagination,
				rowsKey: "categories",
				rows,
			}),
		};
	} catch (error) {
		return {
			success: false,
			error: `Sticker Lab categories failed: ${errorMessage({ error })}`,
		};
	}
}

async function handleItems({
	options,
	dependencies,
	search,
}: {
	options: CLIRunOptions;
	dependencies: StickerLabHandlerDependencies;
	search: boolean;
}): Promise<CLIResult> {
	try {
		const rawQuery = options.query?.trim() ?? "";
		if (search && !rawQuery) {
			throw new Error("Missing --query.");
		}
		const discovery = await discover({ options, dependencies });
		const pagination = parsePagination(options);
		const matching = itemRows({
			catalogs: selectedCatalogs({ discovery, batchId: options.batchId }),
			category: options.category,
			query: normalized({ value: rawQuery }),
		});
		const rows = page({ items: matching, pagination });
		return {
			success: true,
			data: resultData({
				discovery,
				total: discovery.summary.itemCount,
				matching: matching.length,
				pagination,
				rowsKey: search ? "results" : "items",
				rows,
			}),
		};
	} catch (error) {
		return {
			success: false,
			error: `Sticker Lab ${search ? "search" : "items"} failed: ${errorMessage({ error })}`,
		};
	}
}

export async function handleStickerLabItems(
	options: CLIRunOptions,
	dependencies: StickerLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	return handleItems({ options, dependencies, search: false });
}

export async function handleStickerLabSearch(
	options: CLIRunOptions,
	dependencies: StickerLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	return handleItems({ options, dependencies, search: true });
}
