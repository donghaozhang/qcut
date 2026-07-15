import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	expect,
	createTestProject,
	importTestImage,
	importTestVideo,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve(
	"output/playwright/native-video-enhancement-preview"
);
const externalVideoPath = process.env.QCUT_REAL_VIDEO_PATH;

interface EnhancementValues {
	stabilization: number;
	denoise: number;
	clarity: number;
	upscale: 1 | 2 | 4;
	relight: number;
	beauty: number;
}

interface HarnessElement {
	id: string;
	type: string;
	startTime: number;
	enhancements?: EnhancementValues;
}

interface HarnessTrack {
	id: string;
	type: string;
	elements: HarnessElement[];
}

interface TimelineHarnessState {
	tracks: HarnessTrack[];
	updateMediaElement: (
		trackId: string,
		elementId: string,
		updates: { enhancements: EnhancementValues },
		history?: boolean
	) => void;
	addTextAtTime: (
		item: Record<string, unknown>,
		currentTime?: number
	) => boolean;
	insertTrackAt: (type: "sticker", index: number) => string;
	addElementToTrack: (
		trackId: string,
		element: Record<string, unknown>,
		options?: { pushHistory?: boolean; selectElement?: boolean }
	) => string | null;
}

interface StickerHarnessStores {
	media: {
		mediaItems: Array<{ id: string; name: string; type: string }>;
	};
	stickers: {
		addOverlaySticker: (
			mediaItemId: string,
			options: {
				position: { x: number; y: number };
				size: { width: number; height: number };
				rotation: number;
				opacity: number;
			}
		) => string;
	};
	timeline: TimelineHarnessState;
}

interface HarnessWindow extends Window {
	__timelineStore: { getState: () => TimelineHarnessState };
	__playbackStore: { getState: () => { seek: (time: number) => void } };
	stickerTestReady: Promise<void>;
	stickerTest: { getStores: () => StickerHarnessStores };
}

const firstEnhancements: EnhancementValues = {
	stabilization: 25,
	denoise: 20,
	clarity: 20,
	upscale: 2,
	relight: 12,
	beauty: 15,
};

async function updateEnhancements({
	page,
	enhancements,
	localSeekTime,
}: {
	page: import("@playwright/test").Page;
	enhancements: EnhancementValues;
	localSeekTime: number;
}): Promise<void> {
	await page.evaluate(
		({ nextEnhancements, nextLocalSeekTime }) => {
			const harness = window as unknown as HarnessWindow;
			const timeline = harness.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.type === "media"
			);
			const element = track?.elements.find(
				(candidate) => candidate.type === "media"
			);
			if (!track || !element) throw new Error("Expected imported video clip");
			timeline.updateMediaElement(
				track.id,
				element.id,
				{ enhancements: nextEnhancements },
				false
			);
			harness.__playbackStore
				.getState()
				.seek(element.startTime + nextLocalSeekTime);
		},
		{ nextEnhancements: enhancements, nextLocalSeekTime: localSeekTime }
	);
}

async function getContentBoxSize({
	locator,
}: {
	locator: import("@playwright/test").Locator;
}): Promise<{ width: number; height: number }> {
	return locator.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		const horizontalBorder =
			Number.parseFloat(style.borderLeftWidth) +
			Number.parseFloat(style.borderRightWidth);
		const verticalBorder =
			Number.parseFloat(style.borderTopWidth) +
			Number.parseFloat(style.borderBottomWidth);

		return {
			width: bounds.width - horizontalBorder,
			height: bounds.height - verticalBorder,
		};
	});
}

async function addExactPreviewText({
	page,
}: {
	page: import("@playwright/test").Page;
}): Promise<void> {
	await page.evaluate(() => {
		const timeline = (
			window as unknown as HarnessWindow
		).__timelineStore.getState();
		const mediaStartTime = timeline.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.type === "media")?.startTime;
		if (mediaStartTime === undefined) {
			throw new Error("Expected a media clip before adding preview text");
		}
		const added = timeline.addTextAtTime(
			{
				type: "text",
				name: "Exact preview title",
				content: "QCUT EXACT PREVIEW",
				fontSize: 92,
				fontFamily: "Arial",
				color: "#ff00ff",
				backgroundColor: "transparent",
				textAlign: "center",
				fontWeight: "bold",
				fontStyle: "normal",
				textDecoration: "none",
				x: 0,
				y: 0,
				width: 900,
				height: 220,
				rotation: 0,
				opacity: 1,
				strokeColor: "#000000",
				strokeWidth: 5,
				strokeOpacity: 1,
				startTime: 0,
				duration: 5,
				trimStart: 0,
				trimEnd: 0,
			},
			mediaStartTime
		);
		if (!added) throw new Error("Failed to add exact-preview text");
	});
}

