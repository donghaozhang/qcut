import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDir =
	process.env.QCUT_VIDEO_AUDIT_DIR ??
	path.join(process.env.TMPDIR ?? "/tmp", "qcut-video-visual-audit");

async function setNumber(
	page: import("@playwright/test").Page,
	label: string,
	value: number
) {
	const input = page.getByLabel(`${label}数值`);
	await input.fill(String(value));
	await input.press("Tab");
}

async function paintCutoutPoint({
	overlay,
}: {
	overlay: import("@playwright/test").Locator;
}) {
	await overlay.click();
}

test.describe("Main-track video properties", () => {
	test("edits, undoes, keyframes, and captures P0 video visuals", async ({
		page,
	}) => {
		await rm(outputDir, { recursive: true, force: true });
		await mkdir(outputDir, { recursive: true });
		await createTestProject(page, "Video Properties Audit");
		await importTestVideo(page);

		const mediaItem = page.getByTestId("media-item").first();
		const timelineTrack = page.getByTestId("timeline-track").first();
		await mediaItem.dragTo(timelineTrack);
		const clip = page.getByTestId("timeline-element").first();
		if ((await clip.count()) === 0) {
			await page.evaluate(() => {
				const timeline = (window as any).__timelineStore.getState();
				const media = (window as any).__mediaStore.getState().mediaItems[0];
				const track = timeline.tracks.find(
					(item: any) => item.isMain || item.type === "media"
				);
				timeline.addElementToTrack(track.id, {
					type: "media",
					mediaId: media.id,
					name: media.name,
					duration: media.duration ?? 2,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				});
			});
		}
		await expect(clip).toBeVisible();
		await clip.click();
		await page.evaluate(() => {
			const timelineStore = (window as any).__timelineStore;
			const playbackStore = (window as any).__playbackStore;
			const element = timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)[0];
			playbackStore.getState().seek(element.startTime + 0.25);
		});
		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		await expect(page.getByTestId("panel-tab-properties")).toHaveClass(
			/border-primary/
		);
		const inspectorPosition = await properties.evaluate((node) => ({
			left: node.getBoundingClientRect().left,
			viewportWidth: window.innerWidth,
		}));
		expect(inspectorPosition.left).toBeGreaterThan(
			inspectorPosition.viewportWidth / 2
		);
		await page.screenshot({
			path: path.join(outputDir, "00-selected-video-properties-right.png"),
			animations: "disabled",
		});
		const primaryTabs = properties.getByTestId("media-properties-primary-tabs");
		const visualTabs = properties.getByTestId("media-properties-visual-tabs");
		const propertyTabs = properties.getByRole("tab");
		await expect(propertyTabs).toHaveCount(11);
		for (const tabName of [
			"画面",
			"音频",
			"变速",
			"动画",
			"跟踪",
			"调节",
			"AI 效果",
		]) {
			await expect(
				primaryTabs.getByRole("tab", { name: tabName, exact: true })
			).toBeVisible();
		}
		for (const tabName of ["基础", "抠像", "蒙版", "美颜美体"]) {
			await expect(
				visualTabs.getByRole("tab", { name: tabName, exact: true })
			).toBeVisible();
		}
		const tabLayout = await propertyTabs.evaluateAll((tabs) =>
			tabs.map((tab) => {
				const textRange = document.createRange();
				textRange.selectNodeContents(tab);
				const textBox = textRange.getBoundingClientRect();
				return {
					left: textBox.left,
					right: textBox.right,
					top: textBox.top,
					bottom: textBox.bottom,
				};
			})
		);
		for (let first = 0; first < tabLayout.length; first += 1) {
			for (let second = first + 1; second < tabLayout.length; second += 1) {
				const a = tabLayout[first];
				const b = tabLayout[second];
				const overlaps =
					a.left < b.right &&
					a.right > b.left &&
					a.top < b.bottom &&
					a.bottom > b.top;
				expect(overlaps).toBe(false);
			}
		}
		await setNumber(page, "缩放", 75);
		await setNumber(page, "位置 X", 60);
		await setNumber(page, "位置 Y", -20);
		await setNumber(page, "旋转", 12);
		await setNumber(page, "不透明度", 80);
		await properties.getByLabel("水平翻转").click();

		let flip = await page.evaluate(() => {
			const track = (window as any).__timelineStore.getState().tracks[0];
			return track.elements[0].flipHorizontal;
		});
		expect(flip).toBe(true);
		await page.evaluate(() =>
			(window as any).__timelineStore.getState().undo()
		);
		flip = await page.evaluate(() => {
			const track = (window as any).__timelineStore.getState().tracks[0];
			return track.elements[0].flipHorizontal;
		});
		expect(Boolean(flip)).toBe(false);
		await properties.getByLabel("水平翻转").click();

		await properties.getByLabel("混合模式").click();
		await page.getByRole("option", { name: "滤色" }).click();
		await properties.getByText("sample-video.mp4").scrollIntoViewIfNeeded();
		await properties.screenshot({
			path: path.join(outputDir, "01-basic-transform-properties.png"),
			animations: "disabled",
		});
		await properties.getByText("混合模式").scrollIntoViewIfNeeded();
		await properties.screenshot({
			path: path.join(outputDir, "01b-basic-compositing-properties.png"),
			animations: "disabled",
		});

		await properties
			.getByRole("button", { name: "裁剪与适应", exact: true })
			.click();
		await setNumber(page, "顶部裁剪", 8);
		await setNumber(page, "右侧裁剪", 6);
		await setNumber(page, "底部裁剪", 8);
		await setNumber(page, "左侧裁剪", 6);
		await properties.screenshot({
			path: path.join(outputDir, "02-crop-properties.png"),
			animations: "disabled",
		});
		await properties
			.getByRole("button", { name: "裁剪与适应", exact: true })
			.click();

		await properties.getByRole("button", { name: "透视", exact: true }).click();
		await setNumber(page, "左上角X", 8);
		await setNumber(page, "左上角Y", 10);
		await setNumber(page, "右上角X", 94);
		await setNumber(page, "右下角Y", 92);
		await properties.screenshot({
			path: path.join(outputDir, "03-perspective-properties.png"),
			animations: "disabled",
		});
		await properties.getByRole("button", { name: "透视", exact: true }).click();

		await properties.getByLabel("添加位置 X关键帧").click();
		await expect(properties.getByLabel("移除位置 X关键帧")).toBeVisible();
		await setNumber(page, "位置 X", 64);
		await properties
			.getByRole("button", { name: "关键帧", exact: true })
			.click();
		await expect(properties.getByText("（1 个关键帧）")).toBeVisible();
		await properties.screenshot({
			path: path.join(outputDir, "04-keyframes-properties.png"),
			animations: "disabled",
		});
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "05-editor-preview.png"),
			animations: "disabled",
		});

		const state = await page.evaluate(() => {
			const tracks = (window as any).__timelineStore.getState().tracks;
			const element = tracks.flatMap((track: any) => track.elements)[0];
			return {
				scaleX: element.scaleX,
				scaleY: element.scaleY,
				x: element.x,
				y: element.y,
				rotation: element.rotation,
				opacity: element.opacity,
				flipHorizontal: element.flipHorizontal,
				blendMode: element.blendMode,
				crop: element.crop,
				perspective: element.perspective,
				keyframeCount: element.keyframes?.x?.length ?? 0,
				keyframeValue: element.keyframes?.x?.[0]?.value,
			};
		});
		expect(state).toMatchObject({
			scaleX: 0.75,
			scaleY: 0.75,
			x: 64,
			y: -20,
			rotation: 12,
			opacity: 0.8,
			flipHorizontal: true,
			blendMode: "screen",
			crop: { top: 0.08, right: 0.06, bottom: 0.08, left: 0.06 },
			keyframeCount: 1,
			keyframeValue: 64,
		});
		expect(state.perspective.topLeftX).toBeCloseTo(0.08);
		expect(state.perspective.topLeftY).toBeCloseTo(0.1);

		await page.evaluate(() => {
			const store = (window as any).__timelineStore.getState();
			const track = store.tracks.find((item: any) => item.type === "media");
			const element = track.elements[0];
			store.updateMediaElement(track.id, element.id, {
				animationInType: "slide-left",
				animationInDuration: 0.4,
				animationOutType: "fade",
				animationOutDuration: 0.5,
				comboAnimationType: "pulse",
				comboAnimationIntensity: 0.6,
				adjustments: {
					brightness: 15,
					contrast: 10,
					saturation: 20,
					temperature: 8,
					tint: -5,
					sharpness: 20,
					fade: 10,
					vignette: 30,
				},
				audioFadeIn: 0.2,
				audioFadeOut: 0.3,
				audioNormalize: true,
				audioDenoise: 35,
				audioPan: -0.2,
				playbackRate: 1.5,
				reverse: true,
				freezeFrameTime: 0.5,
				freezeFrameDuration: 0.4,
				masks: [
					{
						id: "portrait-mask",
						name: "Portrait",
						enabled: true,
						blendMode: "add",
						type: "ellipse",
						centerX: 0.5,
						centerY: 0.5,
						width: 0.75,
						height: 0.65,
						rotation: 12,
						feather: 0.05,
						invert: false,
						keyframes: {
							centerX: [
								{ id: "mx0", frame: 0, value: 0.4, easing: "linear" },
								{ id: "mx1", frame: 30, value: 0.6, easing: "linear" },
							],
						},
					},
					{
						id: "cutout-mask",
						name: "Cutout",
						enabled: true,
						blendMode: "subtract",
						type: "rectangle",
						centerX: 0.5,
						centerY: 0.5,
						width: 0.2,
						height: 0.2,
						rotation: 0,
						feather: 0.02,
						invert: false,
					},
					{
						id: "edge-mask",
						name: "Edge limit",
						enabled: true,
						blendMode: "intersect",
						type: "linear",
						centerX: 0.5,
						centerY: 0.5,
						width: 1,
						height: 1,
						rotation: 20,
						feather: 0.1,
						invert: false,
					},
				],
				chromaKey: {
					enabled: true,
					color: "#00ff00",
					similarity: 0.2,
					blend: 0.1,
					shadow: 0,
					cleanup: 0,
					spill: 0,
				},
				enhancements: {
					stabilization: 20,
					denoise: 20,
					clarity: 15,
					upscale: 2,
					relight: 10,
					beauty: 15,
				},
			});
		});

		for (const [tab, filename] of [
			["动画", "07-animation-properties.png"],
			["跟踪", "07a-tracking-properties.png"],
			["调节", "08-adjustments-properties.png"],
			["音频", "09-audio-properties.png"],
			["变速", "10-speed-properties.png"],
		] as const) {
			await primaryTabs.getByRole("tab", { name: tab, exact: true }).click();
			await properties.screenshot({
				path: path.join(outputDir, filename),
				animations: "disabled",
			});
		}
		await primaryTabs.getByRole("tab", { name: "画面", exact: true }).click();
		await visualTabs.getByRole("tab", { name: "蒙版", exact: true }).click();
		await properties.screenshot({
			path: path.join(outputDir, "11-mask-properties.png"),
			animations: "disabled",
		});
		const maskEditor = properties.getByTestId("media-mask-properties");
		await expect(
			maskEditor.getByRole("button", { name: "选择Portrait" })
		).toBeVisible();
		await expect(
			maskEditor.getByRole("button", { name: "选择Cutout" })
		).toBeVisible();
		await expect(
			maskEditor.getByRole("button", { name: "选择Edge limit" })
		).toBeVisible();
		await maskEditor.getByRole("button", { name: "选择Portrait" }).click();
		const maskOverlay = page.getByTestId("media-mask-canvas-overlay");
		await expect(maskOverlay).toBeVisible();
		await maskOverlay
			.getByRole("button", { name: "移动Portrait" })
			.press("ArrowRight");

		await maskEditor.getByRole("button", { name: "新建蒙版" }).click();
		await maskEditor.getByRole("button", { name: "选择钢笔蒙版" }).click();
		const maskNameInputs = maskEditor.getByLabel("蒙版名称");
		await maskNameInputs.last().fill("Bezier Accent");
		await maskNameInputs.last().press("Tab");
		await maskEditor.getByLabel("扩展数值").fill("8");
		await maskEditor.getByLabel("扩展数值").press("Tab");
		await maskEditor.getByLabel("不透明度数值").fill("80");
		await maskEditor.getByLabel("不透明度数值").press("Tab");
		await maskEditor.getByLabel("蒙版混合方式").click();
		await page.getByRole("option", { name: "相减", exact: true }).click();
		await expect(
			maskOverlay.getByRole("button", { name: /编辑Bezier Accent节点 1/ })
		).toBeVisible();
		await expect(
			maskOverlay.getByRole("button", {
				name: /编辑Bezier Accent入切线/,
			})
		).toHaveCount(4);
		await maskEditor.screenshot({
			path: path.join(outputDir, "11a-multi-mask-editor.png"),
			animations: "disabled",
		});
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "11aa-bezier-mask-canvas.png"),
			animations: "disabled",
		});
		const propertiesViewport = properties.locator(
			"xpath=ancestor::*[@data-radix-scroll-area-viewport][1]"
		);
		await visualTabs.getByRole("tab", { name: "抠像", exact: true }).click();
		await expect(
			properties.getByRole("button", { name: "智能抠像" })
		).toBeVisible();
		await expect(
			properties.getByRole("button", { name: "生成并应用人物蒙版" })
		).toBeVisible();
		await expect(
			properties.getByText("色度抠像", { exact: true })
		).toBeVisible();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11b-cutout-local-person.png"),
			animations: "disabled",
		});

		await properties
			.getByRole("tab", { name: "云端物体", exact: true })
			.click();
		await properties.getByLabel("物体描述").fill("person");
		await expect(
			properties.getByRole("button", { name: "生成并应用蒙版" })
		).toBeEnabled();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11c-cutout-cloud-object.png"),
			animations: "disabled",
		});
		await page.screenshot({
			path: path.join(outputDir, "11cc-cutout-cloud-object-full-editor.png"),
			animations: "disabled",
		});

		await properties.getByRole("button", { name: "智能抠像" }).click();
		await page.evaluate(() => {
			const store = (window as any).__timelineStore.getState();
			const track = store.tracks.find((item: any) => item.type === "media");
			const element = track.elements[0];
			store.updateMediaElement(
				track.id,
				element.id,
				{
					masks: (element.masks ?? []).map((mask: any) => ({
						...mask,
						enabled: false,
					})),
				},
				false
			);
		});
		const customCutout = properties.getByTestId(
			"media-custom-cutout-properties"
		);
		await customCutout.scrollIntoViewIfNeeded();
		const customCutoutSwitch = customCutout.getByRole("switch", {
			name: "启用自定义抠像",
		});
		await expect(customCutoutSwitch).not.toBeChecked();
		await customCutoutSwitch.click();
		await customCutout.getByText("自定义抠像", { exact: true }).click();
		await customCutout.getByLabel("画笔大小数值").fill("25");
		await customCutout.getByLabel("画笔大小数值").press("Tab");
		await customCutout.getByRole("button", { name: "在画布上编辑" }).click();
		const customCutoutOverlay = page.getByTestId("custom-cutout-overlay");
		await expect(customCutoutOverlay).toBeVisible();
		const customCutoutStrokeCount = () =>
			page.evaluate(() => {
				const tracks = (window as any).__timelineStore.getState().tracks;
				const element = tracks
					.flatMap((track: any) => track.elements)
					.find((item: any) => item.type === "media");
				return element.customCutout?.strokes?.length ?? 0;
			});

		await paintCutoutPoint({
			overlay: customCutoutOverlay,
		});
		await expect.poll(customCutoutStrokeCount).toBe(1);
		await customCutout.getByRole("radio", { name: "移除区域画笔" }).click();
		await paintCutoutPoint({
			overlay: customCutoutOverlay,
		});
		await expect.poll(customCutoutStrokeCount).toBe(2);
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const playback = (window as any).__playbackStore.getState();
			const element = timeline.tracks
				.flatMap((track: any) => track.elements)
				.find((item: any) => item.type === "media");
			playback.seek(element.startTime + 0.75);
		});
		await customCutout.getByRole("radio", { name: "保留区域画笔" }).click();
		await paintCutoutPoint({
			overlay: customCutoutOverlay,
		});
		await expect.poll(customCutoutStrokeCount).toBe(3);
		await customCutout
			.getByRole("button", { name: "撤销当前帧的上一笔" })
			.click();
		await expect.poll(customCutoutStrokeCount).toBe(2);
		await paintCutoutPoint({
			overlay: customCutoutOverlay,
		});
		await expect.poll(customCutoutStrokeCount).toBe(3);
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const playback = (window as any).__playbackStore.getState();
			const element = timeline.tracks
				.flatMap((track: any) => track.elements)
				.find((item: any) => item.type === "media");
			playback.seek(element.startTime + 1.1);
		});
		await customCutout.getByRole("radio", { name: "移除区域画笔" }).click();
		await paintCutoutPoint({
			overlay: customCutoutOverlay,
		});
		await expect.poll(customCutoutStrokeCount).toBe(4);
		await customCutout.getByRole("radio", { name: "擦除笔画" }).click();
		await paintCutoutPoint({
			overlay: customCutoutOverlay,
		});
		await expect.poll(customCutoutStrokeCount).toBe(3);
		await customCutout.getByRole("radio", { name: "保留区域画笔" }).click();

		const customCutoutState = () =>
			page.evaluate(() => {
				const tracks = (window as any).__timelineStore.getState().tracks;
				const element = tracks
					.flatMap((track: any) => track.elements)
					.find((item: any) => item.type === "media");
				const strokes = element.customCutout?.strokes ?? [];
				return {
					enabled: element.customCutout?.enabled,
					applyStrokes: element.customCutout?.applyStrokes,
					strokeCount: strokes.length,
					correctionFrames: [
						...new Set(strokes.map((stroke: any) => stroke.frame)),
					],
					modes: strokes.map((stroke: any) => stroke.mode),
				};
			});
		await expect.poll(customCutoutState).toMatchObject({
			enabled: true,
			applyStrokes: true,
			strokeCount: 3,
			modes: ["foreground", "background", "foreground"],
		});
		expect((await customCutoutState()).correctionFrames).toHaveLength(2);
		await expect(customCutout.getByText("2 个修正帧")).toBeVisible();
		await expect(
			customCutout.getByRole("button", { name: "生成抠像" })
		).toBeEnabled();
		await customCutout.screenshot({
			path: path.join(outputDir, "11cd-custom-cutout-controls.png"),
			animations: "disabled",
		});
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "11ce-custom-cutout-canvas.png"),
			animations: "disabled",
		});
		const customMaskStyle = await page
			.getByRole("button", { name: /^Video:/ })
			.locator('div[style*="mask-image"]')
			.first()
			.evaluate((node) => (node as HTMLElement).style.maskImage);
		expect(decodeURIComponent(customMaskStyle)).toContain("custom-cutout-mask");
		await customCutout.getByRole("button", { name: "完成绘制" }).click();
		await expect(customCutoutOverlay).toHaveCount(0);
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "11cf-custom-cutout-result.png"),
			animations: "disabled",
		});
		await page.evaluate(() => {
			const store = (window as any).__timelineStore.getState();
			const track = store.tracks.find((item: any) => item.type === "media");
			const element = track.elements[0];
			store.updateMediaElement(
				track.id,
				element.id,
				{
					masks: (element.masks ?? []).map((mask: any) => ({
						...mask,
						enabled: true,
					})),
				},
				false
			);
		});

		const chromaKey = properties.getByTestId("media-chroma-key-properties");
		await expect(
			chromaKey.getByRole("switch", { name: "启用色度抠像" })
		).toBeChecked();
		for (const label of [
			"强度数值",
			"阴影数值",
			"边缘羽化数值",
			"边缘清理数值",
			"溢色抑制数值",
		]) {
			await expect(chromaKey.getByLabel(label)).toBeVisible();
		}
		await chromaKey.getByLabel("阴影数值").fill("25");
		await chromaKey.getByLabel("阴影数值").press("Tab");
		await chromaKey.getByLabel("边缘清理数值").fill("40");
		await chromaKey.getByLabel("边缘清理数值").press("Tab");
		await chromaKey.getByLabel("溢色抑制数值").fill("35");
		await chromaKey.getByLabel("溢色抑制数值").press("Tab");
		await chromaKey.getByRole("button", { name: "添加强度关键帧" }).click();
		await chromaKey.screenshot({
			path: path.join(outputDir, "11cd-chroma-key-refinement.png"),
			animations: "disabled",
		});
		await chromaKey.getByRole("button", { name: "从预览画面取色" }).click();
		const previewCanvas = page.getByTestId("color-preview-canvas").first();
		await expect(previewCanvas).toBeVisible();
		const previewBounds = await previewCanvas.boundingBox();
		expect(previewBounds).not.toBeNull();
		await page.mouse.click(
			(previewBounds?.x ?? 0) + 90,
			(previewBounds?.y ?? 0) + 90
		);
		const selectedChromaColor = () =>
			page.evaluate(() => {
				const tracks = (window as any).__timelineStore.getState().tracks;
				return tracks
					.flatMap((track: any) => track.elements)
					.find((item: any) => item.type === "media")?.chromaKey?.color;
			});
		await expect.poll(selectedChromaColor).not.toBe("#00ff00");
		expect(await selectedChromaColor()).toMatch(/^#[0-9a-f]{6}$/i);

		await visualTabs.getByRole("tab", { name: "基础", exact: true }).click();
		await properties
			.getByRole("button", { name: "视频防抖", exact: true })
			.click();
		await properties
			.getByRole("button", { name: "画质增强", exact: true })
			.click();
		await properties.getByText("本地超采样").scrollIntoViewIfNeeded();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11d-basic-enhancements.png"),
			animations: "disabled",
		});

		await visualTabs
			.getByRole("tab", { name: "美颜美体", exact: true })
			.click();
		await expect(properties.getByText("人像磨皮")).toBeVisible();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11e-portrait-enhancement.png"),
			animations: "disabled",
		});

		await primaryTabs
			.getByRole("tab", { name: "AI 效果", exact: true })
			.click();
		await expect(
			properties.getByRole("button", { name: "AI 超分辨率" })
		).toBeVisible();
		await expect(
			properties.getByRole("button", { name: "AI 视频工具" })
		).toBeVisible();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11f-ai-processing.png"),
			animations: "disabled",
		});
		await properties.getByRole("button", { name: "AI 超分辨率" }).click();
		await expect(
			page
				.getByTestId("media-panel")
				.getByText("sample-video.mp4", { exact: true })
		).toBeVisible();
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "12-editor-preview.png"),
			animations: "disabled",
		});

		const advancedState = await page.evaluate(() => {
			const tracks = (window as any).__timelineStore.getState().tracks;
			const element = tracks
				.flatMap((track: any) => track.elements)
				.find((item: any) => item.type === "media");
			return {
				animationInType: element.animationInType,
				brightness: element.adjustments.brightness,
				audioNormalize: element.audioNormalize,
				playbackRate: element.playbackRate,
				reverse: element.reverse,
				masks: element.masks.map((mask: any) => ({
					name: mask.name,
					blendMode: mask.blendMode,
					type: mask.type,
					keyframeCount: mask.keyframes?.centerX?.length ?? 0,
					pointCount: mask.points?.length ?? 0,
				})),
				chromaEnabled: element.chromaKey.enabled,
				chromaShadow: element.chromaKey.shadow,
				chromaCleanup: element.chromaKey.cleanup,
				chromaSpill: element.chromaKey.spill,
				chromaStrengthKeyframes:
					element.chromaKey.keyframes?.similarity?.length ?? 0,
				stabilization: element.enhancements.stabilization,
			};
		});
		expect(advancedState).toEqual({
			animationInType: "slide-left",
			brightness: 15,
			audioNormalize: true,
			playbackRate: 1.5,
			reverse: true,
			masks: [
				{
					name: "Portrait",
					blendMode: "add",
					type: "ellipse",
					keyframeCount: 3,
					pointCount: 0,
				},
				{
					name: "Cutout",
					blendMode: "subtract",
					type: "rectangle",
					keyframeCount: 0,
					pointCount: 0,
				},
				{
					name: "Edge limit",
					blendMode: "intersect",
					type: "linear",
					keyframeCount: 0,
					pointCount: 0,
				},
				{
					name: "Bezier Accent",
					blendMode: "subtract",
					type: "pen",
					keyframeCount: 0,
					pointCount: 4,
				},
			],
			chromaEnabled: true,
			chromaShadow: 0.25,
			chromaCleanup: 0.4,
			chromaSpill: 0.35,
			chromaStrengthKeyframes: 1,
			stabilization: 20,
		});
	});
});
