import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve("output/playwright/media-ai-outpaint");

interface HarnessMediaItem {
	id: string;
	name: string;
	duration?: number;
}

interface HarnessTimelineState {
	tracks: Array<{
		id: string;
		type: string;
		isMain?: boolean;
		elements: Array<{ id: string; type: string; startTime: number }>;
	}>;
	addElementToTrack: (
		trackId: string,
		element: Record<string, unknown>
	) => string | null;
}

interface HarnessWindow extends Window {
	__mediaStore: { getState: () => { mediaItems: HarnessMediaItem[] } };
	__playbackStore: { getState: () => { seek: (time: number) => void } };
	__timelineStore: { getState: () => HarnessTimelineState };
}

test.describe("Selected video AI outpaint", () => {
	test("shows a complete right-side outpaint workflow without layout overflow", async ({
		page,
	}) => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "AI Outpaint Visual Audit");
		await importTestVideo(page);

		const mediaItem = page.getByTestId("media-item").first();
		const timelineTrack = page.getByTestId("timeline-track").first();
		await mediaItem.dragTo(timelineTrack);
		let clip = page.getByTestId("timeline-element").first();
		if ((await clip.count()) === 0) {
			await page.evaluate(() => {
				const harness = window as unknown as HarnessWindow;
				const timeline = harness.__timelineStore.getState();
				const media = harness.__mediaStore.getState().mediaItems[0];
				const track = timeline.tracks.find(
					(candidate) => candidate.isMain || candidate.type === "media"
				);
				if (!track || !media) throw new Error("Expected imported test video");
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
			clip = page.getByTestId("timeline-element").first();
		}

		await expect(clip).toBeVisible();
		await clip.click();
		await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			const element = harness.__timelineStore
				.getState()
				.tracks.flatMap((track) => track.elements)
				.find((candidate) => candidate.type === "media");
			if (!element) throw new Error("Expected a timeline media element");
			harness.__playbackStore.getState().seek(element.startTime + 0.25);
		});
		await expect(page.getByText("No elements at current time")).toHaveCount(0);
		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		await properties
			.getByTestId("media-properties-primary-tabs")
			.getByRole("tab", { name: "AI效果", exact: true })
			.click();

		const aiPanel = properties.getByTestId("media-ai-properties");
		await expect(aiPanel).toBeVisible();
		await expect(
			properties.getByText("AI 扩图", { exact: true })
		).toBeVisible();
		await expect(properties.getByLabel("目标比例")).toBeVisible();
		await expect(properties.getByLabel("分辨率")).toBeVisible();
		await expect(properties.getByTestId("media-outpaint-prompt")).toBeVisible();
		await properties
			.getByTestId("media-outpaint-prompt")
			.fill("延伸办公室墙面和地板，保持人物与光线一致");
		await expect(
			properties.getByTestId("media-outpaint-generate")
		).toBeVisible();

		const bounds = await properties.evaluate((element) => {
			const panel = element.getBoundingClientRect();
			const controls = Array.from(
				element.querySelectorAll("button, textarea, [role='combobox']")
			).map((control) => control.getBoundingClientRect());
			return {
				panelLeft: panel.left,
				panelRight: panel.right,
				viewportWidth: window.innerWidth,
				controlsFit: controls.every(
					(control) =>
						control.left >= panel.left - 1 && control.right <= panel.right + 1
				),
			};
		});
		expect(bounds.panelLeft).toBeGreaterThan(bounds.viewportWidth / 2);
		expect(bounds.panelRight).toBeLessThanOrEqual(bounds.viewportWidth);
		expect(bounds.controlsFit).toBe(true);

		const propertiesViewport = properties.locator(
			"xpath=ancestor::*[@data-radix-scroll-area-viewport][1]"
		);
		await propertiesViewport.screenshot({
			path: path.join(outputDirectory, "01-ai-outpaint-properties.png"),
			animations: "disabled",
		});
		await page.screenshot({
			path: path.join(outputDirectory, "02-ai-outpaint-editor.png"),
			animations: "disabled",
		});
	});
});
