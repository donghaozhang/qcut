// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_FILTER_LAB_LIST_CHANNEL,
	JIANYING_FILTER_LAB_LOAD_CHANNEL,
	type JianyingFilterLabListResult,
	type JianyingFilterLabLoadResult,
} from "../jianying-filter-lab-contract.js";
import type {
	JianyingLutEntry,
	JianyingLutReference,
} from "../native-pipeline/filters/filter-lab-lut.js";

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

import { setupJianyingFilterLabIPC } from "../jianying-filter-lab-handler.js";

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

function createReference(): JianyingLutReference {
	return {
		lutId:
			"7429744855724641545/f4d46cb5bca43ef171199ea673d53b00/filter.cube.vf",
		resourceId: "7429744855724641545",
		version: "f4d46cb5bca43ef171199ea673d53b00",
		fileName: "filter.cube.vf",
		filePath: "/private/jianying/filter.cube.vf",
		role: "single",
		size: 2,
	};
}

function createEntry({
	reference,
}: {
	reference: JianyingLutReference;
}): JianyingLutEntry {
	return {
		...reference,
		cube: {
			size: 2,
			values: new Float64Array([
				0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
			]),
		},
		chroma: 0.5,
	};
}

describe("Jianying filter lab IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists metadata without paths and loads only the exact selected LUT", async () => {
		const context = createWindowContext();
		const reference = createReference();
		const loadReference = vi.fn(async () => createEntry({ reference }));
		const controller = setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			listReferences: async () => [reference],
			loadReference,
			resolveTitles: async () =>
				new Map([[`${reference.resourceId}/${reference.version}`, "高清黑白"]]),
			resolveCategories: async () => ({
				order: ["黑白", "高清"],
				byResourceId: new Map([[reference.resourceId, ["黑白", "高清"]]]),
			}),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(listed).toMatchObject({
			count: 1,
			categoryOrder: ["黑白", "高清"],
			uncached: [],
			luts: [
				{
					lutId: reference.lutId,
					title: "高清黑白",
					role: "single",
					size: 2,
					categories: ["黑白", "高清"],
				},
			],
		});
		expect(listed.luts[0]).not.toHaveProperty("filePath");

		const loaded = (await getHandler({
			channel: JIANYING_FILTER_LAB_LOAD_CHANNEL,
		})(context.event, {
			lutId: reference.lutId,
		})) as JianyingFilterLabLoadResult;
		expect(loadReference).toHaveBeenCalledWith({ reference });
		expect(loaded.title).toBe("高清黑白");
		expect(loaded.cube).toMatchObject({
			size: 2,
			domainMin: [0, 0, 0],
			domainMax: [1, 1, 1],
		});
		expect(loaded.cube.values).toHaveLength(24);

		controller.dispose();
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_LIST_CHANNEL
		);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_LOAD_CHANNEL
		);
	});

	it("lists known-but-uncached filters with a panel-ordered category union", async () => {
		const context = createWindowContext();
		const reference = createReference();
		const uncachedFilter = {
			resourceId: "7100000000000000010",
			title: "白日梦",
			categories: ["🍉夏日"],
			filePath: "/private/should-never-leak",
		};
		const resolveKnownFilters = vi.fn(async () => ({
			order: ["🍉夏日", "黑白", "高清"],
			filters: [
				{
					resourceId: reference.resourceId,
					title: "高清黑白",
					categories: ["黑白", "高清"],
				},
				uncachedFilter,
			],
		}));
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			listReferences: async () => [reference],
			resolveTitles: async () =>
				new Map([[`${reference.resourceId}/${reference.version}`, "高清黑白"]]),
			resolveCategories: async () => ({
				order: ["黑白", "室内"],
				byResourceId: new Map([[reference.resourceId, ["黑白", "室内"]]]),
			}),
			resolveKnownFilters,
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(resolveKnownFilters).toHaveBeenCalledWith({
			references: [reference],
		});
		// The cached resource never appears in `uncached`, and unknown extra
		// fields (e.g. a filePath) are stripped.
		expect(listed.uncached).toEqual([
			{
				resourceId: "7100000000000000010",
				title: "白日梦",
				categories: ["🍉夏日"],
			},
		]);
		expect(listed.uncached[0]).not.toHaveProperty("filePath");
		// Panel-ordered union of cached-LUT and catalog categories.
		expect(listed.categoryOrder).toEqual(["🍉夏日", "黑白", "高清", "室内"]);
	});

	it("caps the uncached catalog list defensively", async () => {
		const context = createWindowContext();
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			listReferences: async () => [],
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({
				order: [],
				byResourceId: new Map(),
			}),
			resolveKnownFilters: async () => ({
				order: ["🍉夏日"],
				filters: Array.from({ length: 2100 }, (_, index) => ({
					resourceId: `82${index.toString().padStart(17, "0")}`,
					title: `滤镜${index}`,
					categories: ["🍉夏日"],
				})),
			}),
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(listed.uncached).toHaveLength(2000);
		expect(listed.count).toBe(0);
	});

	it("rejects iframe callers and LUT IDs outside the scanned catalog", async () => {
		const context = createWindowContext();
		const reference = createReference();
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			listReferences: async () => [reference],
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({
				order: [],
				byResourceId: new Map(),
			}),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
		});
		const list = getHandler({ channel: JIANYING_FILTER_LAB_LIST_CHANNEL });
		await expect(list(context.iframeEvent)).rejects.toThrow("非主窗口");

		const load = getHandler({ channel: JIANYING_FILTER_LAB_LOAD_CHANNEL });
		await expect(
			load(context.event, { lutId: "unknown/version/filter.cube.vf" })
		).rejects.toThrow("没有找到");
		await expect(
			load(context.event, { lutId: "../../private" })
		).rejects.toThrow("LUT ID 无效");
	});
});
