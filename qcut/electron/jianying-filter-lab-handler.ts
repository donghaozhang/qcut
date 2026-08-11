import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_FILTER_LAB_LIST_CHANNEL,
	JIANYING_FILTER_LAB_LOAD_CHANNEL,
	type JianyingFilterLabListResult,
	type JianyingFilterLabLoadRequest,
	type JianyingFilterLabLoadResult,
	type JianyingFilterLabLutSummary,
} from "./jianying-filter-lab-contract.js";
import {
	findJianyingFilterCategories,
	findJianyingFilterTitle,
	listJianyingFilterCatalog,
	resolveJianyingFilterCategories,
	resolveJianyingFilterTitles,
	type JianyingFilterCategoryCatalog,
	type JianyingFilterKnownCatalog,
} from "./jianying-filter-metadata.js";
import {
	listJianyingLutReferences,
	loadJianyingLut,
	type JianyingLutEntry,
	type JianyingLutReference,
} from "./native-pipeline/filters/filter-lab-lut.js";

const LUT_ID_PATTERN = /^[A-Za-z0-9._/-]{1,256}$/;
const MAX_EDITOR_LUT_SIZE = 65;
const MAX_UNCACHED_FILTERS = 2000;

interface FilterLabCatalog {
	references: JianyingLutReference[];
	titles: Map<string, string>;
	categories: JianyingFilterCategoryCatalog;
	knownFilters: JianyingFilterKnownCatalog;
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

function parseLoadRequest({ request }: { request: unknown }) {
	if (!request || typeof request !== "object" || !("lutId" in request)) {
		throw new Error("滤镜实验室请求缺少 LUT ID");
	}
	const lutId = request.lutId;
	if (
		typeof lutId !== "string" ||
		!LUT_ID_PATTERN.test(lutId) ||
		lutId.includes("..") ||
		lutId.startsWith("/") ||
		lutId.endsWith("/")
	) {
		throw new Error("滤镜实验室 LUT ID 无效");
	}
	return { lutId } satisfies JianyingFilterLabLoadRequest;
}

/**
 * Merge two category-name lists that are each already in Jianying's panel
 * order into one panel-ordered union.
 */
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
			domainMin: [0, 0, 0],
			domainMax: [1, 1, 1],
			values: Array.from(entry.cube.values),
		},
	};
}

export function setupJianyingFilterLabIPC({
	getMainWindow,
	listReferences = () => listJianyingLutReferences(),
	loadReference = loadJianyingLut,
	resolveTitles = resolveJianyingFilterTitles,
	resolveCategories = resolveJianyingFilterCategories,
	resolveKnownFilters = listJianyingFilterCatalog,
}: SetupJianyingFilterLabIPCOptions): JianyingFilterLabIPCController {
	let catalogPromise: Promise<FilterLabCatalog> | null = null;
	const readCatalog = ({ refresh }: { refresh: boolean }) => {
		if (!catalogPromise || refresh) {
			catalogPromise = listReferences().then(async (references) => {
				const supported = references.filter(
					({ size }) => size <= MAX_EDITOR_LUT_SIZE
				);
				const [titles, categories, knownFilters] = await Promise.all([
					resolveTitles({ references: supported }),
					resolveCategories({ references: supported }),
					resolveKnownFilters({ references: supported }),
				]);
				return { references: supported, titles, categories, knownFilters };
			});
		}
		return catalogPromise;
	};

	ipcMain.removeHandler(JIANYING_FILTER_LAB_LIST_CHANNEL);
	ipcMain.removeHandler(JIANYING_FILTER_LAB_LOAD_CHANNEL);
	ipcMain.handle(
		JIANYING_FILTER_LAB_LIST_CHANNEL,
		async (event): Promise<JianyingFilterLabListResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const catalog = await readCatalog({ refresh: true });
			const cachedResourceIds = new Set(
				catalog.references.map(({ resourceId }) => resourceId)
			);
			return {
				count: catalog.references.length,
				luts: catalog.references.map((reference) =>
					summarizeReference({
						reference,
						titles: catalog.titles,
						categories: catalog.categories,
					})
				),
				categoryOrder: mergePanelOrderedNames({
					primary: catalog.knownFilters.order,
					secondary: catalog.categories.order,
				}),
				uncached: catalog.knownFilters.filters
					.filter(({ resourceId }) => !cachedResourceIds.has(resourceId))
					.slice(0, MAX_UNCACHED_FILTERS)
					.map(({ resourceId, title, categories }) => ({
						resourceId,
						title,
						categories,
					})),
			};
		}
	);
	ipcMain.handle(
		JIANYING_FILTER_LAB_LOAD_CHANNEL,
		async (event, request: unknown): Promise<JianyingFilterLabLoadResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { lutId } = parseLoadRequest({ request });
			const catalog = await readCatalog({ refresh: false });
			const reference = catalog.references.find(
				(candidate) => candidate.lutId === lutId
			);
			if (!reference) {
				throw new Error("本机剪映缓存中没有找到该 LUT");
			}
			const entry = await loadReference({ reference });
			if (!entry) throw new Error("本机剪映 LUT 无法读取或已经变化");
			return serializeLoadedLut({
				entry,
				titles: catalog.titles,
				categories: catalog.categories,
			});
		}
	);

	return {
		dispose: () => {
			catalogPromise = null;
			ipcMain.removeHandler(JIANYING_FILTER_LAB_LIST_CHANNEL);
			ipcMain.removeHandler(JIANYING_FILTER_LAB_LOAD_CHANNEL);
		},
	};
}
