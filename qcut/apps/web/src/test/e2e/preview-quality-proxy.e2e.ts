import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve("output/playwright/preview-quality-proxy");

test.describe("Preview quality proxy playback", () => {
	test.setTimeout(120_000);

	test.beforeEach(async () => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
	});

	test("uses a lower-resolution proxy only while playing", async ({ page }) => {
		await createTestProject(page, "Preview Quality Proxy");
		await importTestVideo(page);

		const mediaItem = page.getByTestId("media-item").first();
		await expect(mediaItem).toBeVisible();
		await mediaItem.dragTo(page.getByTestId("timeline-track").first());
		const clip = page.getByTestId("timeline-element").first();
		await expect(clip).toBeVisible();
		await clip.click();
		await page.evaluate(() => {
			const timeline = (
				window as unknown as {
					__timelineStore: {
						getState: () => {
							tracks: Array<{
								type: string;
								elements: Array<{ type: string; startTime: number }>;
							}>;
						};
					};
					__playbackStore: {
						getState: () => { seek: (time: number) => void };
					};
				}
			).__timelineStore.getState();
			const mediaElement = timeline.tracks
				.find((track) => track.type === "media")
				?.elements.find((element) => element.type === "media");
			if (!mediaElement) throw new Error("Expected a media timeline element");
			(
				window as unknown as {
					__playbackStore: { getState: () => { seek: (time: number) => void } };
				}
			).__playbackStore
				.getState()
				.seek(mediaElement.startTime + 0.1);
		});
		await expect(page.locator("text=No elements at current time")).toHaveCount(
			0
		);
		await expect(page.getByTestId("preview-quality-button")).toHaveText("自动");
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "00-auto-quality-default.png"),
			animations: "disabled",
		});

		const cachedTimelineTime = await page.evaluate(
			() =>
				(
					window as unknown as {
						__playbackStore: {
							getState: () => { currentTime: number };
						};
					}
				).__playbackStore.getState().currentTime
		);
		const activeVideo = page.locator("video[data-video-id]").first();
		await expect
			.poll(
				async () =>
					Number(
						await activeVideo.getAttribute("data-qcut-presented-timeline-time")
					),
				{ timeout: 10_000 }
			)
			.toBeCloseTo(cachedTimelineTime, 1);
		await page.waitForTimeout(2_000);
		await page.evaluate((time) => {
			(
				window as unknown as {
					__playbackStore: {
						getState: () => { seek: (nextTime: number) => void };
					};
				}
			).__playbackStore
				.getState()
				.seek(time + 1);
		}, cachedTimelineTime);
		await expect
			.poll(
				async () =>
					Number(
						await activeVideo.getAttribute("data-qcut-presented-timeline-time")
					),
				{ timeout: 10_000 }
			)
			.toBeCloseTo(cachedTimelineTime + 1, 1);
		await page.evaluate((time) => {
			(
				window as unknown as {
					__playbackStore: {
						getState: () => { seek: (nextTime: number) => void };
					};
				}
			).__playbackStore
				.getState()
				.seek(time);
		}, cachedTimelineTime);
		await expect(page.getByTestId("preview-canvas")).toHaveAttribute(
			"data-frame-cache-lookup",
			"hit",
			{ timeout: 5_000 }
		);
		await expect(
			page.getByTestId("preview-frame-cache-overlay")
		).toHaveAttribute("data-visible", "true");
		const cachedFramePixels = await page
			.getByTestId("preview-frame-cache-overlay")
			.evaluate((node) => {
				const canvas = node as HTMLCanvasElement;
				const context = canvas.getContext("2d");
				if (!context) return { coloredSamples: 0, height: 0, width: 0 };
				const pixels = context.getImageData(
					0,
					0,
					canvas.width,
					canvas.height
				).data;
				let coloredSamples = 0;
				for (let offset = 0; offset < pixels.length; offset += 4000) {
					const colorTotal =
						pixels[offset] + pixels[offset + 1] + pixels[offset + 2];
					if (pixels[offset + 3] > 0 && colorTotal > 30) coloredSamples++;
				}
				return {
					coloredSamples,
					height: canvas.height,
					width: canvas.width,
				};
			});
		expect(cachedFramePixels.width).toBeGreaterThan(0);
		expect(cachedFramePixels.height).toBeGreaterThan(0);
		expect(cachedFramePixels.coloredSamples).toBeGreaterThan(10);
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "00-cached-frame-scrub-hit.png"),
			animations: "disabled",
		});
		await expect(
			page.getByTestId("preview-frame-cache-overlay")
		).toHaveAttribute("data-visible", "false", { timeout: 3_000 });

		await page.getByTestId("preview-play-button").click();
		await expect(page.getByTestId("preview-pause-button")).toBeVisible();
		await page.evaluate(() => {
			for (let index = 0; index < 5; index++) {
				window.dispatchEvent(
					new CustomEvent("qcut-video-frame", {
						detail: {
							videoId: "e2e-video",
							isActivePlaybackFrame: true,
							intervalMs: 95,
							mediaTime: index / 10,
							presentedFrames: index + 1,
						},
					})
				);
			}
		});
		await expect(page.getByTestId("preview-quality-button")).toContainText(
			"低清画质"
		);
		await page.getByTestId("preview-quality-button").click();
		await expect(page.getByTestId("preview-runtime-quality-reason")).toHaveText(
			"视频解码帧出现停顿"
		);
		await expect(
			page.getByTestId("preview-runtime-quality-metrics")
		).toContainText("视频");
		await expect(
			page.getByTestId("preview-runtime-quality-metrics")
		).toContainText("停顿");
		await page.screenshot({
			path: path.join(outputDirectory, "01-auto-downgrade-diagnostic.png"),
			animations: "disabled",
			fullPage: true,
		});
		await page.keyboard.press("Escape");
		await page.getByTestId("preview-pause-button").click();
		await expect(page.getByTestId("preview-quality-button")).toHaveText("自动");

		await page.getByTestId("preview-quality-button").click();
		await page.getByRole("menuitem").filter({ hasText: "流畅画质" }).click();
		await expect(page.getByTestId("preview-quality-button")).toHaveText(
			"流畅画质"
		);
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							(
								window as unknown as {
									__playbackStore: {
										getState: () => { previewQuality: string };
									};
								}
							).__playbackStore.getState().previewQuality
					),
				{ timeout: 5_000 }
			)
			.toBe("smooth");

		const proxyContainer = page
			.locator('[data-video-enhancement-proxy-status="ready"]')
			.first();
		await expect(proxyContainer).toBeVisible({ timeout: 90_000 });
		await expect(proxyContainer).toHaveAttribute(
			"data-video-preview-source",
			"source"
		);
		await expect(proxyContainer).toHaveAttribute(
			"data-preview-effect-render-mode",
			"full"
		);
		const video = proxyContainer.locator("video[data-video-id]").first();
		await expect
			.poll(
				() => video.evaluate((node) => (node as HTMLVideoElement).currentSrc),
				{ timeout: 30_000 }
			)
			.not.toMatch(/^app:\/\/video-preview-proxy\//);

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "01-paused-source-preview.png"),
			animations: "disabled",
		});

		await page.getByTestId("preview-play-button").click();
		await expect(page.getByTestId("preview-pause-button")).toBeVisible();
		await expect(proxyContainer).toHaveAttribute(
			"data-video-preview-source",
			"proxy",
			{ timeout: 30_000 }
		);
		await expect(proxyContainer).toHaveAttribute(
			"data-preview-effect-render-mode",
			"reduced"
		);
		await expect
			.poll(
				() => video.evaluate((node) => (node as HTMLVideoElement).currentSrc),
				{ timeout: 30_000 }
			)
			.toMatch(/^app:\/\/video-preview-proxy\//);

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "02-playing-proxy-preview.png"),
			animations: "disabled",
		});

		await page.getByTestId("preview-pause-button").click();
		await expect(proxyContainer).toHaveAttribute(
			"data-video-preview-source",
			"source",
			{ timeout: 30_000 }
		);
		await expect(proxyContainer).toHaveAttribute(
			"data-preview-effect-render-mode",
			"full"
		);

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "03-paused-restored-source-preview.png"),
			animations: "disabled",
		});

		await page.getByTestId("preview-quality-button").click();
		await expect(page.getByTestId("preview-proxy-cache-status")).toBeVisible();
		await expect(page.getByTestId("preview-proxy-cache-status")).toContainText(
			"代理缓存"
		);
		await expect(page.getByTestId("preview-proxy-cache-open")).toBeEnabled({
			timeout: 10_000,
		});
		await page.screenshot({
			path: path.join(outputDirectory, "04-proxy-cache-actions.png"),
			animations: "disabled",
			fullPage: true,
		});
		await expect(page.getByTestId("preview-proxy-cache-clear")).toBeEnabled({
			timeout: 10_000,
		});
		await page.getByTestId("preview-proxy-cache-clear").click();
		await expect(page.getByTestId("preview-proxy-cache-status")).toContainText(
			"0 MB",
			{ timeout: 10_000 }
		);
		await page.screenshot({
			path: path.join(outputDirectory, "05-proxy-cache-cleared.png"),
			animations: "disabled",
			fullPage: true,
		});
	});
});
