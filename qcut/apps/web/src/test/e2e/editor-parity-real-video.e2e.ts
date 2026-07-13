import { existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const realVideoPath = process.env.QCUT_REAL_VIDEO_PATH ?? "";
const artifactDirectory = path.resolve(
	"output/playwright/qcut-real-video-parity"
);
const exportPath = path.join(artifactDirectory, "real-video-parity-export.mp4");
const validationDuration = 5;

interface HarnessElement {
	id: string;
	name: string;
	type: string;
	mediaId?: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	compound?: {
		kind: "compound" | "multicam";
		activeClipId?: string;
		clips: Array<{ id: string; element: { name: string } }>;
	};
	[key: string]: unknown;
}

interface HarnessTrack {
	id: string;
	type: string;
	elements: HarnessElement[];
}

interface TimelineHarnessState {
	tracks: HarnessTrack[];
	updateElementTrim: (
		trackId: string,
		elementId: string,
		trimStart: number,
		trimEnd: number
	) => void;
	updateElementStartTime: (
		trackId: string,
		elementId: string,
		startTime: number
	) => void;
	addElementToTrack: (
		trackId: string,
		element: Omit<HarnessElement, "id">
	) => string | null;
	addTrack: (type: string) => string;
	setSelectedElements: (
		selection: Array<{ trackId: string; elementId: string }>
	) => void;
	selectElement: (trackId: string, elementId: string) => void;
}

interface HarnessWindow extends Window {
	__timelineStore: { getState: () => TimelineHarnessState };
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
}

function menuItem({ menu, label }: { menu: Locator; label: string }) {
	return menu.getByRole("menuitem").filter({ hasText: label }).first();
}

async function openClipMenu({ page, clip }: { page: Page; clip: Locator }) {
	await clip.click({ button: "right", force: true, position: { x: 6, y: 6 } });
	const menu = page.getByTestId("video-clip-context-menu");
	await expect(menu).toBeVisible();
	return menu;
}

test.skip(
	!realVideoPath || !existsSync(realVideoPath),
	"Set QCUT_REAL_VIDEO_PATH to a local video for the real-media parity run"
);

test.describe("Editor parity with real video", () => {
	test.setTimeout(300_000);

	test("validates inspector, masks, context workflows, captions, and export", async ({
		page,
		electronApp,
	}) => {
		await rm(artifactDirectory, { recursive: true, force: true });
		await mkdir(artifactDirectory, { recursive: true });
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});

		await createTestProject(page, "Real Video Editor Parity");
		await uploadTestMedia(page, realVideoPath);
		const mediaItem = page.getByTestId("media-item").first();
		await expect(mediaItem).toBeVisible();
		await mediaItem.dragTo(page.getByTestId("timeline-track").first());
		const firstClip = page.getByTestId("timeline-element").first();
		await expect(firstClip).toBeVisible();
		await firstClip.click();
		await page.evaluate((duration) => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.type === "media"
			);
			const element = track?.elements[0];
			if (!track || !element) throw new Error("Expected imported media clip");
			timeline.updateElementStartTime(track.id, element.id, 0);
			timeline.updateElementTrim(
				track.id,
				element.id,
				0,
				Math.max(0, element.duration - duration)
			);
			(window as HarnessWindow).__playbackStore.getState().seek(0.75);
		}, validationDuration);
		await expect(page.getByRole("button", { name: /^Video:/ })).toBeVisible({
			timeout: 15_000,
		});

		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		const inspectorPosition = await properties.evaluate((node) => ({
			left: node.getBoundingClientRect().left,
			viewportWidth: window.innerWidth,
		}));
		expect(inspectorPosition.left).toBeGreaterThan(
			inspectorPosition.viewportWidth / 2
		);
		await page.screenshot({
			path: path.join(artifactDirectory, "01-selected-video-inspector.png"),
			animations: "disabled",
		});
		await expect(page.getByText("已成功上传 1 个文件")).toBeHidden({
			timeout: 10_000,
		});

		await page.getByTestId("language-selector").click();
		await page.getByRole("menuitemradio", { name: "English" }).click();
		await expect(page.getByTestId("language-selector")).toContainText("EN");
		await expect(properties.getByRole("tab", { name: "Video" })).toBeVisible();
		await expect(properties.getByRole("tab", { name: "Cutout" })).toBeVisible();
		await expect(properties.getByRole("tab", { name: "Mask" })).toBeVisible();
		await expect(
			properties.getByRole("tab", { name: "Retouch" })
		).toBeVisible();
		const overflowingPropertyTabs = await properties
			.getByTestId("media-properties-primary-tabs")
			.getByRole("tab")
			.evaluateAll((tabs) =>
				tabs.flatMap((tab) =>
					tab.scrollWidth > tab.clientWidth ? [tab.textContent] : []
				)
			);
		expect(overflowingPropertyTabs).toEqual([]);
		expect(
			await page.evaluate(() => localStorage.getItem("qcut-interface-language"))
		).toContain('"locale":"en"');
		await page.screenshot({
			path: path.join(artifactDirectory, "11-language-english-inspector.png"),
			animations: "disabled",
		});

		const languageMenu = await openClipMenu({ page, clip: firstClip });
		await expect(
			menuItem({ menu: languageMenu, label: "AI generate" })
		).toBeVisible();
		await expect(
			menuItem({ menu: languageMenu, label: "Create compound clip" })
		).toBeVisible();
		await page.screenshot({
			path: path.join(
				artifactDirectory,
				"12-language-english-context-menu.png"
			),
			animations: "disabled",
		});
		await page.keyboard.press("Escape");

		await page.getByTestId("language-selector").click();
		await page.getByRole("menuitemradio", { name: "中文" }).click();
		await expect(page.getByTestId("language-selector")).toContainText("中");
		await expect(properties.getByRole("tab", { name: "画面" })).toBeVisible();
		await page.screenshot({
			path: path.join(artifactDirectory, "13-language-chinese-restored.png"),
			animations: "disabled",
		});

		await page.getByLabel("显示安全框").click();
		await page.getByLabel("预览缩放").click();
		await page.getByRole("menuitem", { name: "75%" }).click();
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(artifactDirectory, "02-preview-safe-area-75-percent.png"),
			animations: "disabled",
		});

		const visualTabs = properties.getByTestId("media-properties-visual-tabs");
		await visualTabs.getByRole("tab", { name: "蒙版", exact: true }).click();
		const maskGrid = properties.getByTestId("media-mask-shape-grid");
		await expect(maskGrid.getByRole("button")).toHaveCount(10);
		const overflowingMaskButtons = await maskGrid.evaluate((grid) => {
			const panel = grid.closest('[data-testid="media-properties"]');
			if (!panel) throw new Error("Mask grid is not inside media properties");
			const panelBounds = panel.getBoundingClientRect();
			return [...grid.querySelectorAll("button")].flatMap((button) => {
				const bounds = button.getBoundingClientRect();
				return bounds.left < panelBounds.left - 1 ||
					bounds.right > panelBounds.right + 1
					? [button.getAttribute("aria-label")]
					: [];
			});
		});
		expect(overflowingMaskButtons).toEqual([]);
		await maskGrid.getByRole("button", { name: "选择矩形蒙版" }).click();
		await expect(page.getByTestId("media-mask-canvas-overlay")).toBeVisible();
		await properties.getByLabel("新建蒙版").click();
		await maskGrid.getByRole("button", { name: "选择圆形蒙版" }).click();
		await expect(properties.getByLabel("蒙版名称")).toHaveCount(2);
		await properties.getByLabel("添加X 位置关键帧").click();
		await expect(properties.getByLabel("移除X 位置关键帧")).toBeVisible();
		await expect(properties.getByLabel("向前跟踪")).toBeEnabled();
		await visualTabs.getByRole("tab", { name: "抠像", exact: true }).click();
		const chromaKeyToggle = properties.getByLabel("启用色度抠像");
		await chromaKeyToggle.click();
		await expect(chromaKeyToggle).toBeChecked();
		await visualTabs.getByRole("tab", { name: "蒙版", exact: true }).click();
		const maskState = await page.evaluate(() => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const source = timeline.tracks
				.find((track) => track.type === "media")
				?.elements.at(0);
			return {
				maskCount: Array.isArray(source?.masks) ? source.masks.length : 0,
				hasPositionKeyframe: Boolean(
					Array.isArray(source?.masks) &&
						source.masks.some(
							(mask: { keyframes?: { centerX?: unknown[] } }) =>
								(mask.keyframes?.centerX?.length ?? 0) > 0
						)
				),
				chromaKeyEnabled: Boolean(
					(source?.chromaKey as { enabled?: boolean } | undefined)?.enabled
				),
			};
		});
		expect(maskState).toEqual({
			maskCount: 2,
			hasPositionKeyframe: true,
			chromaKeyEnabled: true,
		});
		await page.screenshot({
			path: path.join(artifactDirectory, "03-mask-shape-grid-and-canvas.png"),
			animations: "disabled",
		});

		const duplicated = await page.evaluate(() => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.type === "media"
			);
			const source = track?.elements[0];
			if (!track || !source || !source.mediaId) {
				throw new Error("Expected source clip for duplication");
			}
			const { id: _sourceId, ...copy } = source;
			const secondId = timeline.addElementToTrack(track.id, {
				...copy,
				name: `${source.name} Camera B`,
				startTime: 2,
			});
			if (!secondId) throw new Error("Failed to duplicate source clip");
			timeline.setSelectedElements([
				{ trackId: track.id, elementId: source.id },
				{ trackId: track.id, elementId: secondId },
			]);
			return { firstId: source.id, secondId };
		});
		await expect(page.getByTestId("timeline-element")).toHaveCount(2);

		let menu = await openClipMenu({
			page,
			clip: page.getByTestId("timeline-element").first(),
		});
		for (const label of [
			"视音频对齐",
			"新建复合片段",
			"新建多机位片段",
			"创建组合",
			"链接媒体",
			"编辑特效",
		]) {
			const item = menuItem({ menu, label });
			await item.scrollIntoViewIfNeeded();
			await expect(item).not.toHaveAttribute("data-disabled");
		}
		await page.screenshot({
			path: path.join(artifactDirectory, "04-complete-context-menu.png"),
			animations: "disabled",
		});

		await menuItem({ menu, label: "视音频对齐" }).click();
		await expect(page.getByText(/音频已对齐（置信度/)).toBeVisible({
			timeout: 90_000,
		});
		await expect
			.poll(
				() =>
					page.evaluate(({ firstId, secondId }) => {
						const elements = (window as HarnessWindow).__timelineStore
							.getState()
							.tracks.flatMap((track) => track.elements);
						return elements
							.filter(
								(element) => element.id === firstId || element.id === secondId
							)
							.map((element) => element.startTime);
					}, duplicated),
				{ timeout: 90_000 }
			)
			.toEqual([0, 0]);

		menu = await openClipMenu({
			page,
			clip: page.getByTestId("timeline-element").last(),
		});
		await menuItem({ menu, label: "新建多机位片段" }).click();
		await expect(page.getByTestId("timeline-element")).toHaveCount(1);
		await expect
			.poll(() =>
				page.evaluate(() => {
					const element = (window as HarnessWindow).__timelineStore
						.getState()
						.tracks.flatMap((track) => track.elements)
						.find((candidate) => candidate.compound);
					return element?.compound?.kind;
				})
			)
			.toBe("multicam");

		const multicamClip = page.getByTestId("timeline-element").first();
		menu = await openClipMenu({ page, clip: multicamClip });
		await menu.getByRole("menuitem", { name: /切换机位/ }).hover();
		await page
			.getByRole("menuitem", { name: /Camera B/ })
			.last()
			.click();
		await expect
			.poll(() =>
				page.evaluate(({ secondId }) => {
					const container = (window as HarnessWindow).__timelineStore
						.getState()
						.tracks.flatMap((track) => track.elements)
						.find((element) => element.compound?.kind === "multicam");
					return container?.compound?.activeClipId === secondId;
				}, duplicated)
			)
			.toBe(true);
		await page.screenshot({
			path: path.join(artifactDirectory, "05-multicam-selected-angle.png"),
			animations: "disabled",
		});

		menu = await openClipMenu({ page, clip: multicamClip });
		await menuItem({ menu, label: "拆分多机位片段" }).click();
		await expect(page.getByTestId("timeline-element")).toHaveCount(2);
		await page.evaluate(() => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const mediaSelections = timeline.tracks.flatMap((track) =>
				track.elements
					.filter((element) => element.type === "media")
					.map((element) => ({ trackId: track.id, elementId: element.id }))
			);
			timeline.setSelectedElements(mediaSelections);
		});
		menu = await openClipMenu({
			page,
			clip: page.getByTestId("timeline-element").first(),
		});
		await menuItem({ menu, label: "新建复合片段" }).click();
		await expect(page.getByTestId("timeline-element")).toHaveCount(1);
		await page.screenshot({
			path: path.join(artifactDirectory, "06-compound-clip-timeline.png"),
			animations: "disabled",
		});

		await page.evaluate(() => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const captionTrackId = timeline.addTrack("captions");
			const captionId = timeline.addElementToTrack(captionTrackId, {
				type: "captions",
				name: "Real video caption",
				text: "真实视频字幕样式验证",
				language: "zh",
				source: "manual",
				startTime: 0.2,
				duration: 4.5,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!captionId) throw new Error("Failed to create caption");
			timeline.selectElement(captionTrackId, captionId);
		});
		const captionProperties = page.getByTestId("caption-properties");
		await expect(captionProperties).toBeVisible();
		for (const tab of ["基础", "预设", "动画", "配音", "数字人"]) {
			await expect(
				captionProperties.getByRole("tab", { name: tab, exact: true })
			).toBeVisible();
		}
		await captionProperties.getByRole("tab", { name: "预设" }).click();
		await page.screenshot({
			path: path.join(artifactDirectory, "07-caption-presets-and-scope.png"),
			animations: "disabled",
		});
		await captionProperties.getByRole("tab", { name: "动画" }).click();
		await page.screenshot({
			path: path.join(artifactDirectory, "08-caption-motion-controls.png"),
			animations: "disabled",
		});

		await page.getByLabel("隐藏安全框").click();
		await page.getByLabel("预览缩放").click();
		await page.getByRole("menuitem", { name: "适应面板" }).click();
		const previewCanvas = page.getByTestId("preview-canvas");
		for (const reference of [
			{ name: "start", time: 0.1 },
			{ name: "middle", time: 2.5 },
			{ name: "end", time: 4.8 },
		]) {
			await page.evaluate((time) => {
				(window as HarnessWindow).__playbackStore.getState().seek(time);
			}, reference.time);
			await page.waitForTimeout(500);
			await previewCanvas.screenshot({
				path: path.join(artifactDirectory, `10-preview-${reference.name}.png`),
				animations: "disabled",
			});
		}
		await page.evaluate(() => {
			(window as HarnessWindow).__playbackStore.getState().seek(0.75);
		});

		await page.evaluate(() => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			for (const track of timeline.tracks) {
				const compound = track.elements.find(
					(element) => element.compound?.kind === "compound"
				);
				if (compound) {
					timeline.selectElement(track.id, compound.id);
					return;
				}
			}
		});
		await stubExportSaveDialog({ electronApp, outputPath: exportPath });
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await expect(page.getByTestId("export-quality-select")).toContainText(
			"1080×1920"
		);
		await page.getByTestId("export-start-button").click();
		await expect(page.getByTestId("export-progress-bar")).toBeVisible({
			timeout: 20_000,
		});
		await page.screenshot({
			path: path.join(artifactDirectory, "09-real-export-progress.png"),
			animations: "disabled",
		});
		await expect
			.poll(
				async () => {
					try {
						return (await stat(exportPath)).size;
					} catch {
						return 0;
					}
				},
				{ timeout: 180_000, intervals: [500, 1000, 2000] }
			)
			.toBeGreaterThan(10_000);
	});
});
