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

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "03-paused-restored-source-preview.png"),
			animations: "disabled",
		});

		await page.getByTestId("preview-quality-button").click();
		await expect(page.getByTestId("preview-proxy-cache-status")).toBeVisible();
		await expect(page.getByTestId("preview-proxy-cache-status")).toContainText(
			"代理缓存"
		);
		await expect(page.getByTestId("preview-proxy-cache-clear")).toBeEnabled({
			timeout: 10_000,
		});
		await page.getByTestId("preview-proxy-cache-clear").click();
		await expect(page.getByTestId("preview-proxy-cache-status")).toContainText(
			"0 MB",
			{ timeout: 10_000 }
		);
		await page.screenshot({
			path: path.join(outputDirectory, "04-proxy-cache-cleared.png"),
			animations: "disabled",
			fullPage: true,
		});
	});
});
