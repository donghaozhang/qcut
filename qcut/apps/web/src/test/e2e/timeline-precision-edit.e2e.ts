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
	"output/playwright/timeline-precision-edit"
);
const externalVideoPath = process.env.QCUT_REAL_VIDEO_PATH;

interface PrecisionMediaElement {
	id: string;
	type: "media";
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	playbackRate?: number;
}

interface PrecisionTrack {
	id: string;
	type: string;
	isMain?: boolean;
	elements: PrecisionMediaElement[];
	transitions?: Array<{
		id: string;
		fromElementId: string;
		toElementId: string;
		duration: number;
	}>;
}

interface PrecisionTimelineState {
	tracks: PrecisionTrack[];
	history: unknown[];
	addElementToTrack: (
		trackId: string,
		element: {
			type: "media";
			mediaId: string;
			name: string;
			duration: number;
			startTime: number;
			trimStart: number;
			trimEnd: number;
		}
	) => string | null;
	addTransition: (input: {
		trackId: string;
		fromElementId: string;
		toElementId: string;
		videoMediaIds: ReadonlySet<string>;
		presetId: string;
		type: "dissolve";
		duration: number;
		easing: "easeInOut";
	}) => string | null;
	setSelectedElements: (
		selection: Array<{ trackId: string; elementId: string }>
	) => void;
}

interface PrecisionHarnessWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{
				id: string;
				name: string;
				duration?: number;
			}>;
		};
	};
	__playbackStore: { getState: () => { seek: (time: number) => void } };
	__timelineStore: { getState: () => PrecisionTimelineState };
}

interface PrecisionTiming {
	first: PrecisionMediaElement;
	second: PrecisionMediaElement;
	historyLength: number;
	seam: number;
	sequenceEnd: number;
	transitionId: string | null;
}

function effectiveDuration({ element }: { element: PrecisionMediaElement }) {
	return (
		(element.duration - element.trimStart - element.trimEnd) /
		(element.playbackRate ?? 1)
	);
}

async function readTiming({ page }: { page: Page }): Promise<PrecisionTiming> {
	return page.evaluate(() => {
		const timeline = (
			window as unknown as PrecisionHarnessWindow
		).__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.isMain || candidate.type === "media"
		);
		const elements = [...(track?.elements ?? [])].sort(
			(left, right) => left.startTime - right.startTime
		);
		const first = elements[0];
		const second = elements[1];
		if (!track || !first || !second) {
			throw new Error("Expected adjacent precision-edit clips");
		}
		const firstDuration =
			(first.duration - first.trimStart - first.trimEnd) /
			(first.playbackRate ?? 1);
		const secondDuration =
			(second.duration - second.trimStart - second.trimEnd) /
			(second.playbackRate ?? 1);
		return {
			first,
			second,
			historyLength: timeline.history.length,
			seam: first.startTime + firstDuration,
			sequenceEnd: second.startTime + secondDuration,
			transitionId: track.transitions?.[0]?.id ?? null,
		};
	});
}

async function waitForPreviewFrame({ page }: { page: Page }) {
	const videos = page.getByTestId("preview-panel").locator("video");
	await expect.poll(() => videos.count()).toBeGreaterThanOrEqual(1);
	await expect
		.poll(() =>
			videos.first().evaluate((video: HTMLVideoElement) => {
				return (
					video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
					video.videoWidth > 0 &&
					video.videoHeight > 0
				);
			})
		)
		.toBe(true);
	await page.waitForTimeout(400);
}

