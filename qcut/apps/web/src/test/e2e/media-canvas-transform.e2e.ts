import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve(
	"output/playwright/media-canvas-transform"
);
const externalVideoPath = process.env.QCUT_REAL_VIDEO_PATH;

interface HarnessMediaElement {
	id: string;
	name: string;
	type: "media";
	mediaId: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	x?: number;
	y?: number;
	scaleX?: number;
	scaleY?: number;
	rotation?: number;
	crop?: { top: number; right: number; bottom: number; left: number };
}

interface HarnessTrack {
	id: string;
	type: string;
	elements: HarnessMediaElement[];
}

interface HarnessTimelineState {
	tracks: HarnessTrack[];
	history: unknown[];
	addTrack: (type: "media") => string;
	addElementToTrack: (
		trackId: string,
		element: Omit<HarnessMediaElement, "id">,
		options: { pushHistory: boolean; selectElement: boolean }
	) => string | null;
	setSelectedElements: (
		selection: Array<{ trackId: string; elementId: string }>
	) => void;
}

interface HarnessWindow extends Window {
	__timelineStore: { getState: () => HarnessTimelineState };
	__playbackStore: { getState: () => { seek: (time: number) => void } };
}

async function readPrimaryTransform({ page }: { page: Page }) {
	return page.evaluate(() => {
		const timeline = (
			window as unknown as HarnessWindow
		).__timelineStore.getState();
		const element = timeline.tracks
			.flatMap((track) => track.elements)
			.find((candidate) => candidate.type === "media");
		if (!element) throw new Error("Expected a media element");
		return {
			x: element.x ?? 0,
			y: element.y ?? 0,
			scaleX: element.scaleX ?? 1,
			scaleY: element.scaleY ?? 1,
			rotation: element.rotation ?? 0,
			crop: element.crop ?? { top: 0, right: 0, bottom: 0, left: 0 },
			historyLength: timeline.history.length,
		};
	});
}

test.describe("Media canvas direct manipulation", () => {
	test.setTimeout(180_000);

	test("moves, resizes, rotates, crops, and transforms a real selected video", async ({
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

		await createTestProject(page, "Media Canvas Transform");
		if (externalVideoPath && existsSync(externalVideoPath)) {
			await uploadTestMedia(page, externalVideoPath);
		} else {
			await importTestVideo(page);
		}
		await page
			.getByTestId("media-item")
			.first()
			.dragTo(page.getByTestId("timeline-track").first());
		const clip = page.getByTestId("timeline-element").first();
		await expect(clip).toBeVisible();
		await clip.click();
		await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			const element = harness.__timelineStore
				.getState()
				.tracks.flatMap((track) => track.elements)[0];
			harness.__playbackStore.getState().seek(element.startTime + 0.5);
		});

		const overlay = page.getByTestId("media-transform-overlay");
		await expect(overlay).toBeVisible();
		await expect(overlay).toHaveAttribute("data-selection-count", "1");
		await expect(page.getByTestId("media-rotation-handle")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Crop media" })
		).toBeVisible();
		await page.screenshot({
			path: path.join(outputDirectory, "01-selected-video-controls.png"),
			animations: "disabled",
		});

		const beforeDrag = await readPrimaryTransform({ page });
		const dragSurface = page.getByTestId("media-transform-drag-surface");
		const dragBounds = await dragSurface.boundingBox();
		if (!dragBounds) throw new Error("Expected canvas drag surface bounds");
		await page.mouse.move(
			dragBounds.x + dragBounds.width / 2,
			dragBounds.y + dragBounds.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			dragBounds.x + dragBounds.width / 2 + 42,
			dragBounds.y + dragBounds.height / 2 + 18,
			{ steps: 4 }
		);
		await page.mouse.up();
		await expect
			.poll(async () => (await readPrimaryTransform({ page })).x)
			.toBeGreaterThan(beforeDrag.x + 1);
		const afterDrag = await readPrimaryTransform({ page });
		expect(afterDrag.y).toBeGreaterThan(beforeDrag.y + 1);
		expect(afterDrag.historyLength).toBe(beforeDrag.historyLength + 1);

		await page.getByTestId("media-rotation-handle").focus();
		await page.getByTestId("media-rotation-handle").press("Shift+ArrowRight");
		await expect
			.poll(async () => (await readPrimaryTransform({ page })).rotation)
			.toBeCloseTo(afterDrag.rotation + 15);

		const beforeResize = await readPrimaryTransform({ page });
		await page.getByTestId("media-resize-handle-bottom-right").focus();
		await page
			.getByTestId("media-resize-handle-bottom-right")
			.press("Shift+ArrowRight");
		await expect
			.poll(async () => (await readPrimaryTransform({ page })).scaleX)
			.toBeGreaterThan(beforeResize.scaleX);

		await page.getByRole("button", { name: "Crop media" }).click();
		await expect(page.getByTestId("media-crop-box")).toBeVisible();
		await page.getByTestId("media-crop-handle-left").focus();
		await page.getByTestId("media-crop-handle-left").press("Shift+ArrowRight");
		await expect
			.poll(async () => (await readPrimaryTransform({ page })).crop.left)
			.toBeGreaterThan(0);
		await page.screenshot({
			path: path.join(outputDirectory, "02-crop-controls.png"),
			animations: "disabled",
		});
		await page.getByRole("button", { name: "Finish crop" }).click();

		await page.evaluate(() => {
			const timeline = (
				window as unknown as HarnessWindow
			).__timelineStore.getState();
			const firstTrack = timeline.tracks.find(
				(track) => track.type === "media"
			);
			const first = firstTrack?.elements[0];
			if (!firstTrack || !first) throw new Error("Expected first media clip");
			const secondTrackId = timeline.addTrack("media");
			const secondId = timeline.addElementToTrack(
				secondTrackId,
				{
					type: "media",
					mediaId: first.mediaId,
					name: "Second canvas layer",
					duration: first.duration,
					startTime: first.startTime,
					trimStart: first.trimStart,
					trimEnd: first.trimEnd,
					x: -120,
					y: -80,
					scaleX: 0.5,
					scaleY: 0.5,
					rotation: -8,
				},
				{ pushHistory: false, selectElement: false }
			);
			if (!secondId) throw new Error("Failed to add second media layer");
			timeline.setSelectedElements([
				{ trackId: firstTrack.id, elementId: first.id },
				{ trackId: secondTrackId, elementId: secondId },
			]);
		});
		await expect(overlay).toHaveAttribute("data-selection-count", "2");
		await expect(page.getByRole("button", { name: "Crop media" })).toHaveCount(
			0
		);
		await page.getByTestId("media-rotation-handle").focus();
		await page.getByTestId("media-rotation-handle").press("ArrowRight");
		const groupRotations = await page.evaluate(() => {
			const timeline = (
				window as unknown as HarnessWindow
			).__timelineStore.getState();
			return timeline.tracks
				.flatMap((track) => track.elements)
				.map((element) => element.rotation ?? 0);
		});
		expect(groupRotations).toHaveLength(2);
		expect(groupRotations[0]).toBeCloseTo(afterDrag.rotation + 16);
		expect(groupRotations[1]).toBeCloseTo(-7);
		await page.screenshot({
			path: path.join(outputDirectory, "03-multi-selection-controls.png"),
			animations: "disabled",
		});
	});
});
