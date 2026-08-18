// @vitest-environment node
import { join } from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_FILTER_LAB_CHANGED_CHANNEL,
	JIANYING_FILTER_LAB_DOWNLOAD_CHANNEL,
	JIANYING_FILTER_LAB_LIST_CHANNEL,
	JIANYING_FILTER_LAB_LOCAL_RUNTIME_CHANNEL,
	JIANYING_FILTER_LAB_LOAD_CHANNEL,
	JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL,
	JIANYING_FILTER_LAB_RENDER_LOCAL_EFFECT_CHANNEL,
	JIANYING_FILTER_LAB_RENDER_LOCAL_PORTRAIT_CHANNEL,
	JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL,
	type JianyingFilterLabListResult,
	type JianyingFilterLabLoadResult,
	type JianyingFilterLabLoadRendererResult,
} from "../jianying-filter-lab-contract.js";
import type {
	JianyingLutEntry,
	JianyingLutReference,
} from "../native-pipeline/filters/filter-lab-lut.js";
import type { JianyingFilterPackageSummary } from "../jianying-filter-package-inspector.js";

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: vi.fn(() => "/tmp/qcut-test-user-data") },
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

import { setupJianyingFilterLabIPC } from "../jianying-filter-lab-handler.js";

function createWindowContext() {
	const mainFrame = {};
	const webContents = {
		isDestroyed: vi.fn(() => false),
		mainFrame,
		send: vi.fn(),
	};
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

function cachedPackage({
	implementation = "single-lut",
}: {
	implementation?: JianyingFilterPackageSummary["implementation"];
} = {}): JianyingFilterPackageSummary {
	return {
		cacheStatus: "cached",
		implementation,
		versions: [],
		hasThumbnail: false,
		issues: [],
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
		const readThumbnail = vi.fn(async () => ({
			mimeType: "image/png" as const,
			bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
			fromCache: true,
		}));
		const controller = setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [reference],
			loadReference,
			resolveTitles: async () =>
				new Map([[`${reference.resourceId}/${reference.version}`, "高清黑白"]]),
			resolveCategories: async () => ({
				order: ["黑白", "高清"],
				byResourceId: new Map([[reference.resourceId, ["黑白", "高清"]]]),
			}),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
			inspectPackages: async () =>
				new Map([
					[
						reference.resourceId,
						{
							...cachedPackage(),
							hasThumbnail: true,
							thumbnailPath: "/private/jianying/cover.png",
						},
					],
				]),
			readThumbnail,
			thumbnailCacheRoot: "/tmp/qcut-thumbnail-cache",
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(listed).toMatchObject({
			count: 1,
			cachedCount: 1,
			availableCount: 1,
			categories: [
				{ name: "黑白", total: 1, cached: 1, available: 1 },
				{ name: "高清", total: 1, cached: 1, available: 1 },
			],
			filters: [
				{
					title: "高清黑白",
					categories: ["黑白", "高清"],
					implementation: "single-lut",
					cacheStatus: "cached",
					available: true,
					hasThumbnail: true,
					luts: [
						{
							lutId: reference.lutId,
							role: "single",
							size: 2,
						},
					],
				},
			],
		});
		expect(listed.filters[0]?.luts[0]).not.toHaveProperty("filePath");

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

		const thumbnail = await getHandler({
			channel: JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL,
		})(context.event, { resourceId: reference.resourceId });
		expect(thumbnail).toMatchObject({
			resourceId: reference.resourceId,
			mimeType: "image/png",
		});
		expect(readThumbnail).toHaveBeenCalledWith({
			source: {
				resourceId: reference.resourceId,
				version: reference.version,
				sourcePath: "/private/jianying/cover.png",
			},
			cacheRoot: "/tmp/qcut-thumbnail-cache",
		});

		controller.dispose();
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_LIST_CHANNEL
		);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_LOAD_CHANNEL
		);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL
		);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL
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
			readVerifications: async () => new Map(),
			listReferences: async () => [reference],
			resolveTitles: async () =>
				new Map([[`${reference.resourceId}/${reference.version}`, "高清黑白"]]),
			resolveCategories: async () => ({
				order: ["黑白", "室内"],
				byResourceId: new Map([[reference.resourceId, ["黑白", "室内"]]]),
			}),
			resolveKnownFilters,
			inspectPackages: async () =>
				new Map([[reference.resourceId, cachedPackage()]]),
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(resolveKnownFilters).toHaveBeenCalledWith({
			references: [reference],
		});
		expect(listed).toMatchObject({
			count: 2,
			cachedCount: 1,
			availableCount: 1,
			categories: [
				{ name: "🍉夏日", total: 1, cached: 0, available: 0 },
				{ name: "黑白", total: 1, cached: 1, available: 1 },
				{ name: "高清", total: 1, cached: 1, available: 1 },
				{ name: "室内", total: 0, cached: 0, available: 0 },
			],
		});
		const missing = listed.filters.find(
			({ resourceId }) => resourceId === uncachedFilter.resourceId
		);
		expect(missing).toMatchObject({
			resourceId: "7100000000000000010",
			title: "白日梦",
			categories: ["🍉夏日"],
			cacheStatus: "uncached",
			implementation: "unknown",
			available: false,
		});
		expect(missing).not.toHaveProperty("filePath");
	});

	it("keeps the full unique catalog and reports category totals", async () => {
		const context = createWindowContext();
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
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
			inspectPackages: async () => new Map(),
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(listed.filters).toHaveLength(2100);
		expect(listed).toMatchObject({
			count: 2100,
			cachedCount: 0,
			availableCount: 0,
			categories: [{ name: "🍉夏日", total: 2100, cached: 0, available: 0 }],
		});
	});

	it("rejects iframe callers and LUT IDs outside the scanned catalog", async () => {
		const context = createWindowContext();
		const reference = createReference();
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [reference],
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({
				order: [],
				byResourceId: new Map(),
			}),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
			inspectPackages: async () =>
				new Map([[reference.resourceId, cachedPackage()]]),
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
		const thumbnail = getHandler({
			channel: JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL,
		});
		await expect(
			thumbnail(context.iframeEvent, { resourceId: reference.resourceId })
		).rejects.toThrow("非主窗口");
		await expect(
			thumbnail(context.event, { resourceId: "../../private" })
		).rejects.toThrow("资源 ID 无效");
	});

	it("invalidates the catalog and notifies the renderer when Jianying cache changes", async () => {
		const context = createWindowContext();
		const listReferences = vi.fn(async () => []);
		let notifyCacheChanged: (() => void) | undefined;
		const disposeWatcher = vi.fn();
		const controller = setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences,
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({ order: [], byResourceId: new Map() }),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
			inspectPackages: async () => new Map(),
			watchCache: ({ onChange }) => {
				notifyCacheChanged = onChange;
				return { dispose: disposeWatcher };
			},
		});
		const list = getHandler({ channel: JIANYING_FILTER_LAB_LIST_CHANNEL });
		await list(context.event);
		await list(context.event);
		expect(listReferences).toHaveBeenCalledOnce();

		notifyCacheChanged?.();
		expect(context.mainWindow.webContents.send).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_CHANGED_CHANNEL
		);
		await list(context.event);
		expect(listReferences).toHaveBeenCalledTimes(2);

		await list(context.event, { refresh: true });
		expect(listReferences).toHaveBeenCalledTimes(3);
		controller.dispose();
		expect(disposeWatcher).toHaveBeenCalledOnce();
	});

	it("downloads an uncached filter package and rescans so the card updates", async () => {
		const context = createWindowContext();
		const knownFilter = {
			resourceId: "7127664822921022734",
			title: "蓝调",
			categories: ["风景"],
			version: "abc123",
			packageUrls: ["https://example.invalid/package.zip"],
		};
		const downloadPackage = vi.fn(async () => ({
			resourceId: knownFilter.resourceId,
			version: knownFilter.version,
			packagePath: "/managed/7127664822921022734/abc123",
		}));
		const listReferences = vi.fn(async () => []);
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences,
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({ order: [], byResourceId: new Map() }),
			resolveKnownFilters: async () => ({
				order: ["风景"],
				filters: [knownFilter],
			}),
			inspectPackages: async () => new Map(),
			downloadPackage,
			watchCache: () => ({ dispose: () => undefined }),
		});
		const download = getHandler({
			channel: JIANYING_FILTER_LAB_DOWNLOAD_CHANNEL,
		});

		await expect(
			download(context.event, { resourceId: knownFilter.resourceId })
		).resolves.toEqual({
			resourceId: knownFilter.resourceId,
			version: "abc123",
		});
		expect(downloadPackage).toHaveBeenCalledWith({ filter: knownFilter });
		// The renderer is told to reload, and the next read must re-scan rather
		// than serve the pre-download catalog.
		expect(context.mainWindow.webContents.send).toHaveBeenCalledWith(
			JIANYING_FILTER_LAB_CHANGED_CHANNEL
		);
		const scansBefore = listReferences.mock.calls.length;
		await getHandler({ channel: JIANYING_FILTER_LAB_LIST_CHANNEL })(
			context.event
		);
		expect(listReferences.mock.calls.length).toBeGreaterThan(scansBefore);
	});

	it("rejects a download for a filter outside the catalog", async () => {
		const context = createWindowContext();
		const downloadPackage = vi.fn();
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [],
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({ order: [], byResourceId: new Map() }),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
			inspectPackages: async () => new Map(),
			downloadPackage,
			watchCache: () => ({ dispose: () => undefined }),
		});
		const download = getHandler({
			channel: JIANYING_FILTER_LAB_DOWNLOAD_CHANNEL,
		});

		await expect(
			download(context.event, { resourceId: "9999999999999999999" })
		).rejects.toThrow("未找到该剪映滤镜目录条目");
		await expect(download(context.iframeEvent, {})).rejects.toThrow("非主窗口");
		expect(downloadPackage).not.toHaveBeenCalled();
	});

	it("retries the catalog after a failed scan instead of caching the rejection", async () => {
		const context = createWindowContext();
		const listReferences = vi
			.fn<() => Promise<never[]>>()
			.mockRejectedValueOnce(new Error("cache unreadable"))
			.mockResolvedValue([]);
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences,
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({ order: [], byResourceId: new Map() }),
			resolveKnownFilters: async () => ({ order: [], filters: [] }),
			inspectPackages: async () => new Map(),
			watchCache: () => ({ dispose: () => undefined }),
		});
		const list = getHandler({ channel: JIANYING_FILTER_LAB_LIST_CHANNEL });

		await expect(list(context.event)).rejects.toThrow("cache unreadable");
		// The retry uses the same refresh:false path every caller uses, so it
		// only succeeds if the rejected promise was cleared rather than memoized.
		await expect(list(context.event)).resolves.toBeDefined();
		expect(listReferences).toHaveBeenCalledTimes(2);
	});

	it("loads a recognized tiled LUT shader through its private cached image", async () => {
		const context = createWindowContext();
		const resourceId = "shader-filter";
		const version = "v1";
		const loadTiledCube = vi.fn(
			async () =>
				createEntry({
					reference: createReference(),
				}).cube
		);
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [],
			loadTiledCube,
			filterCacheRoot: "/cache",
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({
				order: ["黑白"],
				byResourceId: new Map(),
			}),
			resolveKnownFilters: async () => ({
				order: ["黑白"],
				filters: [
					{
						resourceId,
						title: "黑金",
						categories: ["黑白"],
						version,
					},
				],
			}),
			inspectPackages: async () =>
				new Map([
					[
						resourceId,
						{
							...cachedPackage({ implementation: "shader" }),
							renderer: {
								kind: "tiled-lut-8x8" as const,
								container: "artistEffect" as const,
								packageIdentifier: resourceId,
								version,
								relativePath: "AmazingFeature/image/filter.png",
								cubeSize: 64 as const,
							},
						},
					],
				]),
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		const [filter] = listed.filters;
		expect(filter).toMatchObject({
			resourceId,
			implementation: "shader",
			available: true,
		});
		const lutId = filter?.luts[0]?.lutId;
		expect(lutId).toBe("shader-filter/v1/AmazingFeature/image/filter.png");

		const loaded = (await getHandler({
			channel: JIANYING_FILTER_LAB_LOAD_CHANNEL,
		})(context.event, { lutId })) as JianyingFilterLabLoadResult;
		expect(loadTiledCube).toHaveBeenCalledWith({
			// join keeps the expectation correct under Windows separators.
			filePath: join(
				"/cache",
				"artistEffect",
				"shader-filter",
				"v1",
				"AmazingFeature",
				"image",
				"filter.png"
			),
		});
		expect(loaded).toMatchObject({
			resourceId,
			version,
			cube: { size: 2 },
		});
	});

	it("loads both tiled cubes for a package-backed portrait filter", async () => {
		const context = createWindowContext();
		const resourceId = "portrait-filter";
		const version = "v1";
		const loadTiledCube = vi.fn(
			async () =>
				createEntry({
					reference: createReference(),
				}).cube
		);
		const renderer = ({ relativePath }: { relativePath: string }) => ({
			kind: "tiled-lut-8x8" as const,
			container: "artistEffect" as const,
			packageIdentifier: resourceId,
			version,
			relativePath,
			cubeSize: 64 as const,
		});
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [],
			loadTiledCube,
			filterCacheRoot: "/cache",
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({
				order: ["人像"],
				byResourceId: new Map(),
			}),
			resolveKnownFilters: async () => ({
				order: ["人像"],
				filters: [
					{
						resourceId,
						title: "奥林巴斯",
						categories: ["人像"],
						version,
					},
				],
			}),
			inspectPackages: async () =>
				new Map([
					[
						resourceId,
						{
							...cachedPackage({ implementation: "dual-lut" }),
							dualRenderer: {
								kind: "dual-tiled-lut-8x8" as const,
								background: renderer({
									relativePath: "AmazingFeature/image/filter_bg.png",
								}),
								skin: renderer({
									relativePath: "AmazingFeature/image/filter_skin.png",
								}),
							},
						},
					],
				]),
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		const [filter] = listed.filters;
		expect(filter).toMatchObject({
			resourceId,
			implementation: "dual-lut",
			available: true,
			verification: { status: "unverified" },
		});
		const luts = filter?.luts ?? [];
		expect(luts.map(({ role }) => role).sort()).toEqual(["background", "skin"]);

		await Promise.all(
			luts.map(({ lutId }) =>
				getHandler({ channel: JIANYING_FILTER_LAB_LOAD_CHANNEL })(
					context.event,
					{ lutId }
				)
			)
		);
		expect(loadTiledCube).toHaveBeenCalledTimes(2);
		expect(
			loadTiledCube.mock.calls.map(([{ filePath }]) => filePath).sort()
		).toEqual(
			[
				join(
					"/cache",
					"artistEffect",
					resourceId,
					version,
					"AmazingFeature",
					"image",
					"filter_bg.png"
				),
				join(
					"/cache",
					"artistEffect",
					resourceId,
					version,
					"AmazingFeature",
					"image",
					"filter_skin.png"
				),
			].sort()
		);
	});

	it("renders a catalog-verified portrait package through the local provider", async () => {
		const context = createWindowContext();
		const resourceId = "portrait-filter";
		const version = "v1";
		const renderer = ({ relativePath }: { relativePath: string }) => ({
			kind: "tiled-lut-8x8" as const,
			container: "artistEffect" as const,
			packageIdentifier: resourceId,
			version,
			relativePath,
			cubeSize: 64 as const,
		});
		const inspect = vi.fn(async () => ({
			state: "ready" as const,
			message: "ready",
			provider: "jianying-local-effect-v1" as const,
			platform: "darwin",
			bridgeReady: true,
			runtimeReady: true,
			modelReady: true,
		}));
		const render = vi.fn(async ({ rgba }: { rgba: Uint8Array }) => ({
			provider: "jianying-local-effect-v1" as const,
			resourceId,
			width: 1,
			height: 1,
			rgba,
			mask: {
				width: 1,
				height: 1,
				bytes: new Uint8Array([255]),
				orientation: "bottom-left" as const,
			},
		}));
		const clear = vi.fn();
		const renderEffect = vi.fn();
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [],
			filterCacheRoot: "/cache",
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({ order: [], byResourceId: new Map() }),
			resolveKnownFilters: async () => ({
				order: ["人像"],
				filters: [
					{
						resourceId,
						title: "奥林巴斯",
						categories: ["人像"],
						version,
					},
				],
			}),
			inspectPackages: async () =>
				new Map([
					[
						resourceId,
						{
							...cachedPackage({ implementation: "dual-lut" }),
							dualRenderer: {
								kind: "dual-tiled-lut-8x8" as const,
								background: renderer({
									relativePath: "AmazingFeature/image/filter_bg.png",
								}),
								skin: renderer({
									relativePath: "AmazingFeature/image/filter_skin.png",
								}),
							},
						},
					],
				]),
			localProvider: { inspect, render, renderEffect, clear },
		});

		await expect(
			getHandler({ channel: JIANYING_FILTER_LAB_LOCAL_RUNTIME_CHANNEL })(
				context.event,
				{ refresh: true }
			)
		).resolves.toMatchObject({ state: "ready", modelReady: true });
		expect(inspect).toHaveBeenCalledWith({ refresh: true });

		const rgba = new Uint8Array([10, 20, 30, 255]);
		await expect(
			getHandler({
				channel: JIANYING_FILTER_LAB_RENDER_LOCAL_PORTRAIT_CHANNEL,
			})(context.event, {
				resourceId,
				width: 1,
				height: 1,
				sourceKey: "video:portrait",
				timestampSeconds: 1.25,
				rgba,
			})
		).resolves.toMatchObject({ resourceId, width: 1, height: 1 });
		expect(render).toHaveBeenCalledWith({
			resourceId,
			packagePath: join("/cache", "artistEffect", resourceId, version),
			width: 1,
			height: 1,
			sourceKey: "video:portrait",
			timestampSeconds: 1.25,
			rgba,
		});
	});

	it("loads a recognized multi-pass shader without exposing cache paths", async () => {
		const context = createWindowContext();
		const resourceId = "7403664041945681191";
		const version = "59f14f9555fc38667c3ddb0814346cc8";
		const cube = createEntry({ reference: createReference() }).cube;
		const loadMultiPassRecipe = vi.fn(async () => ({
			kind: "sharpen-lut" as const,
			passes: [
				{ kind: "sharpen" as const, amount: 1 },
				{ kind: "lut" as const, cube, intensity: 100 },
			],
		}));
		const renderEffect = vi.fn(async ({ rgba }: { rgba: Uint8Array }) => ({
			provider: "jianying-local-effect-v1" as const,
			resourceId,
			width: 1,
			height: 1,
			rgba,
		}));
		setupJianyingFilterLabIPC({
			getMainWindow: () => context.mainWindow,
			readVerifications: async () => new Map(),
			listReferences: async () => [],
			loadMultiPassRecipe,
			filterCacheRoot: "/cache",
			resolveTitles: async () => new Map(),
			resolveCategories: async () => ({
				order: ["美食"],
				byResourceId: new Map(),
			}),
			resolveKnownFilters: async () => ({
				order: ["美食"],
				filters: [
					{
						resourceId,
						title: "清透美食",
						categories: ["美食"],
						version,
					},
				],
			}),
			inspectPackages: async () =>
				new Map([
					[
						resourceId,
						{
							...cachedPackage({ implementation: "shader" }),
							multiPassRenderer: {
								kind: "sharpen-lut" as const,
								container: "artistEffect" as const,
								packageIdentifier: resourceId,
								version,
								lutRelativePath: "AmazingFeature/image/filter.png",
								passCount: 2,
								fidelity: "structural" as const,
							},
						},
					],
				]),
			localProvider: {
				inspect: vi.fn(),
				render: vi.fn(),
				renderEffect,
				clear: vi.fn(),
			},
		});

		const listed = (await getHandler({
			channel: JIANYING_FILTER_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingFilterLabListResult;
		expect(listed.filters[0]).toMatchObject({
			resourceId,
			implementation: "shader",
			available: true,
			renderer: { kind: "sharpen-lut", passCount: 2 },
			luts: [],
		});

		const loaded = (await getHandler({
			channel: JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL,
		})(context.event, { resourceId })) as JianyingFilterLabLoadRendererResult;
		expect(loadMultiPassRecipe).toHaveBeenCalledWith({
			cacheRoot: "/cache",
			renderer: expect.objectContaining({ kind: "sharpen-lut", version }),
		});
		expect(loaded).toMatchObject({
			resourceId,
			version,
			name: "清透美食",
			fidelity: "native-local",
			nativeEffect: {
				provider: "jianying-local-effect-v1",
				resourceId,
				version,
			},
			passes: [
				{ kind: "sharpen", amount: 1 },
				{ kind: "lut", intensity: 100, cube: { size: 2 } },
			],
		});
		expect(loaded).not.toHaveProperty("filePath");

		const rgba = new Uint8Array([10, 20, 30, 255]);
		await expect(
			getHandler({ channel: JIANYING_FILTER_LAB_RENDER_LOCAL_EFFECT_CHANNEL })(
				context.event,
				{
					resourceId,
					width: 1,
					height: 1,
					intensity: 75,
					sourceKey: "video:effect",
					timestampSeconds: 0.5,
					rgba,
				}
			)
		).resolves.toMatchObject({ resourceId, width: 1, height: 1 });
		expect(renderEffect).toHaveBeenCalledWith({
			resourceId,
			packagePath: join("/cache", "artistEffect", resourceId, version),
			width: 1,
			height: 1,
			intensity: 75,
			sourceKey: "video:effect",
			timestampSeconds: 0.5,
			rgba,
		});
	});
});
