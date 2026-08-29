import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, type TestInfo } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { createTestProject, ensureStickersTabActive } from "./electron-helpers";
import { exportAndVerifyLocalStickerVideo } from "./exported-sticker-video-evidence";
import type {
	OriginalStickerLabFixture,
	StickerLabRuntimeFixtureCase,
} from "./sticker-lab-desktop-fixture";
import {
	buildVideoEvidenceArtifacts,
	forceTerminateElectronApp,
	launchIsolatedQCut,
	readRestrictedState,
	saveCurrentProject,
	seekTimeline,
	SPLIT_LEFT_SAMPLE_SECONDS,
	SPLIT_RIGHT_SAMPLE_SECONDS,
	SPLIT_TIME_SECONDS,
	type StickerLabHarnessWindow,
	withoutTransientFileMime,
} from "./sticker-lab-lifecycle-harness";
import {
	assertRuntimeResources,
	expectContinuousRuntimePlayback,
	expectRuntimeFrameAt,
	normalizedRuntimeDescriptor,
	selectStickerLabCard,
} from "./sticker-lab-runtime-assertions";

export async function runRestrictedStickerLifecycle({
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
	const outputPath = path.join(
		fixture.cleanupRoot,
		`${testSlug}-local-sticker-export.mp4`
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
		await expectContinuousRuntimePlayback({
			canvas: runtimeCanvas,
			page: firstPage,
			runtimeCase,
		});
		await firstPage.screenshot({
			animations: "allow",
			path: testInfo.outputPath(`00-${testSlug}-continuous-playback-blue.png`),
		});
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
		expect(withoutTransientFileMime({ media: reopenedState.media })).toEqual(
			withoutTransientFileMime({ media: state.media })
		);
		expect(
			withoutTransientFileMime({ media: reopenedState.runtimeResources })
		).toEqual(withoutTransientFileMime({ media: state.runtimeResources }));
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

		const videoEvidence = await exportAndVerifyLocalStickerVideo({
			artifacts: buildVideoEvidenceArtifacts({
				prefix: `${testSlug}-export`,
				reportContext: {
					reopenedStickerCount: reopenedState.stickers.length,
					runtimeKind: runtimeCase.kind,
					scenario: "synthetic-runtime",
					splitTimeSeconds: SPLIT_TIME_SECONDS,
				},
				testInfo,
			}),
			electronApp: activeApp,
			filePath: outputPath,
			page: reopenedPage,
		});
		expect(videoEvidence.sizeBytes).toBeGreaterThan(1_000);
		expect(
			await reopenedPage.evaluate(
				() => (window as StickerLabHarnessWindow).__exportStore.getState().error
			)
		).toBeNull();
		await reopenedPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(`03-${testSlug}-editor-after-export.png`),
		});
	} finally {
		try {
			if (activeApp?.process().exitCode === null) {
				await forceTerminateElectronApp({ electronApp: activeApp });
			}
		} finally {
			await Promise.all([
				rm(outputPath, { force: true }),
				rm(profileDirectory, { recursive: true, force: true }),
			]);
		}
	}
}
