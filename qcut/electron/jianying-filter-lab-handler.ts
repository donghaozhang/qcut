import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain } from "electron";
import { dirname, join } from "node:path";
import {
	buildJianyingFilterLabCatalog,
	mergeKnownFiltersWithReferences,
	tiledReferencesFromPackages,
} from "./jianying-filter-lab-catalog.js";
import {
	JIANYING_FILTER_LAB_LIST_CHANNEL,
	JIANYING_FILTER_LAB_LOAD_CHANNEL,
	JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL,
	JIANYING_FILTER_LAB_CHANGED_CHANNEL,
	JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL,
	type JianyingFilterLabListResult,
	type JianyingFilterLabLoadResult,
	type JianyingFilterLabLoadRendererResult,
	type JianyingFilterLabLutSummary,
	type JianyingFilterLabThumbnailResult,
	type JianyingFilterVerification,
} from "./jianying-filter-lab-contract.js";
import { readJianyingFilterVerifications } from "./jianying-filter-verification-store.js";
import { createJianyingFilterMetadataResolvers } from "./jianying-filter-metadata-host.js";
import {
	findJianyingFilterCategories,
	findJianyingFilterTitle,
	type JianyingFilterCategoryCatalog,
	type JianyingFilterKnownCatalog,
} from "./jianying-filter-metadata.js";
import {
	inspectJianyingFilterPackages,
	type JianyingFilterPackageSummary,
} from "./jianying-filter-package-inspector.js";
import type { JianyingFilterCacheWatcher } from "./jianying-filter-cache-watcher.js";
import {
	readJianyingFilterThumbnail,
	type JianyingFilterThumbnail,
	type JianyingFilterThumbnailSource,
} from "./jianying-filter-thumbnail-cache.js";
import {
	jianyingEffectCacheRoot,
	listJianyingLutReferences,
	loadJianyingLut,
	measureCubeChroma,
	type FilterLabCube,
	type JianyingLutEntry,
	type JianyingLutReference,
} from "./native-pipeline/filters/filter-lab-lut.js";
import { loadTiledLutCube } from "./native-pipeline/filters/filter-lab-tiled-lut.js";
import {
	loadJianyingMultiPassRecipe,
	type FilterLabMultiPassRecipe,
	type JianyingFilterMultiPassRenderer,
} from "./native-pipeline/filters/filter-lab-multi-pass.js";
import {
	parseFilterLabListRequest,
	parseFilterLabLoadRequest,
	parseFilterLabRendererRequest,
	parseFilterLabThumbnailRequest,
} from "./jianying-filter-lab-request.js";
import { loadJianyingFilterLabRenderer } from "./jianying-filter-multi-pass-loader.js";

const MAX_EDITOR_LUT_SIZE = 65;

interface FilterLabCatalog {
	references: JianyingLutReference[];
	tiledReferences: Map<string, JianyingLutReference>;
	multiPassRenderers: Map<string, JianyingFilterMultiPassRenderer>;
	titles: Map<string, string>;
	categories: JianyingFilterCategoryCatalog;
	thumbnailSources: Map<string, JianyingFilterThumbnailSource>;
	result: JianyingFilterLabListResult;
}

export interface JianyingFilterLabIPCController {
	dispose: () => void;
}

export interface SetupJianyingFilterLabIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	listReferences?: () => Promise<JianyingLutReference[]>;
	loadReference?: ({
		reference,
	}: {
		reference: JianyingLutReference;
	}) => Promise<JianyingLutEntry | null>;
	loadTiledCube?: ({
		filePath,
	}: {
		filePath: string;
	}) => Promise<FilterLabCube | null>;
	loadMultiPassRecipe?: ({
		renderer,
		cacheRoot,
	}: {
		renderer: JianyingFilterMultiPassRenderer;
		cacheRoot: string;
	}) => Promise<FilterLabMultiPassRecipe | null>;
	resolveTitles?: ({
		references,
	}: {
		references: JianyingLutReference[];
	}) => Promise<Map<string, string>>;
	resolveCategories?: ({
		references,
	}: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterCategoryCatalog>;
	resolveKnownFilters?: ({
		references,
	}: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterKnownCatalog>;
	inspectPackages?: ({
		filters,
		references,
	}: {
		filters: JianyingFilterKnownCatalog["filters"];
		references: JianyingLutReference[];
	}) => Promise<Map<string, JianyingFilterPackageSummary>>;
	readVerifications?: () => Promise<Map<string, JianyingFilterVerification>>;
	readThumbnail?: ({
		source,
		cacheRoot,
	}: {
		source: JianyingFilterThumbnailSource;
		cacheRoot: string;
	}) => Promise<JianyingFilterThumbnail>;
	thumbnailCacheRoot?: string;
	filterCacheRoot?: string;
	watchCache?: ({
		onChange,
	}: {
		onChange: () => void;
	}) => JianyingFilterCacheWatcher;
}

function assertTrustedMainFrame({
	event,
	mainWindow,
}: {
	event: IpcMainInvokeEvent;
	mainWindow: BrowserWindow | null;
}) {
	if (
		!mainWindow ||
		mainWindow.isDestroyed() ||
		mainWindow.webContents.isDestroyed() ||
		event.sender !== mainWindow.webContents ||
		event.senderFrame === null ||
		event.senderFrame !== mainWindow.webContents.mainFrame
	) {
		throw new Error("滤镜实验室拒绝了非主窗口请求");
	}
}

function mergePanelOrderedNames({
	primary,
	secondary,
}: {
	primary: string[];
	secondary: string[];
}): string[] {
	const merged: string[] = [];
	const push = (name: string) => {
		if (!merged.includes(name)) merged.push(name);
	};
	let primaryIndex = 0;
	let secondaryIndex = 0;
	while (primaryIndex < primary.length && secondaryIndex < secondary.length) {
		const primaryName = primary[primaryIndex];
		if (primaryName === secondary[secondaryIndex]) {
			push(primaryName);
			primaryIndex += 1;
			secondaryIndex += 1;
		} else if (secondary.includes(primaryName, secondaryIndex)) {
			push(secondary[secondaryIndex]);
			secondaryIndex += 1;
		} else {
			push(primaryName);
			primaryIndex += 1;
		}
	}
	for (const name of primary.slice(primaryIndex)) push(name);
	for (const name of secondary.slice(secondaryIndex)) push(name);
	return merged;
}

function titlesByResource({
	references,
	titles,
}: {
	references: JianyingLutReference[];
	titles: ReadonlyMap<string, string>;
}): Map<string, string> {
	const byResource = new Map<string, string>();
	for (const reference of references) {
		const title = findJianyingFilterTitle({ reference, titles });
		if (title && !byResource.has(reference.resourceId)) {
			byResource.set(reference.resourceId, title);
		}
	}
	return byResource;
}

function summarizeReference({
	reference,
	titles,
	categories,
}: {
	reference: JianyingLutReference;
	titles: ReadonlyMap<string, string>;
	categories: JianyingFilterCategoryCatalog;
}): JianyingFilterLabLutSummary {
	return {
		lutId: reference.lutId,
		resourceId: reference.resourceId,
		version: reference.version,
		fileName: reference.fileName,
		role: reference.role,
		size: reference.size,
		title: findJianyingFilterTitle({ reference, titles }),
		categories: findJianyingFilterCategories({
			reference,
			catalog: categories,
		}),
	};
}

function serializeLoadedLut({
	entry,
	titles,
	categories,
}: {
	entry: JianyingLutEntry;
	titles: ReadonlyMap<string, string>;
	categories: JianyingFilterCategoryCatalog;
}): JianyingFilterLabLoadResult {
	return {
		...summarizeReference({ reference: entry, titles, categories }),
		kind: entry.chroma < 0.01 ? "monochrome" : "colour",
		cube: {
			size: entry.cube.size,
			domainMin: entry.cube.domainMin ?? [0, 0, 0],
			domainMax: entry.cube.domainMax ?? [1, 1, 1],
			values: Array.from(entry.cube.values),
		},
	};
}

export function setupJianyingFilterLabIPC(
	options: SetupJianyingFilterLabIPCOptions
): JianyingFilterLabIPCController {
	// The cache-database sweep is synchronous SQLite work that can take
	// seconds, so the default resolvers run it in a utility process and share
	// one scan across all three catalog views.
	const sharedMetadataResolvers = createJianyingFilterMetadataResolvers();
	const {
		getMainWindow,
		listReferences = () => listJianyingLutReferences(),
		loadReference = loadJianyingLut,
		loadTiledCube = ({ filePath }) => loadTiledLutCube({ filePath }),
		loadMultiPassRecipe = ({ renderer, cacheRoot }) =>
			loadJianyingMultiPassRecipe({ renderer, cacheRoot }),
		resolveTitles = sharedMetadataResolvers.resolveTitles,
		resolveCategories = sharedMetadataResolvers.resolveCategories,
		resolveKnownFilters = sharedMetadataResolvers.resolveKnownFilters,
		inspectPackages = inspectJianyingFilterPackages,
		readVerifications = () => readJianyingFilterVerifications(),
		readThumbnail = readJianyingFilterThumbnail,
		filterCacheRoot = dirname(jianyingEffectCacheRoot()),
		thumbnailCacheRoot = join(
			app.getPath("userData"),
			"Cache",
			"jianying-filter-thumbnails"
		),
		watchCache,
	} = options;
	let catalogPromise: Promise<FilterLabCatalog> | null = null;
	const thumbnailPromises = new Map<string, Promise<JianyingFilterThumbnail>>();
	const readCatalog = ({ refresh }: { refresh: boolean }) => {
		if (!catalogPromise || refresh) {
			catalogPromise = listReferences().then(async (references) => {
				const supported = references.filter(
					({ size }) => size <= MAX_EDITOR_LUT_SIZE
				);
				const [titles, categories, knownFilters, verifications] =
					await Promise.all([
						resolveTitles({ references: supported }),
						resolveCategories({ references: supported }),
						resolveKnownFilters({ references: supported }),
						readVerifications(),
					]);
				const mergedCatalog = mergeKnownFiltersWithReferences({
					catalog: {
						order: mergePanelOrderedNames({
							primary: knownFilters.order,
							secondary: categories.order,
						}),
						filters: knownFilters.filters,
					},
					references: supported,
					fallbackTitles: titlesByResource({
						references: supported,
						titles,
					}),
					fallbackCategories: categories.byResourceId,
				});
				const packages = await inspectPackages({
					filters: mergedCatalog.filters,
					references: supported,
				});
				const tiledReferences = tiledReferencesFromPackages({
					packages,
					cacheRoot: filterCacheRoot,
				});
				const multiPassRenderers = new Map<
					string,
					JianyingFilterMultiPassRenderer
				>();
				for (const [resourceId, summary] of packages) {
					if (summary.multiPassRenderer) {
						multiPassRenderers.set(resourceId, summary.multiPassRenderer);
					}
				}
				const thumbnailSources = new Map<
					string,
					JianyingFilterThumbnailSource
				>();
				for (const filter of mergedCatalog.filters) {
					const sourcePath = packages.get(filter.resourceId)?.thumbnailPath;
					if (!sourcePath && !filter.thumbnailUrl) continue;
					thumbnailSources.set(filter.resourceId, {
						resourceId: filter.resourceId,
						...(filter.version ? { version: filter.version } : {}),
						...(sourcePath ? { sourcePath } : {}),
						...(filter.thumbnailUrl ? { sourceUrl: filter.thumbnailUrl } : {}),
					});
				}
				return {
					references: supported,
					titles,
					categories,
					thumbnailSources,
					result: buildJianyingFilterLabCatalog({
						catalog: mergedCatalog,
						references: supported,
						packages,
						verifications,
					}),
					tiledReferences,
					multiPassRenderers,
				};
			});
		}
		return catalogPromise;
	};
	const invalidateCatalog = () => {
		catalogPromise = null;
		thumbnailPromises.clear();
		const mainWindow = getMainWindow();
		if (
			mainWindow &&
			!mainWindow.isDestroyed() &&
			!mainWindow.webContents.isDestroyed()
		) {
			mainWindow.webContents.send(JIANYING_FILTER_LAB_CHANGED_CHANNEL);
		}
	};
	const cacheWatcher = watchCache?.({ onChange: invalidateCatalog });

	ipcMain.removeHandler(JIANYING_FILTER_LAB_LIST_CHANNEL);
	ipcMain.removeHandler(JIANYING_FILTER_LAB_LOAD_CHANNEL);
	ipcMain.removeHandler(JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL);
	ipcMain.removeHandler(JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL);
	ipcMain.handle(
		JIANYING_FILTER_LAB_LIST_CHANNEL,
		async (event, request: unknown): Promise<JianyingFilterLabListResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { refresh = false } = parseFilterLabListRequest({ request });
			const catalog = await readCatalog({ refresh });
			return catalog.result;
		}
	);
	ipcMain.handle(
		JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL,
		async (
			event,
			request: unknown
		): Promise<JianyingFilterLabThumbnailResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { resourceId } = parseFilterLabThumbnailRequest({ request });
			const catalog = await readCatalog({ refresh: false });
			const source = catalog.thumbnailSources.get(resourceId);
			if (!source) throw new Error("该剪映滤镜没有可用缩略图");
			let pending = thumbnailPromises.get(resourceId);
			if (!pending) {
				pending = readThumbnail({
					source,
					cacheRoot: thumbnailCacheRoot,
				}).finally(() => thumbnailPromises.delete(resourceId));
				thumbnailPromises.set(resourceId, pending);
			}
			const thumbnail = await pending;
			return {
				resourceId,
				mimeType: thumbnail.mimeType,
				bytes: new Uint8Array(thumbnail.bytes),
			};
		}
	);
	ipcMain.handle(
		JIANYING_FILTER_LAB_LOAD_CHANNEL,
		async (event, request: unknown): Promise<JianyingFilterLabLoadResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { lutId } = parseFilterLabLoadRequest({ request });
			const catalog = await readCatalog({ refresh: false });
			const reference =
				catalog.references.find((candidate) => candidate.lutId === lutId) ??
				catalog.tiledReferences.get(lutId);
			if (!reference) {
				throw new Error("本机剪映缓存中没有找到该 LUT");
			}
			const entry = catalog.tiledReferences.has(lutId)
				? await loadTiledCube({ filePath: reference.filePath }).then((cube) =>
						cube
							? {
									...reference,
									cube,
									chroma: measureCubeChroma({ cube }),
								}
							: null
					)
				: await loadReference({ reference });
			if (!entry) throw new Error("本机剪映 LUT 无法读取或已经变化");
			return serializeLoadedLut({
				entry,
				titles: catalog.titles,
				categories: catalog.categories,
			});
		}
	);
	ipcMain.handle(
		JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL,
		async (
			event,
			request: unknown
		): Promise<JianyingFilterLabLoadRendererResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { resourceId } = parseFilterLabRendererRequest({ request });
			const catalog = await readCatalog({ refresh: false });
			const renderer = catalog.multiPassRenderers.get(resourceId);
			const filter = catalog.result.filters.find(
				(candidate) => candidate.resourceId === resourceId
			);
			if (!renderer || !filter?.renderer) {
				throw new Error("该剪映 Shader 尚无可用的多 Pass 渲染器");
			}
			return loadJianyingFilterLabRenderer({
				cacheRoot: filterCacheRoot,
				filterTitle: filter.title,
				loadRecipe: loadMultiPassRecipe,
				renderer,
				resourceId,
			});
		}
	);

	return {
		dispose: () => {
			cacheWatcher?.dispose();
			catalogPromise = null;
			thumbnailPromises.clear();
			ipcMain.removeHandler(JIANYING_FILTER_LAB_LIST_CHANNEL);
			ipcMain.removeHandler(JIANYING_FILTER_LAB_LOAD_CHANNEL);
			ipcMain.removeHandler(JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL);
			ipcMain.removeHandler(JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL);
		},
	};
}
