// @vitest-environment node
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL,
	JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL,
	JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
	type JianyingTextAnimationLabListResult,
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
		capabilities: {
			staticTexture: false,
			multipleStrokes: false,
			animationComponents: false,
			scriptInfoSticker: false,
			shaderComponents: false,
			threeDimensional: false,
			feedbackComponents: false,
		},
		diagnostics: [],
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

function createAnimationCatalog(): JianyingTextAnimationLabListResult {
	return {
		count: 1,
		animations: [
			{
				animationId: `loop:7168819879183651359/${"d".repeat(32)}`,
				resourceId: "7168819879183651359",
				packageHash: "d".repeat(32),
				title: "翻页 I",
				slot: "loop",
				duration: 1.2,
				capabilities: {
					staticTexture: false,
					multipleStrokes: false,
					animationComponents: true,
					scriptInfoSticker: false,
					shaderComponents: true,
					threeDimensional: true,
					feedbackComponents: false,
				},
			},
		],
		catalogCount: 3,
		packageCount: 1,
		missingPackageCount: 2,
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
		capabilities: {
			staticTexture: false,
			multipleStrokes: false,
			animationComponents: true,
			scriptInfoSticker: true,
			shaderComponents: false,
			threeDimensional: false,
			feedbackComponents: false,
		},
		diagnostics: [],
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

function createAmazingFeatureEntry({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}): JianyingTextStyleCatalogEntry {
	return {
		styleId: `${resourceId}/${version}`,
		resourceId,
		version,
		packageKind: "AmazingFeature",
		packageVersion: "runtime",
		fillKind: "unknown",
		strokeCount: 0,
		innerShadowCount: 0,
		shadowCount: 0,
		textureLayerCount: 0,
		capabilities: {
			staticTexture: true,
			multipleStrokes: false,
			animationComponents: true,
			scriptInfoSticker: false,
			shaderComponents: true,
			threeDimensional: false,
			feedbackComponents: false,
		},
		diagnostics: [],
		hasCover: true,
		compatibility: "preview-only",
	};
}

function createInfoStickerEntry({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}): JianyingTextStyleCatalogEntry {
	return {
		...createRuntimeEntry(),
		styleId: `${resourceId}/${version}`,
		resourceId,
		version,
		packageKind: "InfoSticker",
		capabilities: {
			staticTexture: false,
			multipleStrokes: false,
			animationComponents: false,
			scriptInfoSticker: false,
			shaderComponents: false,
			threeDimensional: false,
			feedbackComponents: false,
		},
		runtimeReference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "InfoSticker",
			resourceId,
			packageHash: version,
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

	it("lists sanitized animation references and refreshes them independently", async () => {
		const context = createWindowContext();
		const buildAnimationCatalog = vi.fn(async () => createAnimationCatalog());
		setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => createCatalog(),
			buildAnimationCatalog,
			resolveMetadata: async () => new Map(),
		});
		const listAnimations = getHandler({
			channel: JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL,
		});

		const first = (await listAnimations(
			context.event
		)) as JianyingTextAnimationLabListResult;
		expect(first).toEqual(createAnimationCatalog());
		expect(JSON.stringify(first)).not.toContain("/Users/");
		await listAnimations(context.event);
		await listAnimations(context.event, { refresh: true });
		expect(buildAnimationCatalog).toHaveBeenCalledTimes(2);
		await expect(listAnimations(context.iframeEvent)).rejects.toThrow(
			"非主窗口"
		);
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

	it("requires positive flower ownership for top-level AmazingFeature packages", async () => {
		const context = createWindowContext();
		const flowerEntry = createAmazingFeatureEntry({
			resourceId: "7000000000000000001",
			version: "1".repeat(32),
		});
		const filterEntry = createAmazingFeatureEntry({
			resourceId: "7000000000000000002",
			version: "2".repeat(32),
		});
		const ambiguousEntry = createAmazingFeatureEntry({
			resourceId: "7000000000000000003",
			version: "3".repeat(32),
		});
		const resolveOwnership = vi.fn(
			async () =>
				new Map([
					[
						flowerEntry.styleId,
						{
							kind: "flower" as const,
							match: "resource-lineage" as const,
							catalogFamilies: ["flower" as const],
						},
					],
					[
						filterEntry.styleId,
						{
							kind: "non-flower" as const,
							match: "exact" as const,
							catalogFamilies: ["filter" as const],
						},
					],
					[
						ambiguousEntry.styleId,
						{
							kind: "ambiguous" as const,
							match: "exact" as const,
							catalogFamilies: ["flower" as const, "filter" as const],
						},
					],
				])
		);
		setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => ({
				entries: [flowerEntry, filterEntry, ambiguousEntry],
				packageCount: 3,
				invalidPackageCount: 0,
			}),
			resolveMetadata: async () => new Map(),
			resolveOwnership,
		});

		const listed = (await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingTextStyleLabListResult;

		expect(listed.styles.map(({ styleId }) => styleId)).toEqual([
			flowerEntry.styleId,
		]);
		expect(resolveOwnership).toHaveBeenCalledWith({
			references: [flowerEntry, filterEntry, ambiguousEntry],
		});
	});

	it("hides non-flower and unclassified InfoSticker component packages", async () => {
		const context = createWindowContext();
		const catalogEntry = createInfoStickerEntry({
			resourceId: "7000000000000000011",
			version: "1".repeat(32),
		});
		const flowerEntry = createInfoStickerEntry({
			resourceId: "7000000000000000012",
			version: "2".repeat(32),
		});
		const filterEntry = createInfoStickerEntry({
			resourceId: "7000000000000000013",
			version: "3".repeat(32),
		});
		const unclassifiedEntry = createInfoStickerEntry({
			resourceId: "7000000000000000014",
			version: "4".repeat(32),
		});
		const resolveOwnership = vi.fn(
			async () =>
				new Map([
					[
						flowerEntry.styleId,
						{
							kind: "flower" as const,
							match: "resource-lineage" as const,
							catalogFamilies: ["flower" as const],
							title: "项目恢复花字",
						},
					],
					[
						filterEntry.styleId,
						{
							kind: "non-flower" as const,
							match: "exact" as const,
							catalogFamilies: ["filter" as const],
						},
					],
					[
						unclassifiedEntry.styleId,
						{
							kind: "unclassified" as const,
							match: "none" as const,
							catalogFamilies: [],
						},
					],
				])
		);
		setupJianyingTextStyleLabIPC({
			getMainWindow: () => context.mainWindow,
			buildCatalog: async () => ({
				entries: [catalogEntry, flowerEntry, filterEntry, unclassifiedEntry],
				packageCount: 4,
				invalidPackageCount: 0,
			}),
			resolveMetadata: async () =>
				new Map([
					[
						catalogEntry.styleId,
						{ title: "目录花字", categoryIds: ["popular" as const] },
					],
				]),
			resolveOwnership,
		});

		const listed = (await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		})(context.event)) as JianyingTextStyleLabListResult;

		expect(listed.styles).toHaveLength(2);
		expect(listed.styles.map(({ styleId }) => styleId)).toEqual(
			expect.arrayContaining([catalogEntry.styleId, flowerEntry.styleId])
		);
		expect(
			listed.styles.find(({ styleId }) => styleId === flowerEntry.styleId)
				?.title
		).toBe("项目恢复花字");
		expect(resolveOwnership).toHaveBeenCalledWith({
			references: [flowerEntry, filterEntry, unclassifiedEntry],
		});
	});

	it("serves both catalogs from the disk snapshot on the next launch", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "text-lab-handler-"));
		const cacheFilePath = join(workspace, "snapshot.json");
		const context = createWindowContext();
		const buildCatalog = vi.fn(async () => createCatalog());
		const buildAnimationCatalog = vi.fn(async () => createAnimationCatalog());
		const options = {
			getMainWindow: () => context.mainWindow,
			buildCatalog,
			buildAnimationCatalog,
			resolveMetadata: async () =>
				new Map([
					[STYLE_ID, { title: "黄色花字", categoryIds: ["yellow" as const] }],
				]),
			snapshotCacheFilePath: cacheFilePath,
			computeSnapshotFingerprint: async () => "test-fingerprint",
		};

		const first = setupJianyingTextStyleLabIPC(options);
		const firstListed = await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		})(context.event);
		expect(buildCatalog).toHaveBeenCalledTimes(1);
		await vi.waitFor(async () => {
			await readFile(cacheFilePath, "utf8");
		});
		first.dispose();
		vi.clearAllMocks();

		const second = setupJianyingTextStyleLabIPC(options);
		const relisted = await getHandler({
			channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL,
		})(context.event);
		const animations = await getHandler({
			channel: JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL,
		})(context.event);
		expect(relisted).toEqual(firstListed);
		expect(animations).toEqual(createAnimationCatalog());
		expect(buildCatalog).not.toHaveBeenCalled();
		expect(buildAnimationCatalog).not.toHaveBeenCalled();

		await getHandler({ channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL })(
			context.event,
			{ refresh: true }
		);
		expect(buildCatalog).toHaveBeenCalledTimes(1);
		second.dispose();
	});

	it("rebuilds both snapshot halves when one catalog refreshes", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "text-lab-handler-"));
		const cacheFilePath = join(workspace, "snapshot.json");
		const context = createWindowContext();
		const staleAnimations = createAnimationCatalog();
		const rebuiltAnimations = {
			...createAnimationCatalog(),
			count: 2,
			catalogCount: 2,
		};
		const buildAnimationCatalog = vi.fn(async () => staleAnimations);
		const options = {
			getMainWindow: () => context.mainWindow,
			buildCatalog: vi.fn(async () => createCatalog()),
			buildAnimationCatalog,
			resolveMetadata: async () =>
				new Map([
					[STYLE_ID, { title: "黄色花字", categoryIds: ["yellow" as const] }],
				]),
			snapshotCacheFilePath: cacheFilePath,
			computeSnapshotFingerprint: async () => "test-fingerprint",
		};

		// Seed the shared snapshot with both catalogs.
		const first = setupJianyingTextStyleLabIPC(options);
		await getHandler({ channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL })(
			context.event
		);
		await getHandler({ channel: JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL })(
			context.event
		);
		await vi.waitFor(async () => {
			await readFile(cacheFilePath, "utf8");
		});
		first.dispose();

		// Next launch serves from the snapshot; the animation packages have
		// since changed on disk. A styles-only refresh must not persist the
		// snapshot-era animations under the new write.
		buildAnimationCatalog.mockImplementation(async () => rebuiltAnimations);
		const second = setupJianyingTextStyleLabIPC(options);
		await getHandler({ channel: JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL })(
			context.event
		);
		await getHandler({ channel: JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL })(
			context.event,
			{ refresh: true }
		);
		await vi.waitFor(async () => {
			const persisted = JSON.parse(await readFile(cacheFilePath, "utf8"));
			expect(persisted.animations.count).toBe(rebuiltAnimations.count);
		});
		expect(buildAnimationCatalog).toHaveBeenCalled();
		second.dispose();
	});
});