async function addExactPreviewSticker({
	page,
}: {
	page: import("@playwright/test").Page;
}): Promise<string> {
	await importTestImage(page);
	return page.evaluate(async () => {
		const harness = window as unknown as HarnessWindow;
		await harness.stickerTestReady;
		const stores = harness.stickerTest.getStores();
		const mediaItem = stores.media.mediaItems.find(
			(item) => item.type === "image"
		);
		const mediaStartTime = stores.timeline.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.type === "media")?.startTime;
		if (!mediaItem || mediaStartTime === undefined) {
			throw new Error("Expected video and image media before adding sticker");
		}

		const visual = {
			position: { x: 72, y: 28 },
			size: { width: 24, height: 24 },
			rotation: 18,
			opacity: 0.88,
		};
		const stickerId = stores.stickers.addOverlaySticker(mediaItem.id, visual);
		const trackId = stores.timeline.insertTrackAt("sticker", 0);
		const elementId = stores.timeline.addElementToTrack(
			trackId,
			{
				type: "sticker",
				stickerId,
				mediaId: mediaItem.id,
				name: "Exact preview sticker",
				duration: 5,
				startTime: mediaStartTime,
				trimStart: 0,
				trimEnd: 0,
				x: visual.position.x,
				y: visual.position.y,
				width: visual.size.width,
				height: visual.size.height,
				rotation: visual.rotation,
				opacity: visual.opacity,
				maintainAspectRatio: true,
				zIndex: 1,
			},
			{ pushHistory: false, selectElement: false }
		);
		if (!elementId) throw new Error("Failed to add exact-preview sticker");
		return stickerId;
	});
}

