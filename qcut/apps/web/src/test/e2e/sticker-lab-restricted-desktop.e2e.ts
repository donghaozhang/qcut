import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type TestInfo,
} from "@playwright/test";
import type { ElectronApplication, Locator, Page } from "playwright";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import {
	createTestProject,
	ensureStickersTabActive,
	navigateToProjects,
} from "./helpers/electron-helpers";
import { stubExportSaveDialog } from "./helpers/e2e-export-helpers";
import {
	createOriginalStickerLabFixture,
	type OriginalStickerLabFixture,
	type StickerLabRuntimeFixtureCase,
} from "./helpers/sticker-lab-desktop-fixture";

const RESTRICTED_EXPORT_CODE = "QCUT_RESTRICTED_MEDIA_EXPORT";
const SPLIT_TIME_SECONDS = 2.75;
const SPLIT_LEFT_SAMPLE_SECONDS = SPLIT_TIME_SECONDS - 0.01;
const SPLIT_RIGHT_SAMPLE_SECONDS = SPLIT_TIME_SECONDS + 0.01;

interface HarnessMediaItem {
	id: string;
	metadata?: Record<string, unknown>;
	name: string;
	type: string;
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

interface PersistedMediaState {
	id: string;
	metadata: Record<string, unknown>;
	name: string;
	type: string;
}

interface RestrictedState {
	media: PersistedMediaState[];
	projectId: string | null;
	runtimeResources: PersistedMediaState[];
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
	try {
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
		await page.evaluate(() =>
			localStorage.setItem("hasSeenOnboarding", "true")
		);
		await navigateToProjects(page);
		return { electronApp, page };
	} catch (error) {
		if (electronApp.process().exitCode === null) {
			await forceTerminateElectronApp({ electronApp }).catch(() => undefined);
		}
		throw error;
	}
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
		const persistedMedia = harness.__mediaStore
			.getState()
			.mediaItems.map((item) => ({
				id: item.id,
				metadata: item.metadata ?? {},
				name: item.name,
				type: item.type,
			}));
		const media = persistedMedia
			.filter((item) => item.metadata.source === "sticker-lab")
			.sort((left, right) => left.id.localeCompare(right.id));
		const runtimeResources = persistedMedia
			.filter((item) => item.metadata.source === "sticker-runtime-resource")
			.sort((left, right) =>
				String(left.metadata.stickerRuntimeResourceName).localeCompare(
					String(right.metadata.stickerRuntimeResourceName)
				)
			);
		const stickers = harness.__timelineStore
			.getState()
			.tracks.filter((track) => track.type === "sticker")
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "sticker")
			.sort((left, right) => left.startTime - right.startTime);
		return {
			media,
			projectId: harness.__projectStore.getState().activeProject?.id ?? null,
			runtimeResources,
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
	x = 4,
	y = 4,
}: {
	canvas: Locator;
	x?: number;
	y?: number;
}): Promise<number[]> {
	return canvas.evaluate(
		(element, sample) => {
			if (!(element instanceof HTMLCanvasElement)) {
				throw new Error("Sticker runtime output is not a canvas");
			}
			const context = element.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Sticker runtime canvas is unavailable");
			return Array.from(context.getImageData(sample.x, sample.y, 1, 1).data);
		},
		{ x, y }
	);
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

function isExpectedColor({
	color,
	pixel,
}: {
	color: "blue" | "red";
	pixel: number[];
}): boolean {
	const [red = 0, green = 0, blue = 0, alpha = 0] = pixel;
	if (alpha < 220) return false;
	if (color === "red") {
		return red > 150 && red > green * 1.45 && red > blue * 1.45;
	}
	return blue > 130 && blue > red * 1.45 && blue > green * 1.2;
}

async function expectRuntimeColor({
	canvas,
	color,
}: {
	canvas: Locator;
	color: "blue" | "red";
}): Promise<void> {
	await expect(canvas).toBeVisible();
	await expect
		.poll(async () =>
			isExpectedColor({
				color,
				pixel: await readRuntimeCanvasPixel({ canvas }),
			})
		)
		.toBe(true);
	expect(await canvas.getAttribute("data-sticker-runtime-error")).toBeNull();
}

async function expectAlphaVideoMask({
	canvas,
}: {
	canvas: Locator;
}): Promise<void> {
	await expect(canvas).toBeVisible();
	await expect
		.poll(async () => {
			const topPixel = await readRuntimeCanvasPixel({ canvas, x: 4, y: 4 });
			const bottomPixel = await readRuntimeCanvasPixel({ canvas, x: 4, y: 60 });
			return {
				bottomTransparent: (bottomPixel[3] ?? 255) < 35,
				topOpaque: (topPixel[3] ?? 0) > 220,
			};
		})
		.toEqual({ bottomTransparent: true, topOpaque: true });
}

async function expectRuntimeMaskIfNeeded({
	canvas,
	runtimeCase,
}: {
	canvas: Locator;
	runtimeCase: StickerLabRuntimeFixtureCase;
}): Promise<void> {
	if (runtimeCase.kind !== "alpha-video") return;
	await expectAlphaVideoMask({ canvas });
}

function normalizedRuntimeDescriptor({
	runtimeCase,
}: {
	runtimeCase: StickerLabRuntimeFixtureCase;
}): StickerRuntimeDescriptor {
	const descriptor = runtimeCase.runtimeDescriptor;
	const persistedSource = ({
		resourceName,
	}: {
		resourceName: string;
	}): string => {
		const index = runtimeCase.resourceNames.indexOf(resourceName);
		if (index < 0) throw new Error(`Unknown fixture resource: ${resourceName}`);
		return `$resource:asset_${String(index + 1).padStart(4, "0")}`;
	};
	switch (descriptor.kind) {
		case "direct-gif":
			return descriptor;
		case "atlas-animation":
			return {
				...descriptor,
				atlasSource: descriptor.atlasSource
					? persistedSource({ resourceName: descriptor.atlasSource })
					: descriptor.atlasSource,
			};
		case "png-sequence":
			return {
				...descriptor,
				frames: descriptor.frames.map((frame) => ({
					...frame,
					source: persistedSource({ resourceName: frame.source }),
				})),
			};
		case "alpha-video":
			return {
				...descriptor,
				source: persistedSource({ resourceName: descriptor.source }),
				layout:
					descriptor.layout.kind === "separate-mask"
						? {
								...descriptor.layout,
								maskSource: persistedSource({
									resourceName: descriptor.layout.maskSource,
								}),
							}
						: descriptor.layout,
			};
		default: {
			const unsupported: never = descriptor;
			throw new Error(
				`Unsupported Sticker Lab fixture: ${String(unsupported)}`
			);
		}
	}
}

function expectedFrameLabel({
	kind,
	timeSeconds,
}: {
	kind: StickerLabRuntimeFixtureCase["kind"];
	timeSeconds: number;
}): string {
	if (kind === "alpha-video") return timeSeconds.toFixed(6);
	if (kind === "direct-gif") return timeSeconds < 0.2 ? "0" : "1";
	return timeSeconds < 0.5 ? "0" : "1";
}

async function expectRuntimeFrameAt({
	canvas,
	color,
	frameTimeSeconds,
	page,
	runtimeCase,
	timelineTimeSeconds,
}: {
	canvas: Locator;
	color: "blue" | "red";
	frameTimeSeconds: number;
	page: Page;
	runtimeCase: StickerLabRuntimeFixtureCase;
	timelineTimeSeconds: number;
}): Promise<void> {
	await seekTimeline({ page, time: timelineTimeSeconds });
	await expect(canvas).toBeVisible();
	await expect(canvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		expectedFrameLabel({
			kind: runtimeCase.kind,
			timeSeconds: frameTimeSeconds,
		})
	);
	await expectRuntimeColor({ canvas, color });
	await expectRuntimeMaskIfNeeded({ canvas, runtimeCase });
}

function assertRuntimeResources({
	batchId,
	runtimeCase,
	state,
}: {
	batchId: string;
	runtimeCase: StickerLabRuntimeFixtureCase;
	state: RestrictedState;
}): void {
	expect(state.runtimeResources).toHaveLength(runtimeCase.resourceNames.length);
	const primaryMetadata = state.media[0]?.metadata;
	const resourceMediaIds = primaryMetadata?.stickerRuntimeResources;
	if (
		typeof resourceMediaIds !== "object" ||
		resourceMediaIds === null ||
		Array.isArray(resourceMediaIds)
	) {
		if (runtimeCase.resourceNames.length === 0) return;
		throw new Error("Sticker runtime resource map is missing");
	}
	// asset_XXXX order is shared by descriptor normalization and persistence.
	for (const [index, resourceName] of runtimeCase.resourceNames.entries()) {
		const persistedName = `asset_${String(index + 1).padStart(4, "0")}`;
		const resource = state.runtimeResources[index];
		expect(resource?.metadata).toMatchObject({
			batchId,
			itemId: runtimeCase.stickerId,
			redistribution: "prohibited",
			referenceOnly: true,
			source: "sticker-runtime-resource",
			stickerRuntimeResourceName: persistedName,
			stickerRuntimeSourceUrl: resourceName,
			usage: "internal-reference-only",
		});
		expect(resource?.id).toBe(
			(resourceMediaIds as Record<string, unknown>)[persistedName]
		);
	}
}

async function selectStickerLabCard({
	page,
	runtimeCase,
}: {
	page: Page;
	runtimeCase: StickerLabRuntimeFixtureCase;
}): Promise<void> {
	const labEntry = page.getByTestId("sticker-reference-lab-entry");
	await expect(labEntry).toBeVisible();
	await labEntry.getByRole("button", { name: "贴纸实验室" }).click();
	const category = page.getByTestId(
		`sticker-lab-category-private-${runtimeCase.categoryId}`
	);
	await expect(category).toBeVisible();
	await category.click();
	await expect(page.getByTestId("sticker-lab-reference-policy")).toContainText(
		"禁止二次分发"
	);

	const referenceItem = page.locator(
		`[data-sticker-reference-id="${runtimeCase.stickerId}"]`
	);
	await expect(referenceItem).toBeEnabled({ timeout: 30_000 });
	await expect(referenceItem).toHaveAccessibleName(
		`添加${runtimeCase.displayName}到时间线`
	);
	const previewImage = referenceItem.getByRole("img", {
		name: runtimeCase.displayName,
		exact: true,
	});
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
		height: runtimeCase.previewHeight,
		width: runtimeCase.previewWidth,
	});
	expect(await previewImage.getAttribute("src")).toMatch(/^blob:/);
	await referenceItem.click();
}

