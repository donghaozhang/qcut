import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
	JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
	type JianyingTextStyleLabCoverRequest,
	type JianyingTextStyleLabCoverResult,
	type JianyingTextStyleLabListRequest,
	type JianyingTextStyleLabListResult,
	type JianyingTextStyleLabStyleSummary,
} from "./jianying-text-style-lab-contract.js";
import {
	JIANYING_FLOWER_CATEGORIES,
	resolveJianyingFlowerResourceMetadata,
	type JianyingFlowerResourceMetadata,
} from "./jianying-flower-resource-metadata.js";
import {
	buildJianyingTextStyleCatalog,
	isValidJianyingTextStyleId,
	readJianyingTextStyleCover,
	type JianyingTextStyleCatalog,
	type JianyingTextStyleCatalogEntry,
} from "./jianying-text-style-lab-catalog.js";
import {
	resolveJianyingTextPackageOwnership,
	type JianyingTextPackageOwnership,
} from "./jianying-text-package-ownership.js";
import { isDiscoverableJianyingTextCatalogEntry } from "./jianying-text-style-discovery.js";

interface TextStyleLabCatalog {
	catalog: JianyingTextStyleCatalog;
	metadata: Map<string, JianyingFlowerResourceMetadata>;
	ownership: Map<string, JianyingTextPackageOwnership>;
}

export interface JianyingTextStyleLabIPCController {
	dispose: () => void;
}

export interface SetupJianyingTextStyleLabIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	buildCatalog?: () => Promise<JianyingTextStyleCatalog>;
	resolveMetadata?: ({
		references,
	}: {
		references: JianyingTextStyleCatalogEntry[];
	}) => Promise<Map<string, JianyingFlowerResourceMetadata>>;
	resolveOwnership?: ({
		references,
	}: {
		references: JianyingTextStyleCatalogEntry[];
	}) => Promise<Map<string, JianyingTextPackageOwnership>>;
	readCover?: ({
		entry,
	}: {
		entry: JianyingTextStyleCatalogEntry;
	}) => Promise<Buffer>;
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
		throw new Error("花字实验室拒绝了非主窗口请求");
	}
}

function parseListRequest({ request }: { request: unknown }) {
	if (request === undefined) {
		return {} satisfies JianyingTextStyleLabListRequest;
	}
	if (!request || typeof request !== "object") {
		throw new Error("花字实验室列表请求无效");
	}
	const refresh = "refresh" in request ? request.refresh : undefined;
	if (refresh !== undefined && typeof refresh !== "boolean") {
		throw new Error("花字实验室 refresh 参数无效");
	}
	return refresh === undefined
		? ({} satisfies JianyingTextStyleLabListRequest)
		: ({ refresh } satisfies JianyingTextStyleLabListRequest);
}

function parseCoverRequest({ request }: { request: unknown }) {
	if (!request || typeof request !== "object" || !("styleId" in request)) {
		throw new Error("花字实验室请求缺少样式 ID");
	}
	const styleId = request.styleId;
	if (typeof styleId !== "string" || !isValidJianyingTextStyleId({ styleId })) {
		throw new Error("花字实验室样式 ID 无效");
	}
	return { styleId } satisfies JianyingTextStyleLabCoverRequest;
}

function requireCatalogEntry({
	catalog,
	styleId,
}: {
	catalog: JianyingTextStyleCatalog;
	styleId: string;
}) {
	const entry = catalog.entries.find(
		(candidate) => candidate.styleId === styleId
	);
	if (!entry) throw new Error("本机剪映缓存中没有找到该花字样式");
	return entry;
}

function summarizeEntry({
	entry,
	metadata,
	ownership,
}: {
	entry: JianyingTextStyleCatalogEntry;
	metadata: ReadonlyMap<string, JianyingFlowerResourceMetadata>;
	ownership: ReadonlyMap<string, JianyingTextPackageOwnership>;
}): JianyingTextStyleLabStyleSummary {
	const resourceMetadata = metadata.get(entry.styleId);
	const packageOwnership = ownership.get(entry.styleId);
	const title = resourceMetadata?.title ?? packageOwnership?.title;
	return {
		styleId: entry.styleId,
		resourceId: entry.resourceId,
		version: entry.version,
		...(title ? { title } : {}),
		categoryIds: resourceMetadata?.categoryIds ?? [],
		packageKind: entry.packageKind,
		packageVersion: entry.packageVersion,
		fillKind: entry.fillKind,
		strokeCount: entry.strokeCount,
		innerShadowCount: entry.innerShadowCount,
		shadowCount: entry.shadowCount,
		textureLayerCount: entry.textureLayerCount,
		capabilities: entry.capabilities,
		diagnostics: entry.diagnostics,
		hasCover: entry.hasCover,
		compatibility: entry.compatibility,
		...(entry.approximation ? { approximation: entry.approximation } : {}),
		...(entry.runtimeReference
			? { runtimeReference: entry.runtimeReference }
			: {}),
	};
}

