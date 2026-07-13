/**
 * Timeline right-click context menu — regression guard.
 *
 * Background: useTimelineZoom previously called setPointerCapture on every
 * pointerdown including mouse pointers, which redirected the post-mouseup
 * `contextmenu` event to the zoom container and suppressed Radix context
 * menus on timeline clips underneath. Fixed in commit 3930b8ce9 by scoping
 * the capture to touch pointers only.
 *
 * This test must use a real button:right click — synthetic dispatch on the
 * element bypasses the OS pointer pipeline that triggered the original bug,
 * so it would not catch a recurrence.
 */

import {
	test,
	expect,
	createTestProject,
	importTestVideo,
} from "./helpers/electron-helpers";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";

interface ContextMenuTimelineState {
	history: unknown[];
	rippleEditingEnabled: boolean;
	selectedElements: Array<{ elementId: string; trackId: string }>;
	toggleRippleEditing: () => void;
	tracks: Array<{ elements: unknown[] }>;
}

interface ContextMenuWindow extends Window {
	__timelineStore: {
		getState: () => ContextMenuTimelineState;
	};
}

async function addVideoClipToTimeline({ page }: { page: Page }) {
	await createTestProject(page, "Context Menu Regression");
	await importTestVideo(page);

	const mediaItem = page.locator('[data-testid="media-item"]').first();
	await expect(mediaItem).toBeVisible({ timeout: 10_000 });
	const timelineTrack = page.getByTestId("timeline-track").first();
	await mediaItem.dragTo(timelineTrack);

	const clip = page.locator('[data-testid="timeline-element"]').first();
	await expect(clip).toBeVisible({ timeout: 10_000 });
	await expect
		.poll(async () =>
			page.evaluate(() =>
				(window as any).__mediaStore
					.getState()
					.mediaItems.some(
						(item: { type?: string; localPath?: string }) =>
							item.type === "video" && !!item.localPath
					)
			)
		)
		.toBe(true);
	return clip;
}

async function openVideoClipMenu({
	page,
	clip,
}: {
	page: Page;
	clip: Locator;
}) {
	await clip.click({ button: "right" });
	const menu = page.getByTestId("video-clip-context-menu");
	await expect(menu).toBeVisible({ timeout: 5_000 });
	return menu;
}

function menuItem({ menu, label }: { menu: Locator; label: string }) {
	return menu.getByRole("menuitem").filter({ hasText: label }).first();
}

async function duplicateAndSelectBoth({ page }: { page: Page }) {
	await page.keyboard.press("Meta+d");
	const clips = page.locator('[data-testid="timeline-element"]');
	await expect(clips).toHaveCount(2);
	await page.evaluate(() => {
		const timeline = (window as any).__timelineStore.getState();
		const track = timeline.tracks[0];
		timeline.setSelectedElements(
			track.elements.map((element: { id: string }) => ({
				trackId: track.id,
				elementId: element.id,
			}))
		);
	});
	return clips;
}

