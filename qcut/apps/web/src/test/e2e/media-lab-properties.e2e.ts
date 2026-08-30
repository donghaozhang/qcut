import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const evidenceDirectory = path.resolve(
	process.cwd(),
	"docs/task/jianying-video-basic-panel-reference/evidence"
);

async function clickWithPointer({
	page,
	target,
}: {
	page: Page;
	target: Locator;
}) {
	const box = await target.boundingBox();
	if (!box) throw new Error("Pointer target is not visible");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.up();
}

async function addVideoClip({ page }: { page: Page }) {
	const mediaItem = page.getByTestId("media-item").first();
	const timelineTrack = page.getByTestId("timeline-track").first();
	await mediaItem.dragTo(timelineTrack);
	const clip = page.getByTestId("timeline-element").first();
	if ((await clip.count()) > 0) return clip;

	await page.evaluate(() => {
		type TestElement = { id: string };
		type TestTrack = {
			id: string;
			type: string;
			isMain?: boolean;
			elements: TestElement[];
		};
		type TimelineState = {
			tracks: TestTrack[];
			addElementToTrack: (trackId: string, element: object) => void;
		};
		type MediaState = {
			mediaItems: Array<{
				id: string;
				name: string;
				duration?: number;
			}>;
		};
		const stores = window as unknown as {
			__timelineStore: { getState: () => TimelineState };
			__mediaStore: { getState: () => MediaState };
		};
		const timeline = stores.__timelineStore.getState();
		const media = stores.__mediaStore.getState().mediaItems[0];
		const track = timeline.tracks.find(
			(item) => item.isMain || item.type === "media"
		);
		if (!track || !media) throw new Error("Test media track is unavailable");
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
	return clip;
}

async function seedLocalPersonTrack({ page }: { page: Page }) {
	await page.evaluate(() => {
		type TestElement = { id: string };
		type TestTrack = { id: string; type: string; elements: TestElement[] };
		type TimelineState = {
			tracks: TestTrack[];
			updateMediaElement: (
				trackId: string,
				elementId: string,
				updates: object,
				recordHistory?: boolean
			) => void;
		};
		const store = (
			window as unknown as {
				__timelineStore: { getState: () => TimelineState };
			}
		).__timelineStore.getState();
		const track = store.tracks.find((item) => item.type === "media");
		const element = track?.elements[0];
		if (!track || !element) throw new Error("Test clip is unavailable");
		store.updateMediaElement(
			track.id,
			element.id,
			{
				masks: [
					{
						id: "local-person-track",
						name: "Local person",
						enabled: true,
						blendMode: "add",
						type: "ellipse",
						centerX: 0.42,
						centerY: 0.48,
						width: 0.3,
						height: 0.58,
						rotation: 0,
						feather: 0.05,
						invert: false,
						tracking: {
							direction: "both",
							status: "ready",
							source: "mediapipe",
							progress: 100,
						},
						keyframes: {
							centerX: [
								{ id: "cx-0", frame: 0, value: 0.42, easing: "linear" },
								{ id: "cx-60", frame: 60, value: 0.63, easing: "linear" },
							],
							centerY: [
								{ id: "cy-0", frame: 0, value: 0.48, easing: "linear" },
								{ id: "cy-60", frame: 60, value: 0.43, easing: "linear" },
							],
							width: [
								{ id: "w-0", frame: 0, value: 0.3, easing: "linear" },
								{ id: "w-60", frame: 60, value: 0.24, easing: "linear" },
							],
							height: [
								{ id: "h-0", frame: 0, value: 0.58, easing: "linear" },
								{ id: "h-60", frame: 60, value: 0.5, easing: "linear" },
							],
						},
					},
				],
			},
			false
		);
	});
}

test.describe("Local video lab", () => {
	test("uses the pointer, persists local controls, and applies tracked keyframes", async ({
		page,
	}) => {
		await mkdir(evidenceDirectory, { recursive: true });
		await createTestProject(page, "Local Video Lab E2E");
		await importTestVideo(page);
		const clip = await addVideoClip({ page });
		await expect(clip).toBeVisible();
		await clip.click();
		await page.evaluate(() => {
			type TestTrack = {
				type: string;
				elements: Array<{ startTime: number }>;
			};
			const stores = window as unknown as {
				__timelineStore: { getState: () => { tracks: TestTrack[] } };
				__playbackStore: { getState: () => { seek: (time: number) => void } };
			};
			const element = stores.__timelineStore
				.getState()
				.tracks.find((item) => item.type === "media")?.elements[0];
			if (!element) throw new Error("Test clip is unavailable");
			stores.__playbackStore.getState().seek(element.startTime + 0.25);
		});
		await seedLocalPersonTrack({ page });

		const properties = page.getByTestId("media-properties");
		const lab = page.getByTestId("media-lab-properties");
		await expect(properties).toBeVisible();
		await expect(lab).toBeVisible();
		await lab.scrollIntoViewIfNeeded();

		const deflickerSlider = lab.getByRole("slider", {
			name: "实验室防闪烁",
		});
		const sliderBox = await deflickerSlider.boundingBox();
		if (!sliderBox) throw new Error("Deflicker slider is not visible");
		await page.mouse.move(sliderBox.x + 2, sliderBox.y + sliderBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			sliderBox.x + sliderBox.width * 0.58,
			sliderBox.y + sliderBox.height / 2,
			{ steps: 8 }
		);
		await page.mouse.up();

		await lab.getByLabel("实验室光流运动模糊数值").fill("35");
		await lab.getByLabel("实验室光流运动模糊数值").press("Tab");
		await lab.getByLabel("实验室眼神修正数值").fill("40");
		await lab.getByLabel("实验室眼神修正数值").press("Tab");
		await lab.getByLabel("实验室本地超分").click();
		await page.getByRole("option", { name: "2x", exact: true }).click();

		for (const label of [
			"实验室智能运镜",
			"实验室智能裁剪",
			"实验室镜头追踪",
		]) {
			const button = lab.getByRole("button", { name: label, exact: true });
			await expect(button).toBeEnabled();
			await clickWithPointer({ page, target: button });
		}

		const state = await page.evaluate(() => {
			type TestElement = {
				enhancements?: {
					labDeflicker?: number;
					labOpticalFlowMotionBlur?: number;
					labEyeCorrection?: number;
					labLocalSuperResolution?: number;
				};
				keyframes?: Record<string, unknown[]>;
			};
			type TestTrack = { type: string; elements: TestElement[] };
			const store = (
				window as unknown as {
					__timelineStore: { getState: () => { tracks: TestTrack[] } };
				}
			).__timelineStore.getState();
			const element = store.tracks.find((item) => item.type === "media")
				?.elements[0];
			if (!element) throw new Error("Test clip is unavailable");
			return {
				enhancements: element.enhancements,
				xKeyframes: element.keyframes?.x?.length ?? 0,
				yKeyframes: element.keyframes?.y?.length ?? 0,
			};
		});
		expect(state.enhancements?.labDeflicker).toBeGreaterThan(0);
		expect(state.enhancements).toMatchObject({
			labOpticalFlowMotionBlur: 35,
			labEyeCorrection: 40,
			labLocalSuperResolution: 2,
		});
		expect(state.xKeyframes).toBeGreaterThanOrEqual(2);
		expect(state.yKeyframes).toBeGreaterThanOrEqual(2);
		await expect(page.getByText("No elements at current time")).toHaveCount(0);
		await page.waitForTimeout(750);

		await page.screenshot({
			path: path.join(evidenceDirectory, "qcut-media-lab-ui.png"),
			animations: "disabled",
		});
		await lab.screenshot({
			path: path.join(evidenceDirectory, "qcut-media-lab-panel.png"),
			animations: "disabled",
		});
	});
});
