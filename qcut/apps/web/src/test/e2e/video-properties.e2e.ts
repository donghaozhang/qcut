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
		await page.getByTestId("panel-tab-properties").click();

		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		const propertyTabs = properties.getByRole("tab");
		await expect(propertyTabs).toHaveCount(8);
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

		await properties.getByRole("tab", { name: "Crop" }).click();
		await setNumber(page, "Crop top", 8);
		await setNumber(page, "Crop right", 6);
		await setNumber(page, "Crop bottom", 8);
		await setNumber(page, "Crop left", 6);
		await properties.screenshot({
			path: path.join(outputDir, "02-crop-properties.png"),
			animations: "disabled",
		});

		await properties.getByRole("tab", { name: "Perspective" }).click();
		await setNumber(page, "Top left X", 8);
		await setNumber(page, "Top left Y", 10);
		await setNumber(page, "Top right X", 94);
		await setNumber(page, "Bottom right Y", 92);
		await properties.screenshot({
			path: path.join(outputDir, "03-perspective-properties.png"),
			animations: "disabled",
		});

		await properties.getByRole("button", { name: "Keyframes" }).click();
		await properties
			.getByRole("button", {
				name: "Add keyframe at current frame",
				exact: true,
			})
			.click();
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
			};
		});
		expect(state).toMatchObject({
			scaleX: 0.75,
			scaleY: 0.75,
			x: 60,
			y: -20,
			rotation: 12,
			opacity: 0.8,
			flipHorizontal: true,
			blendMode: "screen",
			crop: { top: 0.08, right: 0.06, bottom: 0.08, left: 0.06 },
			keyframeCount: 1,
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
				mask: {
					type: "ellipse",
					centerX: 0.5,
					centerY: 0.5,
					width: 0.75,
					height: 0.65,
					rotation: 12,
					feather: 0.05,
					invert: false,
				},
				chromaKey: {
					enabled: true,
					color: "#00ff00",
					similarity: 0.2,
					blend: 0.1,
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
			["Advanced", "11-advanced-properties.png"],
		] as const) {
			await properties.getByRole("tab", { name: tab }).click();
			await properties.screenshot({
				path: path.join(outputDir, filename),
				animations: "disabled",
			});
		}
		const propertiesViewport = properties.locator(
			"xpath=ancestor::*[@data-radix-scroll-area-viewport][1]"
		);
		for (const [section, filename] of [
			["Chroma key", "11b-advanced-chroma-key.png"],
			["Enhance", "11c-advanced-enhancements.png"],
			["AI processing", "11d-advanced-ai-processing.png"],
		] as const) {
			await properties
				.getByText(section, { exact: true })
				.scrollIntoViewIfNeeded();
			await propertiesViewport.screenshot({
				path: path.join(outputDir, filename),
				animations: "disabled",
			});
		}
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "12-advanced-editor-preview.png"),
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
				maskType: element.mask.type,
				chromaEnabled: element.chromaKey.enabled,
				stabilization: element.enhancements.stabilization,
			};
		});
		expect(advancedState).toEqual({
			animationInType: "slide-left",
			brightness: 15,
			audioNormalize: true,
			playbackRate: 1.5,
			reverse: true,
			maskType: "ellipse",
			chromaEnabled: true,
			stabilization: 20,
		});
	});
});