test.describe("Timeline Right-Click Context Menu", () => {
	test("right-clicking a video opens the complete clip workflow menu", async ({
		page,
	}) => {
		const clip = await addVideoClipToTimeline({ page });
		const menu = await openVideoClipMenu({ page, clip });
		await page.waitForTimeout(500);
		const screenshotDirectory = resolve("output/playwright");
		await mkdir(screenshotDirectory, { recursive: true });
		await page.screenshot({
			path: resolve(screenshotDirectory, "timeline-video-context-menu.png"),
		});
		await menu.screenshot({
			path: resolve(
				screenshotDirectory,
				"timeline-video-context-menu-detail.png"
			),
		});

		for (const label of [
			"复制",
			"剪切",
			"复制属性",
			"粘贴属性",
			"删除",
			"AI 生成",
			"基础编辑",
			"智能镜头分割",
			"智能口播",
			"识别语音/字幕",
			"人声分离",
			"分离音频",
			"导出所选片段",
			"停用片段",
			"重新链接片段",
			"替换片段",
			"LUT",
			"打开文件所在位置",
			"时间区域",
			"渲染",
		]) {
			const item = menuItem({ menu, label });
			await item.scrollIntoViewIfNeeded();
			await expect(item).toBeVisible();
		}
		await expect(menuItem({ menu, label: "粘贴属性" })).toHaveAttribute(
			"data-disabled"
		);

		// Close the menu so it doesn't leak into other tests in the same worker.
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden({ timeout: 2_000 });
	});

	test("copy and keyboard paste preserve the selected source range", async ({
		page,
	}) => {
		const clip = await addVideoClipToTimeline({ page });
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const track = timeline.tracks[0];
			const element = track.elements[0];
			timeline.updateElementTrim(track.id, element.id, 0.5, 0.75);
			(window as any).__playbackStore.getState().seek(2);
		});

		const menu = await openVideoClipMenu({ page, clip });
		await menuItem({ menu, label: "复制" }).click();
		await page.keyboard.press("Meta+v");

		await expect(page.locator('[data-testid="timeline-element"]')).toHaveCount(
			2
		);
		const pasted = await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			return timeline.tracks[0].elements.find(
				(element: { startTime: number }) => element.startTime === 2
			);
		});
		expect(pasted).toEqual(
			expect.objectContaining({
				startTime: 2,
				trimStart: 0.5,
				trimEnd: 0.75,
			})
		);
	});

	test("ripple delete clears the removed clip selection in one transaction", async ({
		page,
	}) => {
		const clip = await addVideoClipToTimeline({ page });
		const historyBeforeDelete = await page.evaluate(() => {
			const timeline = (window as unknown as ContextMenuWindow).__timelineStore;
			const state = timeline.getState();
			if (!state.rippleEditingEnabled) state.toggleRippleEditing();
			return timeline.getState().history.length;
		});
		const menu = await openVideoClipMenu({ page, clip });
		await menuItem({ menu, label: "删除" }).click();

		await expect(page.getByTestId("timeline-element")).toHaveCount(0);
		await expect
			.poll(() =>
				page.evaluate(() => {
					const state = (
						window as unknown as ContextMenuWindow
					).__timelineStore.getState();
					return {
						elementCount: state.tracks.flatMap((track) => track.elements)
							.length,
						historyCount: state.history.length,
						selectedCount: state.selectedElements.length,
					};
				})
			)
			.toEqual({
				elementCount: 0,
				historyCount: historyBeforeDelete + 1,
				selectedCount: 0,
			});
	});

	test("copy and paste attributes changes styling without replacing clip timing", async ({
		page,
	}) => {
		const firstClip = await addVideoClipToTimeline({ page });
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const track = timeline.tracks[0];
			const element = track.elements[0];
			timeline.updateMediaElement(track.id, element.id, {
				opacity: 0.42,
				rotation: 17,
			});
			(window as any).__playbackStore.getState().seek(2);
		});

		const firstMenu = await openVideoClipMenu({ page, clip: firstClip });
		await menuItem({ menu: firstMenu, label: "复制属性" }).click();
		await page.keyboard.press("Meta+d");
		await expect(page.locator('[data-testid="timeline-element"]')).toHaveCount(
			2
		);
		const timingBeforePaste = await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const second = timeline.tracks[0].elements[1];
			return {
				startTime: second.startTime,
				duration: second.duration,
				trimStart: second.trimStart,
				trimEnd: second.trimEnd,
				mediaId: second.mediaId,
			};
		});

		const secondClip = page.locator('[data-testid="timeline-element"]').nth(1);
		const menu = await openVideoClipMenu({ page, clip: secondClip });
		const pasteAttributes = menuItem({ menu, label: "粘贴属性" });
		await expect(pasteAttributes).not.toHaveAttribute("data-disabled");
		await pasteAttributes.click();

		const pasted = await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			return timeline.tracks[0].elements[1];
		});
		expect(pasted).toEqual(
			expect.objectContaining({
				...timingBeforePaste,
				opacity: 0.42,
				rotation: 17,
			})
		);
	});

	test("groups and ungroups selected clips from the context menu", async ({
		page,
	}) => {
		await addVideoClipToTimeline({ page });
		const clips = await duplicateAndSelectBoth({ page });
		let menu = await openVideoClipMenu({ page, clip: clips.nth(1) });
		await menuItem({ menu, label: "创建组合" }).click();

		await expect
			.poll(() =>
				page.evaluate(() => {
					const elements = (window as any).__timelineStore.getState().tracks[0]
						.elements;
					return elements.map(
						(element: { groupId?: string }) => element.groupId
					);
				})
			)
			.toEqual([expect.any(String), expect.any(String)]);
		const groupIds = await page.evaluate(() =>
			(window as any).__timelineStore
				.getState()
				.tracks[0].elements.map(
					(element: { groupId?: string }) => element.groupId
				)
		);
		expect(new Set(groupIds).size).toBe(1);

		menu = await openVideoClipMenu({ page, clip: clips.nth(1) });
		await menuItem({ menu, label: "解除组合" }).click();
		await expect
			.poll(() =>
				page.evaluate(() =>
					(window as any).__timelineStore
						.getState()
						.tracks[0].elements.every(
							(element: { groupId?: string }) => !element.groupId
						)
				)
			)
			.toBe(true);
	});

	test("creates and breaks apart a persistent compound clip", async ({
		page,
	}) => {
		await addVideoClipToTimeline({ page });
		const clips = await duplicateAndSelectBoth({ page });
		let menu = await openVideoClipMenu({ page, clip: clips.nth(1) });
		const createCompound = menuItem({ menu, label: "新建复合片段" });
		await expect(createCompound).not.toHaveAttribute("data-disabled");
		await createCompound.click();

		await expect(page.locator('[data-testid="timeline-element"]')).toHaveCount(
			1
		);
		const compound = await page.evaluate(
			() =>
				(window as any).__timelineStore.getState().tracks[0].elements[0]
					.compound
		);
		expect(compound).toMatchObject({ kind: "compound" });
		expect(compound.clips).toHaveLength(2);

		const compoundClip = page
			.locator('[data-testid="timeline-element"]')
			.first();
		menu = await openVideoClipMenu({ page, clip: compoundClip });
		await menuItem({ menu, label: "拆分复合片段" }).click();
		await expect(page.locator('[data-testid="timeline-element"]')).toHaveCount(
			2
		);
		await expect
			.poll(() =>
				page.evaluate(() =>
					(window as any).__timelineStore
						.getState()
						.tracks[0].elements.every(
							(element: { compound?: unknown }) => !element.compound
						)
				)
			)
			.toBe(true);
	});

	test("separate audio detaches embedded sound onto an audio track", async ({
		page,
	}) => {
		const clip = await addVideoClipToTimeline({ page });
		const menu = await openVideoClipMenu({ page, clip });
		await menuItem({ menu, label: "分离音频" }).click();

		await expect
			.poll(() =>
				page.evaluate(() => {
					const tracks = (window as any).__timelineStore.getState().tracks;
					return tracks.find(
						(track: { type: string }) => track.type === "audio"
					)?.elements.length;
				})
			)
			.toBe(1);
		const sourceVolume = await page.evaluate(() => {
			const tracks = (window as any).__timelineStore.getState().tracks;
			return tracks
				.find((track: { type: string }) => track.type === "media")
				?.elements.at(0)?.volume;
		});
		expect(sourceVolume).toBe(0);
	});

	test("smart shot split applies detected boundaries to the timeline", async ({
		page,
		electronApp,
	}) => {
		const clip = await addVideoClipToTimeline({ page });
		await electronApp.evaluate(async ({ ipcMain }) => {
			(globalThis as any).__qcutSceneRequests = [];
			ipcMain.removeHandler("claude:analyze:scenes");
			ipcMain.handle(
				"claude:analyze:scenes",
				async (_event, projectId, request) => {
					(globalThis as any).__qcutSceneRequests.push({ projectId, request });
					return {
						scenes: [
							{ timestamp: 0, confidence: 1 },
							{ timestamp: 1, confidence: 0.9 },
							{ timestamp: 3, confidence: 0.85 },
						],
						totalScenes: 3,
						averageShotDuration: 1.5,
					};
				}
			);
		});

		const menu = await openVideoClipMenu({ page, clip });
		await menuItem({ menu, label: "智能镜头分割" }).click();

		await expect(page.locator('[data-testid="timeline-element"]')).toHaveCount(
			3
		);
		const requests = await electronApp.evaluate(
			() => (globalThis as any).__qcutSceneRequests
		);
		expect(requests).toEqual([
			expect.objectContaining({
				request: expect.objectContaining({ threshold: 0.3 }),
			}),
		]);
	});

	test("export selected clip uses the selected source range", async ({
		page,
		electronApp,
	}) => {
		const clip = await addVideoClipToTimeline({ page });
		await electronApp.evaluate(async ({ dialog, ipcMain }) => {
			const fakeOutputPath = "/tmp/qcut-export-output.mp4";
			(globalThis as any).__qcutExportClipCalls = [];
			dialog.showSaveDialog = async () => ({
				canceled: false,
				filePath: "/tmp/qcut-selected-clip-test.mp4",
			});
			ipcMain.removeHandler("create-export-session");
			ipcMain.handle("create-export-session", async () => ({
				sessionId: "selected-clip-session",
				frameDir: "/tmp/qcut-frames",
				outputDir: "/tmp",
			}));
			ipcMain.removeHandler("export-video-cli");
			ipcMain.handle("export-video-cli", async (_event, options) => {
				(globalThis as any).__qcutExportClipCalls.push({
					type: "exportVideoCLI",
					options,
				});
				return { success: true, outputPath: fakeOutputPath };
			});
			ipcMain.removeHandler("read-output-file");
			ipcMain.handle("read-output-file", async (_event, filePath) => {
				(globalThis as any).__qcutExportClipCalls.push({
					type: "readOutputFile",
					filePath,
				});
				return Buffer.from([1, 2, 3]);
			});
			ipcMain.removeHandler("write-file");
			ipcMain.handle("write-file", async (_event, filePath, data) => {
				(globalThis as any).__qcutExportClipCalls.push({
					type: "writeFile",
					filePath,
					byteLength: data.byteLength,
				});
				return true;
			});
			ipcMain.removeHandler("cleanup-export-session");
			ipcMain.handle("cleanup-export-session", async (_event, sessionId) => {
				(globalThis as any).__qcutExportClipCalls.push({
					type: "cleanupExportSession",
					sessionId,
				});
				return true;
			});
			ipcMain.removeHandler("shell:showItemInFolder");
			ipcMain.handle("shell:showItemInFolder", async (_event, filePath) => {
				(globalThis as any).__qcutExportClipCalls.push({
					type: "showItemInFolder",
					filePath,
				});
			});
		});

		const menu = await openVideoClipMenu({ page, clip });
		const openFileLocation = menuItem({ menu, label: "打开文件所在位置" });
		await openFileLocation.scrollIntoViewIfNeeded();
		await expect(openFileLocation).toBeVisible();
		await menuItem({ menu, label: "导出所选片段" }).click();

		await expect
			.poll(async () =>
				electronApp.evaluate(() => (globalThis as any).__qcutExportClipCalls)
			)
			.toContainEqual(
				expect.objectContaining({
					type: "showItemInFolder",
					filePath: "/tmp/qcut-selected-clip-test.mp4",
				})
			);

		const exportCall = await electronApp.evaluate(() =>
			((globalThis as any).__qcutExportClipCalls ?? []).find(
				(call: { type: string }) => call.type === "exportVideoCLI"
			)
		);
		expect(exportCall.options).toEqual(
			expect.objectContaining({
				sessionId: "selected-clip-session",
				useDirectCopy: true,
				videoSources: [
					expect.objectContaining({
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
					}),
				],
			})
		);
	});
});
