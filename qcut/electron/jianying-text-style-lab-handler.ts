import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL,
	JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
	JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
	type JianyingTextAnimationLabListRequest,
	type JianyingTextAnimationLabListResult,
	type JianyingTextStyleLabCoverRequest,
	type JianyingTextStyleLabCoverResult,
	type JianyingTextStyleLabListRequest,
	type JianyingTextStyleLabListResult,
	type JianyingTextStyleLabStyleSummary,
} from "./jianying-text-style-lab-contract.js";
import { buildJianyingTextAnimationCatalog } from "./jianying-text-animation-lab-catalog.js";
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
import {
	computeJianyingTextLabFingerprint,
	JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION,
	readJianyingTextLabSnapshot,
	writeJianyingTextLabSnapshot,
	type JianyingTextLabSnapshot,
} from "./jianying-text-lab-snapshot-cache.js";

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
	buildAnimationCatalog?: () => Promise<JianyingTextAnimationLabListResult>;
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
	/** Enables the on-disk catalog snapshot when set; tests leave it unset. */
	snapshotCacheFilePath?: string;
	computeSnapshotFingerprint?: () => Promise<string>;
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
	buildAnimationCatalog = () => buildJianyingTextAnimationCatalog(),
	resolveMetadata = ({ references }) =>
		resolveJianyingFlowerResourceMetadata({ references }),
	resolveOwnership = ({ references }) =>
		resolveJianyingTextPackageOwnership({ references }),
	readCover = readJianyingTextStyleCover,
	snapshotCacheFilePath,
	computeSnapshotFingerprint = computeJianyingTextLabFingerprint,
}: SetupJianyingTextStyleLabIPCOptions): JianyingTextStyleLabIPCController {
	let catalogPromise: Promise<TextStyleLabCatalog> | null = null;
	let animationCatalogPromise: Promise<JianyingTextAnimationLabListResult> | null =
		null;
	let snapshotPromise: Promise<JianyingTextLabSnapshot | null> | null = null;
	let snapshotWriteQueued = false;
	const loadSnapshot = () => {
		if (!snapshotCacheFilePath) return Promise.resolve(null);
		if (!snapshotPromise) {
			snapshotPromise = computeSnapshotFingerprint()
				.then((fingerprint) =>
					readJianyingTextLabSnapshot({
						cacheFilePath: snapshotCacheFilePath,
						fingerprint,
					})
				)
				.catch(() => null);
		}
		return snapshotPromise;
	};
	const queueSnapshotWrite = () => {
		if (!snapshotCacheFilePath || snapshotWriteQueued) return;
		snapshotWriteQueued = true;
		void (async () => {
			const [styles, animations] = await Promise.all([
				readCatalog({ refresh: false }),
				readAnimationCatalog({ refresh: false }),
			]);
			const fingerprint = await computeSnapshotFingerprint();
			await writeJianyingTextLabSnapshot({
				cacheFilePath: snapshotCacheFilePath,
				snapshot: {
					schemaVersion: JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION,
					fingerprint,
					styles: {
						catalog: styles.catalog,
						metadataEntries: [...styles.metadata],
						ownershipEntries: [...styles.ownership],
					},
					animations,
				},
			});
		})()
			.catch(() => {})
			.finally(() => {
				snapshotWriteQueued = false;
			});
	};
	const buildResolvedCatalog = () =>
		buildCatalog().then(async (catalog) => {
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
	const readCatalog = ({
		refresh,
	}: {
		refresh: boolean;
	}): Promise<TextStyleLabCatalog> => {
		if (!catalogPromise || refresh) {
			if (refresh) {
				// The snapshot is shared between both catalogs under one
				// fingerprint. A refresh must invalidate the other half too,
				// or the queued write would combine rebuilt styles with
				// animations loaded under an older fingerprint and persist
				// that stale half as current.
				snapshotPromise = Promise.resolve(null);
				animationCatalogPromise = null;
			}
			catalogPromise = (async () => {
				if (!refresh) {
					const snapshot = await loadSnapshot();
					if (snapshot) {
						return {
							catalog: snapshot.styles.catalog,
							metadata: new Map(snapshot.styles.metadataEntries),
							ownership: new Map(snapshot.styles.ownershipEntries),
						};
					}
				}
				const built = await buildResolvedCatalog();
				queueSnapshotWrite();
				return built;
			})();
		}
		return catalogPromise;
	};
	const readAnimationCatalog = ({
		refresh,
	}: {
		refresh: boolean;
	}): Promise<JianyingTextAnimationLabListResult> => {
		if (!animationCatalogPromise || refresh) {
			if (refresh) {
				// Mirror of readCatalog: keep both snapshot halves coherent.
				snapshotPromise = Promise.resolve(null);
				catalogPromise = null;
			}
			animationCatalogPromise = (async () => {
				if (!refresh) {
					const snapshot = await loadSnapshot();
					if (snapshot) return snapshot.animations;
				}
				const built = await buildAnimationCatalog();
				queueSnapshotWrite();
				return built;
			})();
		}
		return animationCatalogPromise;
	};

	ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL);
	ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL);
	ipcMain.removeHandler(JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL);
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
	ipcMain.handle(
		JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL,
		async (
			event,
			request: unknown
		): Promise<JianyingTextAnimationLabListResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { refresh = false } = parseListRequest({
				request,
			}) satisfies JianyingTextAnimationLabListRequest;
			return readAnimationCatalog({ refresh });
		}
	);

	return {
		dispose: () => {
			catalogPromise = null;
			animationCatalogPromise = null;
			snapshotPromise = null;
			ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL);
			ipcMain.removeHandler(JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL);
			ipcMain.removeHandler(JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL);
		},
	};
}