async function runRestrictedStickerLifecycle({
	fixture,
	runtimeCase,
	testInfo,
}: {
	fixture: OriginalStickerLabFixture;
	runtimeCase: StickerLabRuntimeFixtureCase;
	testInfo: TestInfo;
}): Promise<void> {
	const testSlug = runtimeCase.kind.replaceAll("-", "_");
	const profileDirectory = path.join(
		fixture.cleanupRoot,
		`profile-${testSlug}`
	);
	const refusedOutputPath = path.join(
		fixture.cleanupRoot,
		`${testSlug}-restricted-export-must-not-exist.mp4`
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
		await createTestProject(
			firstPage,
			`Restricted Sticker Lab ${runtimeCase.kind} E2E`
		);
		await ensureStickersTabActive(firstPage);
		await selectStickerLabCard({ page: firstPage, runtimeCase });
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: firstPage });
				return {
					mediaCount: state.media.length,
					resourceCount: state.runtimeResources.length,
					stickerCount: state.stickers.length,
				};
			})
			.toEqual({
				mediaCount: 1,
				resourceCount: runtimeCase.resourceNames.length,
				stickerCount: 1,
			});

		let state = await readRestrictedState({ page: firstPage });
		expect(state.media[0]?.name).toBe(runtimeCase.primaryFileName);
		expect(state.media[0]?.metadata).toMatchObject({
			animatedSticker: true,
			batchId: fixture.batchId,
			itemId: runtimeCase.stickerId,
			redistribution: "prohibited",
			referenceOnly: true,
			source: "sticker-lab",
			stickerRuntime: { kind: runtimeCase.kind, cycleDurationSeconds: 1 },
			usage: "internal-reference-only",
		});
		if (runtimeCase.kind === "direct-gif") {
			expect(state.media[0]?.metadata.stickerRuntime).toMatchObject({
				kind: "direct-gif",
				cycleDurationSeconds: 1,
				frames: [
					{ startSeconds: 0, durationSeconds: 0.2 },
					{ startSeconds: 0.2, durationSeconds: 0.8 },
				],
			});
		} else {
			expect(state.media[0]?.metadata.stickerRuntime).toEqual(
				normalizedRuntimeDescriptor({ runtimeCase })
			);
		}
		assertRuntimeResources({
			batchId: fixture.batchId,
			runtimeCase,
			state,
		});
		expect(state.stickers[0]?.mediaId).toBe(state.media[0]?.id);
		const originalStickerDuration = state.stickers[0]?.duration;
		if (
			originalStickerDuration === undefined ||
			originalStickerDuration <= SPLIT_TIME_SECONDS
		) {
			throw new Error("Sticker is too short for the split continuity check");
		}

		const timelineSticker = firstPage.locator(
			'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
		);
		await expect(timelineSticker).toHaveCount(1);
		const runtimeCanvas = firstPage.locator(
			`canvas[data-sticker-runtime-kind="${runtimeCase.kind}"]:visible`
		);
		const redSampleTime = runtimeCase.kind === "direct-gif" ? 0.1 : 0.25;
		const blueSampleTime = 0.75;
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "red",
			frameTimeSeconds: redSampleTime,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: redSampleTime,
		});
		if (runtimeCase.kind === "direct-gif") {
			await expectRuntimeFrameAt({
				canvas: runtimeCanvas,
				color: "red",
				frameTimeSeconds: 0.19,
				page: firstPage,
				runtimeCase,
				timelineTimeSeconds: 0.19,
			});
			await expectRuntimeFrameAt({
				canvas: runtimeCanvas,
				color: "blue",
				frameTimeSeconds: 0.21,
				page: firstPage,
				runtimeCase,
				timelineTimeSeconds: 0.21,
			});
		}
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "blue",
			frameTimeSeconds: blueSampleTime,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: blueSampleTime,
		});
		await firstPage.screenshot({
			animations: "allow",
			path: testInfo.outputPath(`01-${testSlug}-runtime-blue.png`),
		});

		await seekTimeline({ page: firstPage, time: SPLIT_TIME_SECONDS });
		await timelineSticker.first().click({ position: { x: 24, y: 12 } });
		await expect(firstPage.getByTestId("split-clip-button")).toBeEnabled();
		await firstPage.getByTestId("split-clip-button").click();
		await expect(timelineSticker).toHaveCount(2);
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "blue",
			frameTimeSeconds: SPLIT_LEFT_SAMPLE_SECONDS % 1,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: SPLIT_LEFT_SAMPLE_SECONDS,
		});
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "blue",
			frameTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS % 1,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS,
		});
		state = await readRestrictedState({ page: firstPage });
		expect(state.stickers.map(({ startTime }) => startTime)).toEqual([
			0,
			SPLIT_TIME_SECONDS,
		]);
		expect(
			state.stickers.map(({ trimStart, trimEnd }) => [trimStart, trimEnd])
		).toEqual([
			[0, originalStickerDuration - SPLIT_TIME_SECONDS],
			[SPLIT_TIME_SECONDS, 0],
		]);
		const [leftSticker, rightSticker] = state.stickers;
		expect(
			(leftSticker?.duration ?? 0) -
				(leftSticker?.trimStart ?? 0) -
				(leftSticker?.trimEnd ?? 0)
		).toBeCloseTo(SPLIT_TIME_SECONDS, 6);
		expect(
			(rightSticker?.duration ?? 0) -
				(rightSticker?.trimStart ?? 0) -
				(rightSticker?.trimEnd ?? 0)
		).toBeCloseTo(originalStickerDuration - SPLIT_TIME_SECONDS, 6);
		expect(new Set(state.stickers.map(({ stickerId }) => stickerId)).size).toBe(
			2
		);
		await firstPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(`02-${testSlug}-split-timeline.png`),
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
		if (!state.projectId) throw new Error("Sticker Lab project ID is missing");
		await reopenedPage.evaluate((projectId) => {
			window.location.hash = `#/editor/${projectId}`;
		}, state.projectId);
		await expect(
			reopenedPage.locator('[data-testid="timeline-track"]')
		).toBeVisible();
		const reopenedRuntimeCanvas = reopenedPage.locator(
			`canvas[data-sticker-runtime-kind="${runtimeCase.kind}"]:visible`
		);
		await expectRuntimeFrameAt({
			canvas: reopenedRuntimeCanvas,
			color: "blue",
			frameTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS % 1,
			page: reopenedPage,
			runtimeCase,
			timelineTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS,
		});
		const reopenedState = await readRestrictedState({ page: reopenedPage });
		expect(reopenedState.media).toEqual(state.media);
		expect(reopenedState.runtimeResources).toEqual(state.runtimeResources);
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
		assertRuntimeResources({
			batchId: fixture.batchId,
			runtimeCase,
			state: reopenedState,
		});

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
			path: testInfo.outputPath(`03-${testSlug}-export-refused.png`),
		});
	} finally {
		if (activeApp) await forceTerminateElectronApp({ electronApp: activeApp });
	}
}

test.describe("Sticker Lab restricted desktop lifecycle", () => {
	let fixture: OriginalStickerLabFixture;

	test.beforeAll(async () => {
		fixture = await createOriginalStickerLabFixture();
	});

	test.afterAll(async () => {
		if (fixture) {
			await rm(fixture.cleanupRoot, { recursive: true, force: true });
		}
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Direct GIF previews, adds, splits, reopens, and refuses export", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.directGif,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Atlas previews, adds, splits, reopens, and refuses export", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.atlas,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("PNG sequence previews, adds, splits, reopens, and refuses export", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.pngSequence,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Alpha Video previews, adds, splits, reopens, and refuses export", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.alphaVideo,
			testInfo,
		});
	});
});
