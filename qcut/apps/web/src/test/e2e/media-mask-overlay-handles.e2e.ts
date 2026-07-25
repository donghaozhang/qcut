import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve("output/playwright/media-mask-overlay");

test.describe("Media mask canvas controls", () => {
	test.setTimeout(90_000);

	test.beforeEach(async () => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
	});

	test("shows Jianying-style edge and corner handles on the preview canvas", async ({
		page,
	}) => {
		await createTestProject(page, "Media Mask Overlay Handles");
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
			if (!element) throw new Error("Expected media element on the timeline");
			(
				window as unknown as {
					__playbackStore: { getState: () => { seek: (time: number) => void } };
				}
			).__playbackStore
				.getState()
				.seek(element.startTime + 0.1);
		});
		await expect(page.locator("text=No elements at current time")).toHaveCount(
			0
		);

		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		await properties
			.getByTestId("media-properties-primary-tabs")
			.getByRole("tab", { name: "画面", exact: true })
			.click();
		await properties
			.getByTestId("media-properties-visual-tabs")
			.getByRole("tab", { name: "蒙版", exact: true })
			.click();

		const maskEditor = properties.getByTestId("media-mask-properties");
		await maskEditor.getByRole("button", { name: "选择矩形蒙版" }).click();
		await maskEditor.getByLabel("羽化数值").fill("18");
		await maskEditor.getByLabel("羽化数值").press("Tab");

		const overlay = page.getByTestId("media-mask-canvas-overlay");
		await expect(overlay).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "移动蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "旋转蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "左上角缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "顶部缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "右上角缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "右侧缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "右下角缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "底部缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "左下角缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "左侧缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByTestId("media-mask-feather-outline")
		).toBeVisible();

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(
				outputDirectory,
				"01-rectangle-mask-eight-handles-feather.png"
			),
			animations: "disabled",
		});

		await maskEditor.getByRole("button", { name: "选择线性蒙版" }).click();
		await expect(
			overlay.getByRole("button", { name: "上羽化范围蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "下羽化范围蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "右侧缩放蒙版 1" })
		).toHaveCount(0);
		const bottomFeatherHandle = overlay.getByRole("button", {
			name: "下羽化范围蒙版 1",
		});
		const handleBeforeDrag = await bottomFeatherHandle.boundingBox();
		if (!handleBeforeDrag)
			throw new Error("Linear feather handle is not visible");
		await page.mouse.move(
			handleBeforeDrag.x + handleBeforeDrag.width / 2,
			handleBeforeDrag.y + handleBeforeDrag.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			handleBeforeDrag.x + handleBeforeDrag.width / 2,
			handleBeforeDrag.y + handleBeforeDrag.height / 2 + 32,
			{ steps: 4 }
		);
		await page.mouse.up();
		const handleAfterDrag = await bottomFeatherHandle.boundingBox();
		if (!handleAfterDrag) throw new Error("Linear feather handle disappeared");
		expect(handleAfterDrag.y - handleBeforeDrag.y).toBeGreaterThan(24);
		expect(handleAfterDrag.y - handleBeforeDrag.y).toBeLessThan(40);
		await bottomFeatherHandle.press("ArrowDown");
		const featherAfterKeyboardAdjust = await page.evaluate(() => {
			const timeline = (
				window as unknown as {
					__timelineStore: {
						getState: () => {
							tracks: Array<{
								type: string;
								elements: Array<{
									type: string;
									masks?: Array<{ type: string; feather: number }>;
								}>;
							}>;
						};
					};
				}
			).__timelineStore.getState();
			const element = timeline.tracks
				.find((track) => track.type === "media")
				?.elements.find((candidate) => candidate.type === "media");
			const mask = element?.masks?.find(
				(candidate) => candidate.type === "linear"
			);
			return mask?.feather ?? 0;
		});
		expect(featherAfterKeyboardAdjust).toBeGreaterThan(0.38);

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "02-linear-mask-feather-handles.png"),
			animations: "disabled",
		});

		await maskEditor.getByRole("button", { name: "选择镜面蒙版" }).click();
		await maskEditor.getByText("更多蒙版设置", { exact: true }).click();
		await maskEditor.getByLabel("反选蒙版").click();
		await expect(overlay.getByTestId("media-mask-mirror-axis")).toBeVisible();
		await expect(
			overlay.getByTestId("media-mask-mirror-active-range")
		).toBeVisible();
		await expect(overlay.getByTestId("media-mask-invert-guide")).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "左侧缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "右侧缩放蒙版 1" })
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "左上角缩放蒙版 1" })
		).toHaveCount(0);
		await overlay.getByTestId("media-mask-mirror-mode-right").click();
		await expect(
			overlay.getByTestId("media-mask-mirror-mode-right")
		).toHaveAttribute("aria-pressed", "true");
		const mirrorModeAfterClick = await page.evaluate(() => {
			const timeline = (
				window as unknown as {
					__timelineStore: {
						getState: () => {
							tracks: Array<{
								type: string;
								elements: Array<{
									type: string;
									masks?: Array<{ type: string; mirrorMode?: string }>;
								}>;
							}>;
						};
					};
				}
			).__timelineStore.getState();
			const element = timeline.tracks
				.find((track) => track.type === "media")
				?.elements.find((candidate) => candidate.type === "media");
			const mask = element?.masks?.find(
				(candidate) => candidate.type === "mirror"
			);
			return mask?.mirrorMode ?? "center";
		});
		expect(mirrorModeAfterClick).toBe("right");
		await expect(
			overlay.getByTestId("media-mask-mirror-range-left")
		).toBeVisible();
		await expect(
			overlay.getByTestId("media-mask-mirror-range-right")
		).toBeVisible();

		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDirectory, "03-mirror-mask-invert-guide.png"),
			animations: "disabled",
		});
	});
});
