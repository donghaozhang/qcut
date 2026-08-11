// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
	JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
	type JianyingTextStyleLabCoverResult,
	type JianyingTextStyleLabListResult,
} from "../jianying-text-style-lab-contract.js";
import type {
	JianyingTextStyleCatalog,
	JianyingTextStyleCatalogEntry,
} from "../jianying-text-style-lab-catalog.js";

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

import { setupJianyingTextStyleLabIPC } from "../jianying-text-style-lab-handler.js";

const STYLE_ID = `7405879107424111910/${"a".repeat(32)}`;
const SCRIPT_STYLE_ID = `7328639616670649634/${"b".repeat(32)}`;

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

function createEntry(): JianyingTextStyleCatalogEntry {
	return {
		styleId: STYLE_ID,
		resourceId: "7405879107424111910",
		version: "a".repeat(32),
		packageKind: "TextStyle",
		packageVersion: "3.0",
		fillKind: "solid",
		strokeCount: 1,
		innerShadowCount: 0,
		shadowCount: 1,
		textureLayerCount: 0,
		hasCover: true,
		compatibility: "flat-compatible",
		approximation: {
			version: 1,
			color: "#ffcc00",
			strokeColor: "#111111",
			strokeWidth: 3,
			strokeOpacity: 1,
			shadowColor: "#333333",
			shadowOpacity: 0.8,
			shadowOffsetX: 4,
			shadowOffsetY: 4,
			shadowBlur: 0,
			glowColor: "#ffffff",
			glowOpacity: 0,
			glowBlur: 12,
		},
		coverPath: "/private/jianying/cover_icon.png",
	};
}

function createCatalog(): JianyingTextStyleCatalog {
	return {
		entries: [createEntry()],
		packageCount: 224,
		invalidPackageCount: 0,
	};
}

function createRuntimeEntry(): JianyingTextStyleCatalogEntry {
	return {
		styleId: SCRIPT_STYLE_ID,
		resourceId: "7328639616670649634",
		version: "b".repeat(32),
		packageKind: "ScriptInfoSticker",
		packageVersion: "runtime",
		fillKind: "unknown",
		strokeCount: 0,
		innerShadowCount: 0,
		shadowCount: 0,
		textureLayerCount: 0,
		hasCover: false,
		compatibility: "native-runtime",
		runtimeReference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId: "7328639616670649634",
			packageHash: "b".repeat(32),
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		},
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

describe("Jianying text style lab IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists sanitized style metadata and reads only a catalog cover", async () => {
		const context = createWindowContext();
		const entry = createEntry();
		const buildCatalog = vi.fn(async () => createCatalog());
		const readCover = vi.fn(async () => Buffer.from("cover"));
		const controller = setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog,
			resolveMetadata: async () =>
				new Map([
					[
						`${entry.resourceId}/${entry.version}`,
						{
							title: "黄色花字",
							categoryIds: ["popular" as const, "yellow" as const],
						},
					],
				]),
			readCover,
		});

		const listed = (await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingTextStyleLabListResult;
		expect(listed).toMatchObject({
			count: 1,
			packageCount: 224,
			styles: [
				{
					styleId: STYLE_ID,
					title: "黄色花字",
					categoryIds: ["popular", "yellow"],
				},
			],
			categories: expect.arrayContaining([
				{ id: "popular", label: "热门", count: 1 },
				{ id: "purple", label: "紫色", count: 0 },
			]),
		});
		expect(JSON.stringify(listed)).not.toContain("/private");
		expect(listed.styles[0]).not.toHaveProperty("coverPath");

		const cover = (await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
		})(context.event, {
			styleId: STYLE_ID,
		})) as JianyingTextStyleLabCoverResult;
		expect(readCover).toHaveBeenCalledWith({ entry });
		expect(Array.from(cover.bytes)).toEqual(Array.from(Buffer.from("cover")));

		controller.dispose();
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL
		);
	});

	it("rejects iframe callers, malformed IDs, and unknown styles", async () => {
		const context = createWindowContext();
		setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => createCatalog(),
			resolveMetadata: async () => new Map(),
		});
		const list = getHandler({ channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL });
		await expect(list(context.iframeEvent)).rejects.toThrow("非主窗口");

		const cover = getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
		});
		await expect(
			cover(context.event, { styleId: "../../private/style" })
		).rejects.toThrow("ID 无效");
		await expect(
			cover(context.event, {
				styleId: `7405879107424111910/${"b".repeat(32)}`,
			})
		).rejects.toThrow("没有找到");
	});

	it("reuses the catalog until refresh is requested", async () => {
		const context = createWindowContext();
		const buildCatalog = vi.fn(async () => createCatalog());
		setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog,
			resolveMetadata: async () =>
				new Map([
					[STYLE_ID, { title: "黄色花字", categoryIds: ["yellow" as const] }],
				]),
		});
		const list = getHandler({ channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL });
		await list(context.event);
		await list(context.event);
		await list(context.event, { refresh: true });
		expect(buildCatalog).toHaveBeenCalledTimes(2);
	});

	it("keeps runtime packages discoverable without catalog metadata", async () => {
		const context = createWindowContext();
		const metadataEntry = createEntry();
		const runtimeEntry = createRuntimeEntry();
		const hiddenEntry = {
			...createEntry(),
			styleId: `7405879107424111911/${"c".repeat(32)}`,
			resourceId: "7405879107424111911",
			version: "c".repeat(32),
		};
		setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => ({
				entries: [metadataEntry, runtimeEntry, hiddenEntry],
				packageCount: 3,
				invalidPackageCount: 0,
			}),
			resolveMetadata: async () =>
				new Map([
					[
						metadataEntry.styleId,
						{ title: "黄色花字", categoryIds: ["yellow" as const] },
					],
				]),
		});

		const listed = (await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingTextStyleLabListResult;

		expect(listed.styles.map(({ styleId }) => styleId)).toEqual([
			metadataEntry.styleId,
			runtimeEntry.styleId,
		]);
		expect(listed.styles[1]).toMatchObject({
			resourceId: runtimeEntry.resourceId,
			packageKind: "ScriptInfoSticker",
			categoryIds: [],
			compatibility: "native-runtime",
		});
	});
});