async function countMagentaPixels({
	image,
}: {
	image: import("@playwright/test").Locator;
}): Promise<number> {
	return image.evaluate((element) => {
		const source = element as HTMLImageElement;
		const canvas = document.createElement("canvas");
		canvas.width = source.naturalWidth;
		canvas.height = source.naturalHeight;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Canvas 2D context is unavailable");
		context.drawImage(source, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let count = 0;
		for (let index = 0; index < pixels.length; index += 4) {
			if (
				pixels[index] > 180 &&
				pixels[index + 1] < 100 &&
				pixels[index + 2] > 180
			) {
				count += 1;
			}
		}
		return count;
	});
}

async function hashPreviewPixels({
	image,
}: {
	image: import("@playwright/test").Locator;
}): Promise<number> {
	return image.evaluate((element) => {
		const source = element as HTMLImageElement;
		const canvas = document.createElement("canvas");
		canvas.width = source.naturalWidth;
		canvas.height = source.naturalHeight;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Canvas 2D context is unavailable");
		context.drawImage(source, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let hash = 2_166_136_261;
		for (const channel of pixels) {
			hash ^= channel;
			hash = Math.imul(hash, 16_777_619);
		}
		return hash >>> 0;
	});
}

test.describe("Native video enhancement preview", () => {
	test.setTimeout(300_000);

	test("renders and refreshes a real FFmpeg preview frame", async ({
		page,
		electronApp,
	}) => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1600,
				height: 960,
			});
		});

		await createTestProject(page, "Native Enhancement Preview");
		if (externalVideoPath && existsSync(externalVideoPath)) {
			await uploadTestMedia(page, externalVideoPath);
		} else {
			await importTestVideo(page);
		}
		const mediaItem = page.getByTestId("media-item").first();
		await expect(mediaItem).toBeVisible();
		await mediaItem.dragTo(page.getByTestId("timeline-track").first());
		const clip = page.getByTestId("timeline-element").first();
		await expect(clip).toBeVisible();
		await clip.click();

		await updateEnhancements({
			page,
			enhancements: firstEnhancements,
			localSeekTime: 0.5,
		});

		const nativePreview = page
			.locator('[data-native-composition-preview="ready"]')
			.first();
		await expect(nativePreview).toBeVisible({ timeout: 30_000 });
		const firstSource = await nativePreview.getAttribute("src");
		expect(firstSource).toMatch(/^blob:/);
		const renderedFrame = await nativePreview.evaluate((image) => ({
			naturalWidth: (image as HTMLImageElement).naturalWidth,
			naturalHeight: (image as HTMLImageElement).naturalHeight,
		}));
		expect(renderedFrame.naturalWidth).toBeGreaterThan(1);
		expect(renderedFrame.naturalHeight).toBeGreaterThan(1);
		const previewCanvas = page.getByTestId("preview-canvas");
		const [canvasContentBox, frameBox] = await Promise.all([
			getContentBoxSize({ locator: previewCanvas }),
			nativePreview.boundingBox(),
		]);
		expect(frameBox?.width).toBeCloseTo(canvasContentBox.width, 0);
		expect(frameBox?.height).toBeCloseTo(canvasContentBox.height, 0);

		await page.screenshot({
			path: path.join(outputDirectory, "01-native-composition-ready.png"),
			animations: "disabled",
		});

		await updateEnhancements({
			page,
			enhancements: { ...firstEnhancements, clarity: 70, relight: 30 },
			localSeekTime: 0.75,
		});
		await expect
			.poll(() => nativePreview.getAttribute("src"), { timeout: 30_000 })
			.not.toBe(firstSource);
		await expect(
			page.getByTestId("native-composition-preview-error")
		).toHaveCount(0);
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "02-native-composition-refreshed.png"),
			animations: "disabled",
		});
		const magentaPixelsBeforeText = await countMagentaPixels({
			image: nativePreview,
		});
		await addExactPreviewText({ page });
		await expect
			.poll(() => countMagentaPixels({ image: nativePreview }), {
				timeout: 30_000,
			})
			.toBeGreaterThan(magentaPixelsBeforeText + 500);
		const textFrameHash = await hashPreviewPixels({ image: nativePreview });
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "03-native-composition-text.png"),
			animations: "disabled",
		});

		const stickerId = await addExactPreviewSticker({ page });
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as HarnessWindow).__timelineStore
							.getState()
							.tracks.flatMap((track) => track.elements)
							.filter((element) => element.type === "sticker").length
				)
			)
			.toBeGreaterThan(0);
		await expect(
			page.locator(`[data-sticker-id="${stickerId}"]`)
		).toBeVisible();
		await expect
			.poll(() => hashPreviewPixels({ image: nativePreview }), {
				timeout: 30_000,
			})
			.not.toBe(textFrameHash);
		await expect(
			page.getByTestId("native-composition-preview-error")
		).toHaveCount(0);
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "04-native-composition-sticker.png"),
			animations: "disabled",
		});

		const proxyContainer = page
			.locator('[data-video-enhancement-proxy-status="ready"]')
			.first();
		await expect(proxyContainer).toBeVisible({ timeout: 90_000 });
		await expect(
			page.locator('[data-video-enhancement-proxy-status="error"]')
		).toHaveCount(0);
		const proxyVideo = proxyContainer.locator("video[data-video-id]").first();
		await expect
			.poll(
				() =>
					proxyVideo.evaluate(
						(video) => (video as HTMLVideoElement).currentSrc
					),
				{ timeout: 30_000 }
			)
			.toMatch(/^app:\/\/video-preview-proxy\//);
		const proxyTimeBeforePlayback = await proxyVideo.evaluate(
			(video) => (video as HTMLVideoElement).currentTime
		);
		await page.getByTestId("preview-play-button").click();
		await expect(page.getByTestId("preview-pause-button")).toBeVisible();
		await expect
			.poll(
				() =>
					proxyVideo.evaluate(
						(video) => (video as HTMLVideoElement).currentTime
					),
				{ timeout: 10_000 }
			)
			.toBeGreaterThan(proxyTimeBeforePlayback + 0.1);
		await expect(
			page.locator('[data-native-composition-preview="ready"]')
		).toHaveCount(0);

		await page.screenshot({
			path: path.join(outputDirectory, "05-enhanced-proxy-playback.png"),
			animations: "disabled",
		});
		await page.getByTestId("preview-pause-button").click();
	});
});