test.describe("Timeline precision editing", () => {
	test.setTimeout(180_000);

	test("slips source media and rolls a transitioned cut without changing outer duration", async ({
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

		await createTestProject(page, "Timeline Precision Edit");
		if (externalVideoPath && existsSync(externalVideoPath)) {
			await uploadTestMedia(page, externalVideoPath);
		} else {
			await importTestVideo(page);
		}
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as PrecisionHarnessWindow
						).__mediaStore.getState().mediaItems[0]?.duration ?? 0
				)
			)
			.toBeGreaterThanOrEqual(4.5);

		const transitionId = await page.evaluate(() => {
			const harness = window as unknown as PrecisionHarnessWindow;
			const media = harness.__mediaStore.getState().mediaItems[0];
			const timeline = harness.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			const sourceDuration = media?.duration ?? 0;
			if (!media || !track || sourceDuration < 4.5) {
				throw new Error(
					"Precision edit requires a video of at least 4.5 seconds"
				);
			}
			const firstId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: `${media.name} first`,
				duration: sourceDuration,
				startTime: 0,
				trimStart: 0.5,
				trimEnd: sourceDuration - 2.5,
			});
			const secondId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: `${media.name} second`,
				duration: sourceDuration,
				startTime: 2,
				trimStart: 2,
				trimEnd: sourceDuration - 4,
			});
			if (!firstId || !secondId) throw new Error("Failed to create edit clips");
			const id = timeline.addTransition({
				trackId: track.id,
				fromElementId: firstId,
				toElementId: secondId,
				videoMediaIds: new Set([media.id]),
				presetId: "dissolve",
				type: "dissolve",
				duration: 0.5,
				easing: "easeInOut",
			});
			if (!id) throw new Error("Failed to create edit transition");
			timeline.setSelectedElements([{ trackId: track.id, elementId: firstId }]);
			harness.__playbackStore.getState().seek(0.75);
			return id;
		});

		const clips = page.getByTestId("timeline-element");
		await expect(clips).toHaveCount(2);
		await waitForPreviewFrame({ page });

		const beforeSlip = await readTiming({ page });
		await page.getByTestId("timeline-edit-mode-slip").click();
		const firstClip = clips.first();
		await expect(firstClip).toHaveAttribute("data-edit-mode", "slip");
		const slipBounds = await firstClip.boundingBox();
		if (!slipBounds) throw new Error("Expected slip-edit clip bounds");
		await page.mouse.move(
			slipBounds.x + slipBounds.width / 2,
			slipBounds.y + slipBounds.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			slipBounds.x + slipBounds.width / 2 + 30,
			slipBounds.y + slipBounds.height / 2,
			{ steps: 4 }
		);
		await page.mouse.up();

		const afterSlip = await readTiming({ page });
		expect(afterSlip.first.startTime).toBeCloseTo(beforeSlip.first.startTime);
		expect(effectiveDuration({ element: afterSlip.first })).toBeCloseTo(
			effectiveDuration({ element: beforeSlip.first })
		);
		expect(afterSlip.first.trimStart).toBeGreaterThan(
			beforeSlip.first.trimStart
		);
		expect(afterSlip.first.trimEnd).toBeLessThan(beforeSlip.first.trimEnd);
		expect(afterSlip.historyLength).toBe(beforeSlip.historyLength + 1);
		expect(afterSlip.transitionId).toBe(transitionId);
		await waitForPreviewFrame({ page });
		await page.screenshot({
			path: path.join(outputDirectory, "01-slip-edit.png"),
			animations: "disabled",
		});

		await page.getByTestId("timeline-edit-mode-roll").click();
		await expect(firstClip).toHaveAttribute("data-edit-mode", "roll");
		const rollHandle = firstClip.getByTestId("trim-end-handle");
		await expect(rollHandle).toBeVisible();
		await waitForPreviewFrame({ page });
		await page.screenshot({
			path: path.join(outputDirectory, "02-roll-edit.png"),
			animations: "disabled",
		});
		const beforeRoll = await readTiming({ page });
		const rollBounds = await rollHandle.boundingBox();
		if (!rollBounds) throw new Error("Expected roll-edit handle bounds");
		await page.mouse.move(
			rollBounds.x + rollBounds.width / 2,
			rollBounds.y + rollBounds.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			rollBounds.x + rollBounds.width / 2 + 24,
			rollBounds.y + rollBounds.height / 2,
			{ steps: 4 }
		);
		await page.mouse.up();

		const afterRoll = await readTiming({ page });
		expect(afterRoll.seam).toBeGreaterThan(beforeRoll.seam);
		expect(afterRoll.second.startTime).toBeCloseTo(afterRoll.seam);
		expect(afterRoll.sequenceEnd).toBeCloseTo(beforeRoll.sequenceEnd);
		expect(afterRoll.historyLength).toBe(beforeRoll.historyLength + 1);
		expect(afterRoll.transitionId).toBe(transitionId);
		await expect(
			page.getByTestId(`timeline-transition-${transitionId}`)
		).toBeVisible();
	});
});
