import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_FONT_LAB_INSPECT_CHANNEL,
	JIANYING_FONT_LAB_LIST_CHANNEL,
	JIANYING_FONT_LAB_LOAD_CHANNEL,
	type JianyingFontLabInspectRequest,
	type JianyingFontLabInspectResult,
	type JianyingFontLabListRequest,
	type JianyingFontLabListResult,
	type JianyingFontLabLoadResult,
} from "./jianying-font-lab-contract.js";
import {
	buildJianyingFontCatalog,
	inspectJianyingFontBytes,
	isValidJianyingFontId,
	readVerifiedJianyingFontBytes,
	summarizeJianyingFontCatalog,
	toJianyingFontLoadResult,
	type JianyingFontCatalog,
	type JianyingFontCatalogEntry,
} from "./jianying-font-lab-catalog.js";

const MAXIMUM_INSPECTION_TEXT_LENGTH = 4096;

export interface JianyingFontLabIPCController {
	dispose: () => void;
}

export interface SetupJianyingFontLabIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	buildCatalog?: () => Promise<JianyingFontCatalog>;
	readFontBytes?: ({
		entry,
	}: {
		entry: JianyingFontCatalogEntry;
	}) => Promise<Buffer>;
	inspectFontBytes?: typeof inspectJianyingFontBytes;
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
		throw new Error("字体实验室拒绝了非主窗口请求");
	}
}

function parseListRequest({ request }: { request: unknown }) {
	if (request === undefined) return {} satisfies JianyingFontLabListRequest;
	if (!request || typeof request !== "object") {
		throw new Error("字体实验室列表请求无效");
	}
	const refresh = "refresh" in request ? request.refresh : undefined;
	if (refresh !== undefined && typeof refresh !== "boolean") {
		throw new Error("字体实验室 refresh 参数无效");
	}
	return refresh === undefined
		? ({} satisfies JianyingFontLabListRequest)
		: ({ refresh } satisfies JianyingFontLabListRequest);
}

function parseFontIdRequest({ request }: { request: unknown }) {
	if (!request || typeof request !== "object" || !("fontId" in request)) {
		throw new Error("字体实验室请求缺少字体 ID");
	}
	const fontId = request.fontId;
	if (typeof fontId !== "string" || !isValidJianyingFontId({ fontId })) {
		throw new Error("字体实验室字体 ID 无效");
	}
	return fontId;
}

function parseInspectRequest({ request }: { request: unknown }) {
	const fontId = parseFontIdRequest({ request });
	if (!(request && typeof request === "object" && "text" in request)) {
		throw new Error("字体实验室检查请求缺少文字");
	}
	const text = request.text;
	if (
		typeof text !== "string" ||
		text.length === 0 ||
		text.length > MAXIMUM_INSPECTION_TEXT_LENGTH
	) {
		throw new Error("字体实验室检查文字长度无效");
	}
	return { fontId, text } satisfies JianyingFontLabInspectRequest;
}

function requireCatalogEntry({
	catalog,
	fontId,
}: {
	catalog: JianyingFontCatalog;
	fontId: string;
}) {
	const entry = catalog.entries.find(
		(candidate) => candidate.fontId === fontId
	);
	if (!entry) throw new Error("本机剪映缓存中没有找到该字体");
	return entry;
}

export function setupJianyingFontLabIPC({
	getMainWindow,
	buildCatalog = () => buildJianyingFontCatalog(),
	readFontBytes = readVerifiedJianyingFontBytes,
	inspectFontBytes = inspectJianyingFontBytes,
}: SetupJianyingFontLabIPCOptions): JianyingFontLabIPCController {
	let catalogPromise: Promise<JianyingFontCatalog> | null = null;
	const readCatalog = ({ refresh }: { refresh: boolean }) => {
		if (!catalogPromise || refresh) catalogPromise = buildCatalog();
		return catalogPromise;
	};

	ipcMain.removeHandler(JIANYING_FONT_LAB_LIST_CHANNEL);
	ipcMain.removeHandler(JIANYING_FONT_LAB_LOAD_CHANNEL);
	ipcMain.removeHandler(JIANYING_FONT_LAB_INSPECT_CHANNEL);
	ipcMain.handle(
		JIANYING_FONT_LAB_LIST_CHANNEL,
		async (event, request: unknown): Promise<JianyingFontLabListResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { refresh = false } = parseListRequest({ request });
			const catalog = await readCatalog({ refresh });
			return summarizeJianyingFontCatalog({ catalog });
		}
	);
	ipcMain.handle(
		JIANYING_FONT_LAB_LOAD_CHANNEL,
		async (event, request: unknown): Promise<JianyingFontLabLoadResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const fontId = parseFontIdRequest({ request });
			const catalog = await readCatalog({ refresh: false });
			const entry = requireCatalogEntry({ catalog, fontId });
			const bytes = await readFontBytes({ entry });
			return toJianyingFontLoadResult({ entry, bytes });
		}
	);
	ipcMain.handle(
		JIANYING_FONT_LAB_INSPECT_CHANNEL,
		async (event, request: unknown): Promise<JianyingFontLabInspectResult> => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			const { fontId, text } = parseInspectRequest({ request });
			const catalog = await readCatalog({ refresh: false });
			const entry = requireCatalogEntry({ catalog, fontId });
			const bytes = await readFontBytes({ entry });
			return inspectFontBytes({ entry, bytes, text });
		}
	);

	return {
		dispose: () => {
			catalogPromise = null;
			ipcMain.removeHandler(JIANYING_FONT_LAB_LIST_CHANNEL);
			ipcMain.removeHandler(JIANYING_FONT_LAB_LOAD_CHANNEL);
			ipcMain.removeHandler(JIANYING_FONT_LAB_INSPECT_CHANNEL);
		},
	};
}
