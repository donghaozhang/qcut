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
	const input = page.getByLabel(`${label} value`);
	await input.fill(String(value));
	await input.press("Tab");
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
		await expect(propertyTabs).toHaveCount(10);
		for (const tabName of [
			"Visual",
			"Audio",
			"Speed",
			"Animation",
			"Adjust",
			"AI",
		]) {
			await expect(
				primaryTabs.getByRole("tab", { name: tabName, exact: true })
			).toBeVisible();
		}
		for (const tabName of ["Basic", "Cutout", "Mask", "Portrait"]) {
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
		await setNumber(page, "Scale", 75);
		await setNumber(page, "X position", 60);
		await setNumber(page, "Y position", -20);
		await setNumber(page, "Rotation", 12);
		await setNumber(page, "Opacity", 80);
		await properties.getByLabel("Flip horizontally").click();

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
		await properties.getByLabel("Flip horizontally").click();

		await properties.getByLabel("Blend mode").click();
		await page.getByRole("option", { name: "screen" }).click();
		await properties.getByText("sample-video.mp4").scrollIntoViewIfNeeded();
		await properties.screenshot({
			path: path.join(outputDir, "01-basic-transform-properties.png"),
			animations: "disabled",
		});
		await properties.getByText("Blend mode").scrollIntoViewIfNeeded();
		await properties.screenshot({
			path: path.join(outputDir, "01b-basic-compositing-properties.png"),
			animations: "disabled",
		});

		await properties
			.getByRole("button", { name: "Crop and fit", exact: true })
			.click();
		await setNumber(page, "Crop top", 8);
		await setNumber(page, "Crop right", 6);
		await setNumber(page, "Crop bottom", 8);
		await setNumber(page, "Crop left", 6);
		await properties.screenshot({
			path: path.join(outputDir, "02-crop-properties.png"),
			animations: "disabled",
		});
		await properties
			.getByRole("button", { name: "Crop and fit", exact: true })
			.click();

		await properties
			.getByRole("button", { name: "Perspective", exact: true })
			.click();
		await setNumber(page, "Top left X", 8);
		await setNumber(page, "Top left Y", 10);
		await setNumber(page, "Top right X", 94);
		await setNumber(page, "Bottom right Y", 92);
		await properties.screenshot({
			path: path.join(outputDir, "03-perspective-properties.png"),
			animations: "disabled",
		});
		await properties
			.getByRole("button", { name: "Perspective", exact: true })
			.click();

		await properties.getByLabel("Add X position keyframe").click();
		await expect(
			properties.getByLabel("Remove X position keyframe")
		).toBeVisible();
		await setNumber(page, "X position", 64);
		await properties.getByRole("button", { name: "Keyframes" }).click();
		await expect(properties.getByText("(1 keyframe)")).toBeVisible();
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
			["Animation", "07-animation-properties.png"],
			["Adjust", "08-adjustments-properties.png"],
			["Audio", "09-audio-properties.png"],
			["Speed", "10-speed-properties.png"],
		] as const) {
			await primaryTabs.getByRole("tab", { name: tab, exact: true }).click();
			await properties.screenshot({
				path: path.join(outputDir, filename),
				animations: "disabled",
			});
		}
		await primaryTabs.getByRole("tab", { name: "Visual", exact: true }).click();
		await visualTabs.getByRole("tab", { name: "Mask", exact: true }).click();
		await properties.screenshot({
			path: path.join(outputDir, "11-mask-properties.png"),
			animations: "disabled",
		});
		const maskEditor = properties.getByTestId("media-mask-properties");
		await expect(
			maskEditor.getByRole("button", { name: "Select Portrait" })
		).toBeVisible();
		await expect(
			maskEditor.getByRole("button", { name: "Select Cutout" })
		).toBeVisible();
		await expect(
			maskEditor.getByRole("button", { name: "Select Edge limit" })
		).toBeVisible();
		await maskEditor.getByRole("button", { name: "Select Portrait" }).click();
		const maskOverlay = page.getByTestId("media-mask-canvas-overlay");
		await expect(maskOverlay).toBeVisible();
		await maskOverlay
			.getByRole("button", { name: "Move Portrait" })
			.press("ArrowRight");

		await maskEditor.getByRole("button", { name: "Add", exact: true }).click();
		await page.getByRole("menuitem", { name: "Pen", exact: true }).click();
		const maskNameInputs = maskEditor.getByLabel("Mask name");
		await maskNameInputs.last().fill("Bezier Accent");
		await maskNameInputs.last().press("Tab");
		await maskEditor.getByLabel("Expansion value").fill("8");
		await maskEditor.getByLabel("Expansion value").press("Tab");
		await maskEditor.getByLabel("Density value").fill("80");
		await maskEditor.getByLabel("Density value").press("Tab");
		await maskEditor.getByLabel("Mask blend mode").click();
		await page.getByRole("option", { name: "Subtract", exact: true }).click();
		await expect(
			maskOverlay.getByRole("button", { name: /Edit Bezier Accent point 1/ })
		).toBeVisible();
		await expect(
			maskOverlay.getByRole("button", {
				name: /Edit Bezier Accent handleIn/,
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
		await visualTabs.getByRole("tab", { name: "Cutout", exact: true }).click();
		await expect(
			properties.getByRole("button", { name: "Smart cutout" })
		).toBeVisible();
		await expect(
			properties.getByRole("button", { name: "Render and attach mask" })
		).toBeVisible();
		await expect(
			properties.getByText("Chroma key", { exact: true })
		).toBeVisible();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11b-cutout-local-person.png"),
			animations: "disabled",
		});

		await properties
			.getByRole("tab", { name: "Cloud object", exact: true })
			.click();
		await properties.getByLabel("Object description").fill("person");
		await expect(
			properties.getByRole("button", { name: "Generate and attach mask" })
		).toBeEnabled();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11c-cutout-cloud-object.png"),
			animations: "disabled",
		});
		await page.screenshot({
			path: path.join(outputDir, "11cc-cutout-cloud-object-full-editor.png"),
			animations: "disabled",
		});

		await properties.getByRole("button", { name: "Smart cutout" }).click();
		const chromaKey = properties.getByTestId("media-chroma-key-properties");
		await expect(
			chromaKey.getByRole("switch", { name: "Enable Chroma key" })
		).toBeChecked();
		for (const label of [
			"Strength value",
			"Shadow value",
			"Edge feather value",
			"Edge cleanup value",
			"Spill suppression value",
		]) {
			await expect(chromaKey.getByLabel(label)).toBeVisible();
		}
		await chromaKey.getByLabel("Shadow value").fill("25");
		await chromaKey.getByLabel("Shadow value").press("Tab");
		await chromaKey.getByLabel("Edge cleanup value").fill("40");
		await chromaKey.getByLabel("Edge cleanup value").press("Tab");
		await chromaKey.getByLabel("Spill suppression value").fill("35");
		await chromaKey.getByLabel("Spill suppression value").press("Tab");
		await chromaKey
			.getByRole("button", { name: "Add Strength keyframe" })
			.click();
		await chromaKey.screenshot({
			path: path.join(outputDir, "11cd-chroma-key-refinement.png"),
			animations: "disabled",
		});
		await chromaKey
			.getByRole("button", { name: "Pick color from preview" })
			.click();
		const previewCanvas = page.getByTestId("color-preview-canvas").first();
		await expect(previewCanvas).toBeVisible();
		await previewCanvas.click({ position: { x: 90, y: 90 } });
		await expect
			.poll(async () =>
				page.evaluate(() => {
					const tracks = (window as any).__timelineStore.getState().tracks;
					return tracks
						.flatMap((track: any) => track.elements)
						.find((item: any) => item.type === "media")?.chromaKey?.color;
				})
			)
			.toMatch(/^#[0-9a-f]{6}$/i);

		await visualTabs.getByRole("tab", { name: "Basic", exact: true }).click();
		await properties
			.getByRole("button", { name: "Video stabilization", exact: true })
			.click();
		await properties
			.getByRole("button", { name: "Video enhancement", exact: true })
			.click();
		await properties.getByText("Local supersampling").scrollIntoViewIfNeeded();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11d-basic-enhancements.png"),
			animations: "disabled",
		});

		await visualTabs
			.getByRole("tab", { name: "Portrait", exact: true })
			.click();
		await expect(properties.getByText("Portrait smoothing")).toBeVisible();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11e-portrait-enhancement.png"),
			animations: "disabled",
		});

		await primaryTabs.getByRole("tab", { name: "AI", exact: true }).click();
		await expect(
			properties.getByRole("button", { name: "AI upscale" })
		).toBeVisible();
		await expect(
			properties.getByRole("button", { name: "AI video tools" })
		).toBeVisible();
		await propertiesViewport.screenshot({
			path: path.join(outputDir, "11f-ai-processing.png"),
			animations: "disabled",
		});
		await properties.getByRole("button", { name: "AI upscale" }).click();
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
