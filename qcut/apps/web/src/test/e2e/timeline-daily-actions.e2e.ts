import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve(
	"output/playwright/timeline-daily-actions"
);

interface TimelineActionElement {
	id: string;
	type: string;
	mediaId?: string;
	name?: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	crop?: {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};
}

interface TimelineActionTrack {
	id: string;
	type: string;
	elements: TimelineActionElement[];
}

interface TimelineActionState {
	tracks: TimelineActionTrack[];
	addElementToTrack: (
		trackId: string,
		element: Omit<TimelineActionElement, "id">
	) => string | null;
	selectElement: (trackId: string, elementId: string) => void;
}

interface TimelineActionWindow extends Window {
	__timelineStore: { getState: () => TimelineActionState };
	__playbackStore: { getState: () => { seek: (time: number) => void } };
}

async function mediaTimelineState({ page }: { page: Page }) {
	return await page.evaluate(() => {
		const timeline = (
			window as TimelineActionWindow
		).__timelineStore.getState();
		const mediaTrack = timeline.tracks.find((track) => track.type === "media");
		if (!mediaTrack) throw new Error("Expected a media track");
		return {
			trackId: mediaTrack.id,
			elements: mediaTrack.elements.map((element) => ({
				id: element.id,
				type: element.type,
				startTime: element.startTime,
				duration: element.duration,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				name: element.name ?? "",
				crop: element.crop ?? null,
			})),
		};
	});
}

async function addImportedClipToTimeline({ page }: { page: Page }) {
	await importTestVideo(page);
	await page
		.getByTestId("media-item")
		.first()
		.dragTo(page.getByTestId("timeline-track").first());
	await expect(page.getByTestId("timeline-element").first()).toBeVisible();
}

async function createAdjacentRealVideoClips({ page }: { page: Page }) {
	await addImportedClipToTimeline({ page });
	return await page.evaluate(() => {
		const timeline = (
			window as TimelineActionWindow
		).__timelineStore.getState();
		const mediaTrack = timeline.tracks.find((track) => track.type === "media");
		const first = mediaTrack?.elements[0];
		if (!mediaTrack || !first || !first.mediaId) {
			throw new Error("Expected an imported media clip");
		}
		const visibleDuration = first.duration - first.trimStart - first.trimEnd;
		const secondId = timeline.addElementToTrack(mediaTrack.id, {
			type: "media",
			mediaId: first.mediaId,
			name: "Following clip",
			startTime: first.startTime + visibleDuration,
			duration: first.duration,
			trimStart: 0,
			trimEnd: 0,
		});
		if (!secondId) throw new Error("Failed to create following clip");
		timeline.selectElement(mediaTrack.id, first.id);
		const splitTime = first.startTime + Math.min(1, visibleDuration / 2);
		(window as TimelineActionWindow).__playbackStore.getState().seek(splitTime);
		return {
			trackId: mediaTrack.id,
			firstId: first.id,
			secondId,
			firstStartTime: first.startTime,
			firstVisibleDuration: visibleDuration,
			followingStartTime: first.startTime + visibleDuration,
			splitTime,
		};
	});
}

test.describe("Timeline daily action toolbar", () => {
	test.setTimeout(90_000);

	test.beforeAll(async () => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
	});

	test("copies, crops, and deletes a real imported media clip", async ({
		page,
	}) => {
		await createTestProject(page, "Timeline Daily Actions");
		await addImportedClipToTimeline({ page });
		const clips = page.getByTestId("timeline-element");
		await expect(clips.first()).toBeVisible();
		await clips.first().click();

		await page.screenshot({
			path: path.join(outputDirectory, "01-selected-real-video-clip.png"),
			animations: "disabled",
			fullPage: true,
		});

		await page.getByTestId("duplicate-clip-button").click();
		await expect(clips).toHaveCount(2);
		await expect
			.poll(() => mediaTimelineState({ page }))
			.toMatchObject({ elements: [{ type: "media" }, { type: "media" }] });

		await page.screenshot({
			path: path.join(outputDirectory, "02-copied-real-video-clip.png"),
			animations: "disabled",
			fullPage: true,
		});

		await clips.first().click();
		await page.keyboard.press("c");
		await expect(page.getByTestId("media-crop-controls")).toBeVisible();
		await page.getByLabel("顶部裁剪数值").fill("12");
		await page.getByLabel("顶部裁剪数值").press("Tab");
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements[0]?.crop?.top ?? 0;
			})
			.toBeCloseTo(0.12, 3);

		await page.screenshot({
			path: path.join(outputDirectory, "03-crop-controls-open-and-applied.png"),
			animations: "disabled",
			fullPage: true,
		});

		await clips.last().click();
		await page.getByTestId("delete-selected-button").click();
		await expect(clips).toHaveCount(1);
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements.length;
			})
			.toBe(1);

		await clips.first().click();
		await page.keyboard.press("Delete");
		await expect(clips).toHaveCount(0);
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements.length;
			})
			.toBe(0);

		await page.screenshot({
			path: path.join(
				outputDirectory,
				"04-delete-actions-cleared-timeline.png"
			),
			animations: "disabled",
			fullPage: true,
		});
	});

	test("splits adjacent real video clips at the playhead", async ({ page }) => {
		await createTestProject(page, "Timeline Split Trim Ripple");
		const setup = await createAdjacentRealVideoClips({ page });
		const clips = page.getByTestId("timeline-element");
		await expect(clips).toHaveCount(2);
		await clips.first().click();

		await page.getByTestId("split-clip-button").click();
		await expect(clips).toHaveCount(3);
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements.map((element) => element.startTime);
			})
			.toEqual([
				setup.firstStartTime,
				setup.splitTime,
				setup.followingStartTime,
			]);

		await page.screenshot({
			path: path.join(outputDirectory, "05-split-adjacent-real-clips.png"),
			animations: "disabled",
			fullPage: true,
		});
	});

	test("trims and ripple-deletes adjacent real video clips", async ({
		page,
	}) => {
		await createTestProject(page, "Timeline Keep Right Ripple");
		const trimSetup = await createAdjacentRealVideoClips({ page });
		const clips = page.getByTestId("timeline-element");
		await expect(clips).toHaveCount(2);
		await clips.first().click();
		await page.getByTestId("split-keep-right-button").click();
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements[0]?.startTime;
			})
			.toBeCloseTo(trimSetup.splitTime, 3);
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements[0]?.trimStart;
			})
			.toBeGreaterThan(0);

		await page.screenshot({
			path: path.join(outputDirectory, "06-keep-right-trim-applied.png"),
			animations: "disabled",
			fullPage: true,
		});

		const followingStartBeforeDelete = await page.evaluate(({ secondId }) => {
			const timeline = (
				window as TimelineActionWindow
			).__timelineStore.getState();
			return timeline.tracks
				.find((track) => track.type === "media")
				?.elements.find((element) => element.id === secondId)?.startTime;
		}, trimSetup);
		await page.getByTestId("timeline-ripple-button").click();
		await expect(page.getByTestId("timeline-ripple-button")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await clips.first().click();
		await page.getByTestId("delete-selected-button").click();
		await expect(clips).toHaveCount(1);
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements[0]?.id;
			})
			.toBe(trimSetup.secondId);
		await expect
			.poll(async () => {
				const state = await mediaTimelineState({ page });
				return state.elements[0]?.startTime;
			})
			.toBeLessThan(followingStartBeforeDelete ?? Number.POSITIVE_INFINITY);

		await page.screenshot({
			path: path.join(outputDirectory, "07-ripple-delete-closed-gap.png"),
			animations: "disabled",
			fullPage: true,
		});
	});
});
