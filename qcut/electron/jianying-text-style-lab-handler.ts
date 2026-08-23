import path from "node:path";
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
} from "./jianying-text-style-lab-contract.js";
import { buildJianyingTextAnimationCatalog } from "./jianying-text-animation-lab-catalog.js";
import type { JianyingCachedImage } from "./jianying-image-cache.js";
import { ensureQCutJianyingTextPrivateArchive } from "./jianying-text-private-archive.js";
import {
	type JianyingFlowerCategoryDefinition,
	type JianyingFlowerCategoryGroupDefinition,
} from "./jianying-flower-taxonomy.js";
import {
	resolveJianyingFlowerCatalogMetadata,
	type JianyingFlowerCatalogMetadata,
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
import { readJianyingTextStyleCoverImage } from "./jianying-text-style-cover-cache.js";
import {
	attachJianyingTextStyleCoverUrls,
	resolveJianyingTextStyleCoverUrls,
} from "./jianying-text-style-cover-metadata.js";
import { readJianyingTextStyleGeneratedCover } from "./jianying-text-style-generated-cover.js";
import { classifyLocalJianyingTextStyles } from "./jianying-text-style-local-categories.js";
import {
	compareStyleSummaries,
	normalizeResolvedMetadata,
	summarizeCategories,
	summarizeCategoryGroups,
	summarizeEntry,
} from "./jianying-text-style-lab-summary.js";
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
	categories: JianyingFlowerCategoryDefinition[];
	categoryGroups: JianyingFlowerCategoryGroupDefinition[];
}

export interface JianyingTextStyleLabIPCController {
	dispose: () => void;
}

export interface SetupJianyingTextStyleLabIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	buildCatalog?: ({
		refresh,
	}: {
		refresh: boolean;
	}) => Promise<JianyingTextStyleCatalog>;
	buildAnimationCatalog?: ({
		refresh,
	}: {
		refresh: boolean;
	}) => Promise<JianyingTextAnimationLabListResult>;
	resolveMetadata?: ({
		references,
	}: {
		references: JianyingTextStyleCatalogEntry[];
	}) => Promise<
		Map<string, JianyingFlowerResourceMetadata> | JianyingFlowerCatalogMetadata
	>;
	resolveOwnership?: ({
		references,
	}: {
		references: JianyingTextStyleCatalogEntry[];
	}) => Promise<Map<string, JianyingTextPackageOwnership>>;
	resolveCoverUrls?: ({
		references,
	}: {
		references: JianyingTextStyleCatalogEntry[];
	}) => Promise<Map<string, string>>;
	readCover?: ({
		entry,
	}: {
		entry: JianyingTextStyleCatalogEntry;
	}) => Promise<Buffer>;
	readCachedCover?: ({
		entry,
		sourceUrl,
	}: {
		entry: JianyingTextStyleCatalogEntry;
		sourceUrl: string;
	}) => Promise<JianyingCachedImage>;
	readGeneratedCover?: ({
		entry,
	}: {
		entry: JianyingTextStyleCatalogEntry;
	}) => Promise<JianyingCachedImage>;
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
	if (!entry) throw new Error("QCut 私有备份中没有找到该花字样式");
	return entry;
}

