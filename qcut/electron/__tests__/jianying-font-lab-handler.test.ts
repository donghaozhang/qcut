// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_FONT_LAB_INSPECT_CHANNEL,
	JIANYING_FONT_LAB_LIST_CHANNEL,
	JIANYING_FONT_LAB_LOAD_CHANNEL,
	type JianyingFontLabInspectResult,
	type JianyingFontLabListResult,
	type JianyingFontLabLoadResult,
} from "../jianying-font-lab-contract.js";
import type {
	JianyingFontCatalog,
	JianyingFontCatalogEntry,
} from "../jianying-font-lab-catalog.js";

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

import { setupJianyingFontLabIPC } from "../jianying-font-lab-handler.js";

const FONT_ID = `sha256:${"a".repeat(64)}`;

function createWindowContext() {
	const mainFrame = {};
	const webContents = { isDestroyed: vi.fn(() => false), mainFrame };
	const mainWindow = {
		isDestroyed: vi.fn(() => false),
		webContents,
	} as unknown as BrowserWindow;
	return {
		event: {
			sender: webContents,
			senderFrame: mainFrame,
		} as unknown as IpcMainInvokeEvent,
		iframeEvent: {
			sender: webContents,
			senderFrame: {},
		} as unknown as IpcMainInvokeEvent,
		mainWindow,
	};
}

function createEntry(): JianyingFontCatalogEntry {
	return {
		fontId: FONT_ID,
		cssFamily: "QCutLocal_aaaaaaaaaaaaaaaaaaaa",
		familyName: "文悦新青年体",
		fullName: "文悦新青年体 Regular",
		postscriptName: "WenYue-XinQingNianTi",
		subfamilyName: "Regular",
		format: "ttf",
		size: 4,
		sourceKinds: ["effect"],
		filePaths: ["/private/jianying/font.ttf"],
		sha256: "a".repeat(64),
	};
}

function createCatalog(): JianyingFontCatalog {
	return {
		entries: [createEntry()],
		rootCount: 1,
		fileCount: 1,
		duplicateFileCount: 0,
		invalidFileCount: 0,
		oversizedFileCount: 0,
	};
}

function getHandler({ channel }: { channel: string }) {
	const registration = mockHandle.mock.calls.find(
		(call: unknown[]) => call[0] === channel
	);
	if (!registration) throw new Error(`Missing IPC handler for ${channel}`);
	return registration[1] as (
		event: IpcMainInvokeEvent,
		request?: unknown
	) => Promise<unknown>;
}

describe("Jianying font lab IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists sanitized metadata and loads only a catalog font", async () => {
		const context = createWindowContext();
		const entry = createEntry();
		const buildCatalog = vi.fn(async () => createCatalog());
		const readFontBytes = vi.fn(async () => Buffer.from("font"));
		const controller = setupJianyingFontLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog,
			readFontBytes,
		});

		const listed = (await getHandler({
			channel: JIANYING_FONT_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFontLabListResult;
		expect(listed).toMatchObject({ count: 1, fileCount: 1 });
		expect(listed.fonts[0]).not.toHaveProperty("filePaths");
		expect(JSON.stringify(listed)).not.toContain("/private");

		const loaded = (await getHandler({
			channel: JIANYING_FONT_LAB_LOAD_CHANNEL,
		})(context.event, { fontId: FONT_ID })) as JianyingFontLabLoadResult;
		expect(readFontBytes).toHaveBeenCalledWith({ entry });
		expect(Array.from(loaded.bytes)).toEqual(Array.from(Buffer.from("font")));
		expect(loaded.font.fontId).toBe(FONT_ID);

		controller.dispose();
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FONT_LAB_INSPECT_CHANNEL
		);
	});

	it("checks glyph coverage with the exact verified bytes", async () => {
		const context = createWindowContext();
		const inspectFontBytes = vi.fn(
			({ entry }: { entry: JianyingFontCatalogEntry }) => ({
				fontId: entry.fontId,
				covered: false,
				checkedCodePointCount: 4,
				missing: [{ character: "𠮷", codePoint: 0x20bb7, unicode: "U+20BB7" }],
			})
		);
		setupJianyingFontLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => createCatalog(),
			readFontBytes: async () => Buffer.from("font"),
			inspectFontBytes,
		});

		const inspected = (await getHandler({
			channel: JIANYING_FONT_LAB_INSPECT_CHANNEL,
		})(context.event, {
			fontId: FONT_ID,
			text: "剪映𠮷",
		})) as JianyingFontLabInspectResult;
		expect(inspected.covered).toBe(false);
		expect(inspected.missing[0].unicode).toBe("U+20BB7");
		expect(inspectFontBytes).toHaveBeenCalledWith({
			entry: createEntry(),
			bytes: Buffer.from("font"),
			text: "剪映𠮷",
		});
	});

	it("rejects iframe callers, malformed IDs, unknown fonts, and invalid text", async () => {
		const context = createWindowContext();
		setupJianyingFontLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => createCatalog(),
			readFontBytes: async () => Buffer.from("font"),
		});
		const list = getHandler({ channel: JIANYING_FONT_LAB_LIST_CHANNEL });
		await expect(list(context.iframeEvent)).rejects.toThrow("非主窗口");

		const load = getHandler({ channel: JIANYING_FONT_LAB_LOAD_CHANNEL });
		await expect(
			load(context.event, { fontId: "../../private" })
		).rejects.toThrow("ID 无效");
		await expect(
			load(context.event, { fontId: `sha256:${"b".repeat(64)}` })
		).rejects.toThrow("没有找到");

		const inspect = getHandler({ channel: JIANYING_FONT_LAB_INSPECT_CHANNEL });
		await expect(
			inspect(context.event, { fontId: FONT_ID, text: "" })
		).rejects.toThrow("长度无效");
	});

	it("rebuilds the catalog only when refresh is requested", async () => {
		const context = createWindowContext();
		const buildCatalog = vi.fn(async () => createCatalog());
		setupJianyingFontLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog,
		});
		const list = getHandler({ channel: JIANYING_FONT_LAB_LIST_CHANNEL });
		await list(context.event);
		await list(context.event);
		await list(context.event, { refresh: true });
		expect(buildCatalog).toHaveBeenCalledTimes(2);
	});
});
