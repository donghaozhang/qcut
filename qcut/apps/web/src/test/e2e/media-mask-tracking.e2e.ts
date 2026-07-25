import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createTestProject, expect, test } from "./helpers/electron-helpers";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";

const sourceVideoPath = process.env.QCUT_PERSON_VIDEO_PATH;
const outputDirectory = path.resolve("output/playwright/media-mask-tracking");

interface TrackingSnapshot {
	status?: string;
	progress: number;
	keyframeCount: number;
	correctedFrameCount: number;
}

async function trackingSnapshot({
	page,
}: {
	page: import("@playwright/test").Page;
}): Promise<TrackingSnapshot> {
	return page.evaluate(() => {
		const timeline = (
			window as unknown as {
				__timelineStore: {
					getState: () => {
						tracks: Array<{
							type: string;
							elements: Array<{
								type: string;
								masks?: Array<{
									type: string;
									tracking?: {
										status?: string;
										progress?: number;
										correctedFrames?: number[];
									};
									keyframes?: Record<string, Array<{ frame: number }>>;
								}>;
							}>;
						}>;
					};
				};
			}
		).__timelineStore.getState();
		const mask = timeline.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.type === "media")
			?.masks?.find((candidate) => candidate.type === "person");
		const keyframeCount = new Set(
			Object.values(mask?.keyframes ?? {}).flatMap((keyframes) =>
				keyframes.map((keyframe) => keyframe.frame)
			)
		).size;
		return {
			status: mask?.tracking?.status,
			progress: mask?.tracking?.progress ?? 0,
			keyframeCount,
			correctedFrameCount: mask?.tracking?.correctedFrames?.length ?? 0,
		};
	});
}

test.use({ captureScreenshotVideo: false });

test.describe("Media mask tracking workflow", () => {
	test.skip(
		!sourceVideoPath,
		"Set QCUT_PERSON_VIDEO_PATH to a video with a visible person"
	);
	test.setTimeout(240_000);

	test.beforeEach(async () => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
	});

	test("auto-starts, pauses, resumes, corrects, and reanalyzes a real person mask", async ({
		electronApp,
		page,
	}) => {
		await electronApp.evaluate(({ BrowserWindow }) => {
			const window = BrowserWindow.getAllWindows()[0];
			window.setSize(1900, 1080);
			window.center();
		});
		await createTestProject(page, "Media Mask Tracking E2E");
		await uploadTestMedia(page, sourceVideoPath!);

		const mediaItem = page.getByTestId("media-item").last();
		await mediaItem.dragTo(page.getByTestId("timeline-track").first());
		const clip = page.getByTestId("timeline-element").last();
		await expect(clip).toBeVisible();
		await clip.click();
		await page.evaluate(() => {
			const timeline = (
				window as unknown as {
					__timelineStore: {
						getState: () => {
							tracks: Array<{
								elements: Array<{ type: string; startTime: number }>;
							}>;
						};
					};
				}
			).__timelineStore.getState();
			const element = timeline.tracks
				.flatMap((track) => track.elements)
				.find((candidate) => candidate.type === "media");
			if (!element) throw new Error("Expected a media element");
			(
				window as unknown as {
					__playbackStore: {
						getState: () => { seek: (time: number) => void };
					};
				}
			).__playbackStore
				.getState()
				.seek(element.startTime + 0.1);
		});

		const properties = page.getByTestId("media-properties");
		await properties
			.getByTestId("media-properties-primary-tabs")
			.getByRole("tab", { name: "调整", exact: true })
			.click();
		const colorPanel = properties.getByTestId("color-properties-panel");
		await colorPanel.getByRole("tab", { name: "蒙版", exact: true }).click();
		const maskEditor = colorPanel.getByTestId("media-mask-properties");
		await maskEditor.getByRole("button", { name: "选择人物蒙版" }).click();
		const trackingControls = maskEditor.getByTestId("mask-tracking-controls");
		await expect(trackingControls).toBeVisible();
		await page.screenshot({
			path: path.join(outputDirectory, "01-person-mask-ready.png"),
			animations: "disabled",
		});

		await trackingControls.getByRole("button", { name: "双向跟踪" }).click();
		await expect(page.getByTestId("segmentation-panel-tab")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await expect
			.poll(() => trackingSnapshot({ page }), { timeout: 60_000 })
			.toMatchObject({ status: "processing" });
		await expect
			.poll(async () => (await trackingSnapshot({ page })).progress, {
				timeout: 60_000,
			})
			.toBeGreaterThan(0);
		await page.screenshot({
			path: path.join(outputDirectory, "02-tracking-running.png"),
			animations: "disabled",
		});

		await trackingControls.getByRole("button", { name: "暂停跟踪" }).click();
		await expect
			.poll(() => trackingSnapshot({ page }))
			.toMatchObject({ status: "paused" });
		await page.waitForTimeout(500);
		expect(await trackingSnapshot({ page })).toMatchObject({
			status: "paused",
		});
		await page.screenshot({
			path: path.join(outputDirectory, "03-tracking-paused.png"),
			animations: "disabled",
		});

		await trackingControls.getByRole("button", { name: "继续跟踪" }).click();
		await expect
			.poll(async () => (await trackingSnapshot({ page })).status)
			.toBe("processing");
		await expect
			.poll(() => trackingSnapshot({ page }), { timeout: 120_000 })
			.toMatchObject({ status: "ready", progress: 100 });
		const completed = await trackingSnapshot({ page });
		expect(completed.keyframeCount).toBeGreaterThan(1);
		await page.screenshot({
			path: path.join(outputDirectory, "04-tracking-completed.png"),
			animations: "disabled",
		});

		await trackingControls.getByRole("button", { name: "修正当前帧" }).click();
		await expect
			.poll(async () => (await trackingSnapshot({ page })).correctedFrameCount)
			.toBeGreaterThan(0);
		await page.screenshot({
			path: path.join(outputDirectory, "05-current-frame-corrected.png"),
			animations: "disabled",
		});

		await trackingControls.getByRole("button", { name: "重新分析" }).click();
		await expect
			.poll(async () => (await trackingSnapshot({ page })).status)
			.toBe("processing");
		await expect
			.poll(async () => (await trackingSnapshot({ page })).progress, {
				timeout: 60_000,
			})
			.toBeGreaterThan(0);
		await page.screenshot({
			path: path.join(outputDirectory, "06-reanalysis-running.png"),
			animations: "disabled",
		});
		await trackingControls.getByRole("button", { name: "暂停跟踪" }).click();
		await expect
			.poll(async () => (await trackingSnapshot({ page })).status)
			.toBe("paused");
	});
});
