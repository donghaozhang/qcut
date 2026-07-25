import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve("output/playwright/media-mask-ui-parity");

test.use({ captureScreenshotVideo: false });

test.describe("Media mask inspector visual parity", () => {
	test.setTimeout(90_000);

	test.beforeEach(async () => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
	});

	test("matches the compact rectangle, linear, and cutout inspector states", async ({
		electronApp,
		page,
	}) => {
		await electronApp.evaluate(({ BrowserWindow }) => {
			const window = BrowserWindow.getAllWindows()[0];
			window.setSize(1900, 1080);
			window.center();
		});
		await createTestProject(page, "Media Mask Inspector Parity");
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
				}
			).__timelineStore.getState();
			const element = timeline.tracks
				.find((track) => track.type === "media")
				?.elements.find((candidate) => candidate.type === "media");
			if (!element) throw new Error("Expected a media element");
			(
				window as unknown as {
					__playbackStore: { getState: () => { seek: (time: number) => void } };
				}
			).__playbackStore
				.getState()
				.seek(element.startTime + 0.1);
		});

		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		await properties
			.getByTestId("media-properties-primary-tabs")
			.getByRole("tab", { name: "调整", exact: true })
			.click();

		const colorPanel = properties.getByTestId("color-properties-panel");
		await colorPanel.getByRole("tab", { name: "蒙版", exact: true }).click();
		const maskEditor = colorPanel.getByTestId("media-mask-properties");

		await maskEditor.getByRole("button", { name: "选择矩形蒙版" }).click();
		await expect(
			maskEditor.getByText("蒙版参数", { exact: true })
		).toBeVisible();
		await expect(maskEditor.getByLabel("宽度数值")).toBeVisible();
		await expect(maskEditor.getByLabel("高度数值")).toBeVisible();
		await expect(
			maskEditor.getByRole("slider", { name: "圆角" })
		).toBeVisible();
		await properties.screenshot({
			path: path.join(outputDirectory, "01-rectangle-mask-inspector.jpg"),
			type: "jpeg",
			quality: 92,
			animations: "disabled",
		});

		await maskEditor.getByRole("button", { name: "选择线性蒙版" }).click();
		await expect(maskEditor.getByLabel("宽度数值")).toHaveCount(0);
		await expect(maskEditor.getByLabel("高度数值")).toHaveCount(0);
		await expect(maskEditor.getByRole("slider", { name: "圆角" })).toHaveCount(
			0
		);
		await properties.screenshot({
			path: path.join(outputDirectory, "02-linear-mask-inspector.jpg"),
			type: "jpeg",
			quality: 92,
			animations: "disabled",
		});

		await maskEditor.getByRole("button", { name: "选择抠像蒙版" }).click();
		await expect(
			maskEditor.getByTestId("mask-tracking-controls")
		).toBeVisible();
		await properties.screenshot({
			path: path.join(outputDirectory, "03-cutout-mask-inspector.jpg"),
			type: "jpeg",
			quality: 92,
			animations: "disabled",
		});

		const horizontalOverflow = await properties.evaluate(
			(node) => node.scrollWidth - node.clientWidth
		);
		expect(horizontalOverflow).toBeLessThanOrEqual(1);
	});
});
