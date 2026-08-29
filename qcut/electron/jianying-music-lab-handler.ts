import path from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain, shell } from "electron";
import {
	buildJianyingMusicLabCatalog,
	loadJianyingMusicLabTrack,
	type JianyingMusicLabCatalog,
} from "./jianying-music-lab-cache.js";
import { cacheNextJianyingMusicBatch } from "./jianying-music-lab-batch.js";
import {
	JIANYING_MUSIC_LAB_CACHE_BATCH_CHANNEL,
	JIANYING_MUSIC_LAB_LIST_CHANNEL,
	JIANYING_MUSIC_LAB_LOAD_CHANNEL,
	JIANYING_MUSIC_LAB_REVEAL_CHANNEL,
	type JianyingMusicLabBatchResult,
	type JianyingMusicLabListRequest,
	type JianyingMusicLabListResult,
	type JianyingMusicLabLoadResult,
} from "./jianying-music-lab-contract.js";

const SONG_ID_PATTERN = /^\d{1,24}$/;

export interface JianyingMusicLabIPCController {
	dispose: () => void;
}

export interface SetupJianyingMusicLabIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	getUserDataDirectory: () => string;
	buildCatalog?: ({
		qcutCacheRoot,
		refresh,
	}: {
		qcutCacheRoot: string;
		refresh: boolean;
	}) => Promise<JianyingMusicLabCatalog>;
	loadTrack?: typeof loadJianyingMusicLabTrack;
	cacheNextBatch?: typeof cacheNextJianyingMusicBatch;
	revealDirectory?: ({
		directoryPath,
	}: {
		directoryPath: string;
	}) => Promise<boolean>;
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
		throw new Error("音乐实验室拒绝了非主窗口请求");
	}
}

function parseListRequest({ request }: { request: unknown }) {
	if (request === undefined) return {} satisfies JianyingMusicLabListRequest;
	if (!request || typeof request !== "object") {
		throw new Error("音乐实验室列表请求无效");
	}
	const refresh = "refresh" in request ? request.refresh : undefined;
	if (refresh !== undefined && typeof refresh !== "boolean") {
		throw new Error("音乐实验室 refresh 参数无效");
	}
	return refresh === undefined
		? ({} satisfies JianyingMusicLabListRequest)
		: ({ refresh } satisfies JianyingMusicLabListRequest);
}

function parseTrackId({ request }: { request: unknown }) {
	if (!request || typeof request !== "object" || !("trackId" in request)) {
		throw new Error("音乐实验室请求缺少音乐 ID");
	}
	const trackId = request.trackId;
	if (typeof trackId !== "string" || !SONG_ID_PATTERN.test(trackId)) {
		throw new Error("音乐实验室音乐 ID 无效");
	}
	return trackId;
}

function parseBatchRequest({ request }: { request: unknown }) {
	if (request === undefined) return {};
	if (!request || typeof request !== "object") {
		throw new Error("音乐缓存批次请求无效");
	}
	const limit = "limit" in request ? request.limit : undefined;
	if (
		limit !== undefined &&
		(typeof limit !== "number" ||
			!Number.isSafeInteger(limit) ||
			limit < 1 ||
			limit > 50)
	) {
		throw new Error("音乐缓存批次大小必须在 1 到 50 之间");
	}
	return limit === undefined ? {} : { limit };
}

async function revealCacheDirectory({
	directoryPath,
}: {
	directoryPath: string;
}) {
	return (await shell.openPath(directoryPath)) === "";
}

export function setupJianyingMusicLabIPC({
	getMainWindow,
	getUserDataDirectory,
	buildCatalog = ({ qcutCacheRoot, refresh }) =>
		buildJianyingMusicLabCatalog({ qcutCacheRoot, refresh }),
	loadTrack = loadJianyingMusicLabTrack,
	cacheNextBatch = cacheNextJianyingMusicBatch,
	revealDirectory = revealCacheDirectory,
}: SetupJianyingMusicLabIPCOptions): JianyingMusicLabIPCController {
	const qcutCacheRoot = path.join(getUserDataDirectory(), "jianying-music-lab");
	let catalogPromise: Promise<JianyingMusicLabCatalog> | null = null;
	let batchPromise: ReturnType<typeof cacheNextBatch> | null = null;
	const readCatalog = ({ refresh }: { refresh: boolean }) => {
		if (!catalogPromise || refresh) {
			catalogPromise = buildCatalog({ qcutCacheRoot, refresh });
		}
		return catalogPromise;
	};

	ipcMain.removeHandler(JIANYING_MUSIC_LAB_LIST_CHANNEL);
	ipcMain.removeHandler(JIANYING_MUSIC_LAB_CACHE_BATCH_CHANNEL);
	ipcMain.removeHandler(JIANYING_MUSIC_LAB_LOAD_CHANNEL);
	ipcMain.removeHandler(JIANYING_MUSIC_LAB_REVEAL_CHANNEL);
	ipcMain.handle(
		JIANYING_MUSIC_LAB_LIST_CHANNEL,
		async (event, request: unknown): Promise<JianyingMusicLabListResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { refresh = false } = parseListRequest({ request });
			if (refresh && batchPromise) {
				throw new Error("音乐缓存批次正在执行，暂时不能刷新");
			}
			console.info(
				`[JianyingMusicLab] ${refresh ? "Refreshing" : "Loading"} local catalog`
			);
			return (await readCatalog({ refresh })).result;
		}
	);
	ipcMain.handle(
		JIANYING_MUSIC_LAB_CACHE_BATCH_CHANNEL,
		async (event, request: unknown): Promise<JianyingMusicLabBatchResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { limit } = parseBatchRequest({ request });
			if (batchPromise) throw new Error("音乐缓存批次正在执行，请稍候");
			console.info(
				`[JianyingMusicLab] Caching next local batch (limit ${limit ?? 20})`
			);
			batchPromise = (async () =>
				cacheNextBatch({
					catalog: await readCatalog({ refresh: false }),
					limit,
				}))();
			try {
				const result = await batchPromise;
				catalogPromise = Promise.resolve(result.updatedCatalog);
				return { catalog: result.catalog, batch: result.batch };
			} finally {
				batchPromise = null;
			}
		}
	);
	ipcMain.handle(
		JIANYING_MUSIC_LAB_LOAD_CHANNEL,
		async (event, request: unknown): Promise<JianyingMusicLabLoadResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const trackId = parseTrackId({ request });
			return loadTrack({
				catalog: await readCatalog({ refresh: false }),
				trackId,
			});
		}
	);
	ipcMain.handle(
		JIANYING_MUSIC_LAB_REVEAL_CHANNEL,
		async (event): Promise<boolean> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			await readCatalog({ refresh: false });
			return revealDirectory({ directoryPath: qcutCacheRoot });
		}
	);

	return {
		dispose: () => {
			catalogPromise = null;
			batchPromise = null;
			ipcMain.removeHandler(JIANYING_MUSIC_LAB_LIST_CHANNEL);
			ipcMain.removeHandler(JIANYING_MUSIC_LAB_CACHE_BATCH_CHANNEL);
			ipcMain.removeHandler(JIANYING_MUSIC_LAB_LOAD_CHANNEL);
			ipcMain.removeHandler(JIANYING_MUSIC_LAB_REVEAL_CHANNEL);
		},
	};
}