function compareStyleSummaries({
	left,
	right,
}: {
	left: JianyingTextStyleLabStyleSummary;
	right: JianyingTextStyleLabStyleSummary;
}) {
	const compatibilityOrder = {
		"flat-compatible": 0,
		approximated: 1,
		"native-runtime": 2,
		"preview-only": 3,
	} as const;
	return (
		compatibilityOrder[left.compatibility] -
			compatibilityOrder[right.compatibility] ||
		(left.title ?? left.resourceId).localeCompare(
			right.title ?? right.resourceId,
			"zh-CN"
		) ||
		left.styleId.localeCompare(right.styleId)
	);
}

function summarizeCategories({
	styles,
}: {
	styles: JianyingTextStyleLabStyleSummary[];
}) {
	return JIANYING_FLOWER_CATEGORIES.map(({ id, label }) => ({
		id,
		label,
		count: styles.filter(({ categoryIds }) => categoryIds.includes(id)).length,
	}));
}

export function setupJianyingTextStyleLabIPC({
	getMainWindow,
	buildCatalog = () => buildJianyingTextStyleCatalog(),
	resolveMetadata = ({ references }) =>
		resolveJianyingFlowerResourceMetadata({ references }),
	resolveOwnership = ({ references }) =>
		resolveJianyingTextPackageOwnership({ references }),
	readCover = readJianyingTextStyleCover,
}: SetupJianyingTextStyleLabIPCOptions): JianyingTextStyleLabIPCController {
	let catalogPromise: Promise<TextStyleLabCatalog> | null = null;
	const readCatalog = ({ refresh }: { refresh: boolean }) => {
		if (!catalogPromise || refresh) {
			catalogPromise = buildCatalog().then(async (catalog) => {
				const metadata = await resolveMetadata({ references: catalog.entries });
				const ownershipCandidates = catalog.entries.filter(
					({ packageKind, styleId }) =>
						!metadata.has(styleId) &&
						(packageKind === "AmazingFeature" || packageKind === "InfoSticker")
				);
				const ownership = await resolveOwnership({
					references: ownershipCandidates,
				});
				return {
					catalog: {
						...catalog,
						entries: catalog.entries.filter((entry) =>
							isDiscoverableJianyingTextCatalogEntry({
								entry,
								metadata,
								ownership,
							})
						),
					},
					metadata,
					ownership,
				};
			});
		}
		return catalogPromise;
	};

	ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL);
	ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL);
	ipcMain.handle(
		JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		async (
			event,
			request: unknown
		): Promise<JianyingTextStyleLabListResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { refresh = false } = parseListRequest({ request });
			const { catalog, metadata, ownership } = await readCatalog({ refresh });
			const styles = catalog.entries
				.map((entry) => summarizeEntry({ entry, metadata, ownership }))
				.sort((left, right) => compareStyleSummaries({ left, right }));
			return {
				count: styles.length,
				styles,
				categories: summarizeCategories({ styles }),
				packageCount: catalog.packageCount,
				invalidPackageCount: catalog.invalidPackageCount,
			};
		}
	);
	ipcMain.handle(
		JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
		async (
			event,
			request: unknown
		): Promise<JianyingTextStyleLabCoverResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { styleId } = parseCoverRequest({ request });
			const { catalog } = await readCatalog({ refresh: false });
			const entry = requireCatalogEntry({ catalog, styleId });
			const bytes = await readCover({ entry });
			return {
				styleId,
				mimeType: "image/png",
				bytes: new Uint8Array(bytes),
			};
		}
	);

	return {
		dispose: () => {
			catalogPromise = null;
			ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL);
			ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL);
		},
	};
}
