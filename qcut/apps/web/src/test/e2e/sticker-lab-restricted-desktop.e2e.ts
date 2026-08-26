import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Locator, Page } from "playwright";
import {
	createTestProject,
	ensureStickersTabActive,
	navigateToProjects,
} from "./helpers/electron-helpers";
import { stubExportSaveDialog } from "./helpers/e2e-export-helpers";
import { createOriginalGifLabFixture } from "./helpers/sticker-lab-desktop-fixture";

const PROJECT_NAME = "Restricted Sticker Lab Desktop E2E";
const RESTRICTED_EXPORT_CODE = "QCUT_RESTRICTED_MEDIA_EXPORT";

interface HarnessMediaItem {
	id: string;
	metadata?: Record<string, unknown>;
	name: string;
}

interface HarnessTimelineElement {
	duration: number;
	id: string;
	mediaId?: string;
	startTime: number;
	stickerId?: string;
	trimEnd: number;
	trimStart: number;
	type: string;
}

interface HarnessTimelineTrack {
	elements: HarnessTimelineElement[];
	id: string;
	type: string;
}

interface StickerLabHarnessWindow extends Window {
	__exportStore: {
		getState: () => { error: string | null };
	};
	__mediaStore: {
		getState: () => { mediaItems: HarnessMediaItem[] };
	};
	__playbackStore: {
		getState: () => { currentTime: number; seek: (time: number) => void };
	};
	__projectStore: {
		getState: () => {
			activeProject: { id: string; name: string } | null;
			saveCurrentProject: () => Promise<void>;
		};
	};
	__timelineStore: {
		getState: () => { tracks: HarnessTimelineTrack[] };
	};
}

interface RestrictedState {
	media: Array<{
		id: string;
		metadata: Record<string, unknown>;
		name: string;
	}>;
	projectId: string | null;
	stickers: HarnessTimelineElement[];
}

async function launchIsolatedQCut({
	profileDirectory,
	videosDirectory,
}: {
	profileDirectory: string;
	videosDirectory: string;
}): Promise<{ electronApp: ElectronApplication; page: Page }> {
	const electronApp = await electron.launch({
		args: [`--user-data-dir=${profileDirectory}`, "dist/electron/main.js"],
		cwd: process.cwd(),
		env: {
			...process.env,
			ELECTRON_DISABLE_GPU: "1",
			NODE_ENV: "test",
		},
	});
	await electronApp.evaluate(({ app }, testVideosDirectory) => {
		app.setPath("videos", testVideosDirectory);
	}, videosDirectory);
	const page = await electronApp.firstWindow();
	await page.waitForLoadState("domcontentloaded");
	await page.waitForFunction(
		() => Boolean(document.querySelector("#root")?.children.length),
		undefined,
		{ timeout: 30_000 }
	);
	await page.evaluate(() => localStorage.setItem("hasSeenOnboarding", "true"));
	await navigateToProjects(page);
	return { electronApp, page };
}

async function forceTerminateElectronApp({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<void> {
	const closed = electronApp.waitForEvent("close", { timeout: 10_000 });
	// QCut's macOS utility processes can keep app.quit pending during E2E teardown.
	electronApp.process().kill("SIGKILL");
	await closed;
}

async function readRestrictedState({
	page,
}: {
	page: Page;
}): Promise<RestrictedState> {
	return page.evaluate(() => {
		const harness = window as StickerLabHarnessWindow;
		const media = harness.__mediaStore
			.getState()
			.mediaItems.filter((item) => item.metadata?.source === "sticker-lab")
			.map((item) => ({
				id: item.id,
				metadata: item.metadata ?? {},
				name: item.name,
			}));
		const stickers = harness.__timelineStore
			.getState()
			.tracks.filter((track) => track.type === "sticker")
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "sticker")
			.sort((left, right) => left.startTime - right.startTime);
		return {
			media,
			projectId: harness.__projectStore.getState().activeProject?.id ?? null,
			stickers,
		};
	});
}

async function saveCurrentProject({ page }: { page: Page }): Promise<void> {
	await page.evaluate(async () => {
		await (window as StickerLabHarnessWindow).__projectStore
			.getState()
			.saveCurrentProject();
	});
}

async function readRuntimeCanvasPixel({
	canvas,
}: {
	canvas: Locator;
}): Promise<number[]> {
	return canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error("Sticker runtime output is not a canvas");
		}
		const context = element.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Sticker runtime canvas is unavailable");
		return Array.from(context.getImageData(4, 4, 1, 1).data);
	});
}