export function setupJianyingTextStyleLabIPC({
	getMainWindow,
	buildCatalog = async ({ refresh }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive({ refresh });
		return buildJianyingTextStyleCatalog({ root: archive.packageRoot });
	},
	buildAnimationCatalog = async ({ refresh }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive({ refresh });
		return buildJianyingTextAnimationCatalog({
			cacheRoot: archive.cacheRoot,
			databaseRoot: archive.databaseRoot,
		});
	},
	resolveMetadata = async ({ references }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive();
		return resolveJianyingFlowerCatalogMetadata({
			references,
			databaseRoot: archive.databaseRoot,
		});
	},
	resolveOwnership = async ({ references }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive();
		return resolveJianyingTextPackageOwnership({
			references,
			databaseRoot: archive.databaseRoot,
			packageRoot: archive.packageRoot,
			projectRoot: archive.projectEvidenceRoot,
		});
	},
	resolveCoverUrls = async ({ references }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive();
		return resolveJianyingTextStyleCoverUrls({
			references,
			databaseRoot: archive.databaseRoot,
		});
	},
	readCover = readJianyingTextStyleCover,
	readCachedCover = async ({ entry, sourceUrl }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive();
		return readJianyingTextStyleCoverImage({
			cacheRoot: path.join(archive.archiveRoot, "Covers"),
			produceFallback: async () =>
				(
					await readJianyingTextStyleGeneratedCover({
						cacheRoot: path.join(archive.archiveRoot, "Covers"),
						entry,
					})
				).bytes,
			sourceUrl,
			styleId: entry.styleId,
		});
	},
	readGeneratedCover = async ({ entry }) => {
		const archive = await ensureQCutJianyingTextPrivateArchive();
		return readJianyingTextStyleGeneratedCover({
			cacheRoot: path.join(archive.archiveRoot, "Covers"),
			entry,
		});
	},
	snapshotCacheFilePath,
	computeSnapshotFingerprint = async () => {
		const archive = await ensureQCutJianyingTextPrivateArchive();
		return computeJianyingTextLabFingerprint({
			styleRoot: archive.packageRoot,
			animationPackageRoot: archive.animationPackageRoot,
		});
	},
}: SetupJianyingTextStyleLabIPCOptions): JianyingTextStyleLabIPCController {
	let catalogPromise: Promise<TextStyleLabCatalog> | null = null;
	let animationCatalogPromise: Promise<JianyingTextAnimationLabListResult> | null =
		null;
	let snapshotPromise: Promise<JianyingTextLabSnapshot | null> | null = null;
	let snapshotWriteQueued = false;
	const readRemoteCoverWithGeneratedFallback = async ({
		entry,
		sourceUrl,
	}: {
		entry: JianyingTextStyleCatalogEntry;
		sourceUrl: string;
	}) => {
		try {
			return await readCachedCover({ entry, sourceUrl });
		} catch (error) {
			if (!entry.runtimeReference) throw error;
			return readGeneratedCover({ entry });
		}
	};
	const selectCover = async ({
		entry,
		remoteCoverUrl,
	}: {
		entry: JianyingTextStyleCatalogEntry;
		remoteCoverUrl: string | undefined;
	}) => {
		if (entry.coverPath) {
			return {
				bytes: await readCover({ entry }),
				mimeType: "image/png" as const,
			};
		}
		if (remoteCoverUrl) {
			return readRemoteCoverWithGeneratedFallback({
				entry,
				sourceUrl: remoteCoverUrl,
			});
		}
		if (entry.runtimeReference) return readGeneratedCover({ entry });
		return null;
	};
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
						categories: styles.categories,
						categoryGroups: styles.categoryGroups,
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
	const buildResolvedCatalog = ({ refresh }: { refresh: boolean }) =>
		buildCatalog({ refresh }).then(async (catalog) => {
			const resolvedMetadata = normalizeResolvedMetadata({
				resolved: await resolveMetadata({ references: catalog.entries }),
			});
			const ownershipCandidates = catalog.entries.filter(
				({ styleId }) => !resolvedMetadata.metadata.has(styleId)
			);
			const coverUrlCandidates = catalog.entries.filter(
				({ hasCover }) => !hasCover
			);
			const [ownership, coverUrls] = await Promise.all([
				ownershipCandidates.length > 0
					? resolveOwnership({ references: ownershipCandidates })
					: Promise.resolve(new Map<string, JianyingTextPackageOwnership>()),
				coverUrlCandidates.length > 0
					? resolveCoverUrls({ references: coverUrlCandidates })
					: Promise.resolve(new Map<string, string>()),
			]);
			const entries = catalog.entries.filter((entry) =>
				isDiscoverableJianyingTextCatalogEntry({
					entry,
					metadata: resolvedMetadata.metadata,
					ownership,
				})
			);
			const classifiedMetadata = classifyLocalJianyingTextStyles({
				entries,
				ownership,
				resolvedMetadata,
			});
			const metadata = attachJianyingTextStyleCoverUrls({
				coverUrls,
				metadata: classifiedMetadata.metadata,
			});
			const { categories, categoryGroups } = classifiedMetadata;
			return {
				catalog: {
					...catalog,
					entries,
				},
				metadata,
				ownership,
				categories,
				categoryGroups,
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
							categories: snapshot.styles.categories,
							categoryGroups: snapshot.styles.categoryGroups,
						};
					}
				}
				const built = await buildResolvedCatalog({ refresh });
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
				const built = await buildAnimationCatalog({ refresh });
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
			const { catalog, categories, categoryGroups, metadata, ownership } =
				await readCatalog({ refresh });
			const styles = catalog.entries
				.map((entry) => summarizeEntry({ entry, metadata, ownership }))
				.sort((left, right) => compareStyleSummaries({ left, right }));
			return {
				count: styles.length,
				styles,
				categories: summarizeCategories({ categories, styles }),
				categoryGroups: summarizeCategoryGroups({
					groups: categoryGroups,
					styles,
				}),
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
			const { catalog, metadata } = await readCatalog({ refresh: false });
			const entry = requireCatalogEntry({ catalog, styleId });
			const cover = await selectCover({
				entry,
				remoteCoverUrl: metadata.get(styleId)?.coverUrl,
			});
			if (!cover) throw new Error("本机花字缓存没有缩略图");
			return {
				styleId,
				mimeType: cover.mimeType,
				bytes: new Uint8Array(cover.bytes),
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