async function seekTimeline({
	page,
	time,
}: {
	page: Page;
	time: number;
}): Promise<void> {
	await page.evaluate((nextTime) => {
		(window as StickerLabHarnessWindow).__playbackStore
			.getState()
			.seek(nextTime);
	}, time);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as StickerLabHarnessWindow).__playbackStore.getState()
						.currentTime
			)
		)
		.toBeCloseTo(time, 3);
}

test.describe("Sticker Lab restricted desktop lifecycle", () => {
	// biome-ignore lint/correctness/noEmptyPattern: the test launches its own isolated Electron process.
	test("previews, adds, splits, reopens, and refuses export", async ({}, testInfo) => {
		test.setTimeout(240_000);
		const fixture = await createOriginalGifLabFixture();
		const profileDirectory = path.join(fixture.cleanupRoot, "profile");
		const refusedOutputPath = path.join(
			fixture.cleanupRoot,
			"restricted-export-must-not-exist.mp4"
		);
		await mkdir(profileDirectory, { recursive: true });
		let activeApp: ElectronApplication | null = null;

		try {
			const firstRun = await launchIsolatedQCut({
				profileDirectory,
				videosDirectory: fixture.videosDirectory,
			});
			activeApp = firstRun.electronApp;
			const firstPage = firstRun.page;
			await createTestProject(firstPage, PROJECT_NAME);
			await ensureStickersTabActive(firstPage);

			const labEntry = firstPage.getByTestId("sticker-reference-lab-entry");
			await expect(labEntry).toBeVisible();
			await labEntry.getByRole("button", { name: "贴纸实验室" }).click();
			const fixtureCategory = firstPage.getByTestId(
				`sticker-lab-category-private-${fixture.categoryId}`
			);
			await expect(fixtureCategory).toBeVisible();
			await fixtureCategory.click();
			await expect(
				firstPage.getByTestId("sticker-lab-reference-policy")
			).toContainText("禁止二次分发");

			const referenceItem = firstPage
				.getByTestId("local-sticker-reference-item")
				.first();
			await expect(referenceItem).toBeEnabled({ timeout: 30_000 });
			const previewImage = referenceItem.locator("img");
			await expect(previewImage).toBeVisible();
			expect(
				await previewImage.evaluate((image) => ({
					complete: (image as HTMLImageElement).complete,
					height: (image as HTMLImageElement).naturalHeight,
					source: (image as HTMLImageElement).currentSrc,
					width: (image as HTMLImageElement).naturalWidth,
				}))
			).toMatchObject({
				complete: true,
				height: 64,
				width: 64,
			});
			expect(await previewImage.getAttribute("src")).toMatch(/^blob:/);
			await firstPage.screenshot({
				animations: "allow",
				path: testInfo.outputPath("01-gif-preview.png"),
			});

			await referenceItem.click();
			await expect
				.poll(async () => {
					const nextState = await readRestrictedState({ page: firstPage });
					return {
						mediaCount: nextState.media.length,
						stickerCount: nextState.stickers.length,
					};
				})
				.toEqual({ mediaCount: 1, stickerCount: 1 });
			let state = await readRestrictedState({ page: firstPage });
			expect(state.media[0]?.metadata).toMatchObject({
				animatedSticker: true,
				batchId: fixture.batchId,
				checksumSha256: fixture.checksumSha256,
				itemId: fixture.stickerId,
				redistribution: "prohibited",
				referenceOnly: true,
				source: "sticker-lab",
				stickerRuntime: {
					cycleDurationSeconds: 1,
					frames: [
						{ delayCentiseconds: 20, durationSeconds: 0.2 },
						{ delayCentiseconds: 80, durationSeconds: 0.8 },
					],
					kind: "direct-gif",
				},
				usage: "internal-reference-only",
			});
			expect(state.stickers).toHaveLength(1);
			expect(state.stickers[0]?.mediaId).toBe(state.media[0]?.id);
			await expect(
				firstPage.locator(
					'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
				)
			).toHaveCount(1);
			const runtimeCanvas = firstPage.locator(
				'canvas[data-sticker-runtime-kind="direct-gif"]'
			);
			await seekTimeline({ page: firstPage, time: 0.1 });
			await expect(runtimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				"0"
			);
			const [redFrameRed, redFrameGreen, redFrameBlue, redFrameAlpha] =
				await readRuntimeCanvasPixel({ canvas: runtimeCanvas });
			expect(redFrameRed).toBeGreaterThan(180);
			expect(redFrameGreen).toBeLessThan(130);
			expect(redFrameBlue).toBeLessThan(130);
			expect(redFrameAlpha).toBe(255);
			await seekTimeline({ page: firstPage, time: 0.2 });
			await expect(runtimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				"1"
			);
			const [blueFrameRed, blueFrameGreen, blueFrameBlue, blueFrameAlpha] =
				await readRuntimeCanvasPixel({ canvas: runtimeCanvas });
			expect(blueFrameRed).toBeLessThan(120);
			expect(blueFrameGreen).toBeLessThan(160);
			expect(blueFrameBlue).toBeGreaterThan(150);
			expect(blueFrameAlpha).toBe(255);

			const splitTime = 2.5;
			await seekTimeline({ page: firstPage, time: splitTime });
			const timelineSticker = firstPage.locator(
				'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
			);
			await timelineSticker.first().click({ position: { x: 24, y: 12 } });
			await expect(firstPage.getByTestId("split-clip-button")).toBeEnabled();
			await firstPage.getByTestId("split-clip-button").click();
			await expect(timelineSticker).toHaveCount(2);
			await expect(runtimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				"1"
			);
			state = await readRestrictedState({ page: firstPage });
			expect(state.stickers.map(({ startTime }) => startTime)).toEqual([
				0,
				splitTime,
			]);
			expect(
				state.stickers.map(({ trimStart, trimEnd }) => [trimStart, trimEnd])
			).toEqual([
				[0, splitTime],
				[splitTime, 0],
			]);
			expect(
				new Set(state.stickers.map(({ stickerId }) => stickerId)).size
			).toBe(2);
			await firstPage.screenshot({
				animations: "disabled",
				path: testInfo.outputPath("02-split-timeline.png"),
			});

			await saveCurrentProject({ page: firstPage });
			await forceTerminateElectronApp({ electronApp: activeApp });
			activeApp = null;

			const reopened = await launchIsolatedQCut({
				profileDirectory,
				videosDirectory: fixture.videosDirectory,
			});
			activeApp = reopened.electronApp;
			const reopenedPage = reopened.page;
			if (!state.projectId)
				throw new Error("Sticker Lab project ID is missing");
			await reopenedPage.evaluate((projectId) => {
				window.location.hash = `#/editor/${projectId}`;
			}, state.projectId);
			await expect(
				reopenedPage.locator('[data-testid="timeline-track"]')
			).toBeVisible();
			await seekTimeline({ page: reopenedPage, time: splitTime });
			const reopenedRuntimeCanvas = reopenedPage.locator(
				'canvas[data-sticker-runtime-kind="direct-gif"]'
			);
			await expect(reopenedRuntimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				"1"
			);
			await expect
				.poll(async () => {
					const [red, green, blue, alpha] = await readRuntimeCanvasPixel({
						canvas: reopenedRuntimeCanvas,
					});
					return red < 120 && green < 160 && blue > 150 && alpha === 255;
				})
				.toBe(true);
			await expect
				.poll(
					async () => (await readRestrictedState({ page: reopenedPage })).media
				)
				.toHaveLength(1);
			const reopenedState = await readRestrictedState({ page: reopenedPage });
			expect(reopenedState.media[0]?.metadata).toEqual(
				state.media[0]?.metadata
			);
			expect(reopenedState.stickers).toHaveLength(2);
			expect(
				reopenedState.stickers.map(({ startTime, trimEnd, trimStart }) => ({
					startTime,
					trimEnd,
					trimStart,
				}))
			).toEqual(
				state.stickers.map(({ startTime, trimEnd, trimStart }) => ({
					startTime,
					trimEnd,
					trimStart,
				}))
			);

			await stubExportSaveDialog({
				electronApp: activeApp,
				outputPath: refusedOutputPath,
			});
			await reopenedPage.getByTestId("export-button").click();
			await expect(reopenedPage.getByTestId("export-dialog")).toBeVisible();
			const startExportButton = reopenedPage.getByTestId("export-start-button");
			await expect(startExportButton).toBeEnabled();
			await startExportButton.click();
			await expect
				.poll(() =>
					reopenedPage.evaluate(
						() =>
							(window as StickerLabHarnessWindow).__exportStore.getState().error
					)
				)
				.toContain(RESTRICTED_EXPORT_CODE);
			const exportRefusal = reopenedPage
				.getByTestId("export-dialog")
				.getByText(RESTRICTED_EXPORT_CODE, { exact: false });
			await expect(exportRefusal).toBeVisible();
			await exportRefusal.scrollIntoViewIfNeeded();
			expect(existsSync(refusedOutputPath)).toBe(false);
			await reopenedPage.screenshot({
				animations: "disabled",
				path: testInfo.outputPath("03-export-refused-after-reopen.png"),
			});
		} finally {
			if (activeApp)
				await forceTerminateElectronApp({ electronApp: activeApp });
			await rm(fixture.cleanupRoot, { recursive: true, force: true });
		}
	});
});
